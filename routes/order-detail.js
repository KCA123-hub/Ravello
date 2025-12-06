// File: routes/order.js
const express = require('express');
const verifyToken = require('../middleware/auth'); 

module.exports = (con) => {
    const router = express.Router();

    router.post('/', verifyToken, async (req, res) => {
        const client_id = req.clientId;
        
        // 🚨 MODIFIKASI 1: shipping_address ditambahkan kembali ke destructuring req.body
        const { payment_method, orderItems, shipping_address } = req.body; 
        
        let client;
        let total_price = 0;
        const processedItems = []; 
        let clientAddressDefault = null; // Alamat default dari database
        let finalShippingAddress = null; // Alamat yang akan digunakan di pesanan

        try {
            if (!orderItems || orderItems.length === 0) {
                return res.status(400).json({ message: 'Daftar produk pesanan (orderItems) wajib diisi.' });
            }
            if (!payment_method) {
                return res.status(400).json({ message: 'Metode pembayaran wajib diisi.' });
            }

            client = await con.connect();
            await client.query('BEGIN');
            console.log(`[TRANSACTION] Dimulai untuk Client ID: ${client_id}`);

            // 1. Ambil alamat default client dari database
            const clientResult = await client.query(
                `SELECT address FROM client WHERE client_id = $1`,
                [client_id]
            );

            clientAddressDefault = clientResult.rows[0]?.address;

            // 2. 🚨 LOGIC PENENTUAN ALAMAT
            // Jika user mengirimkan alamat di body, gunakan alamat itu.
            // Jika tidak, gunakan alamat default dari database.
            finalShippingAddress = shipping_address || clientAddressDefault;

            // 3. Validasi Akhir: Pastikan ada alamat yang dipilih/ditemukan
            if (!finalShippingAddress) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    message: 'Alamat pengiriman wajib diisi. Mohon masukkan alamat atau lengkapi alamat default di profil Anda.' 
                });
            }

            // --- A. VALIDASI STOK & HITUNG TOTAL (Loop ini tidak berubah) ---

            for (const item of orderItems) {
                const qty = item.quantity;

                const productResult = await client.query(
                    `SELECT price, stock, store_id FROM product WHERE product_id = $1`,
                    [item.product_id]
                );

                const productData = productResult.rows[0];

                if (!productData) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ message: `Produk ID ${item.product_id} tidak ditemukan.` });
                }

                if (qty > productData.stock) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ 
                        message: `Stok produk ID ${item.product_id} tidak cukup. Tersisa: ${productData.stock}.` 
                    });
                }
                
                const unitPrice = Number(productData.price);
                total_price += unitPrice * qty;
                
                processedItems.push({
                    ...item,
                    unit_price: unitPrice,
                    store_id: productData.store_id
                });
            }

            // --- B. BUAT HEADER PESANAN (ORDER) ---
            
            const orderDate = new Date().toISOString();

            // 4. PENGGUNAAN ALAMAT: finalShippingAddress digunakan di sini
            const orderResult = await client.query(
                `INSERT INTO "order" (client_id, order_date, total_price, status, shipping_address, payment_method)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING order_id, order_date`,
                [client_id, orderDate, total_price, 'waiting for payment', finalShippingAddress, payment_method]
            );
            
            const { order_id, order_date } = orderResult.rows[0];


            // --- C. BUAT DETAIL PESANAN & UPDATE STOK (Loop ini tidak berubah) ---
            
            for (const item of processedItems) {
                await client.query(
                    `INSERT INTO order_detail (order_id, product_id, quantity, unit_price, store_id)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [order_id, item.product_id, item.quantity, item.unit_price, item.store_id]
                );
                
                await client.query(
                    `UPDATE product SET stock = stock - $1 WHERE product_id = $2`,
                    [item.quantity, item.product_id]
                );
            }
            
            
            // 5. AKHIRI TRANSAKSI (COMMIT)
            await client.query('COMMIT');
            console.log(`[TRANSACTION] Berhasil di COMMIT. Order ID: ${order_id}`);

            // 6. Kirim Respon Sukses
            res.status(201).json({
                success: true,
                message: 'Pesanan berhasil dibuat. Menunggu pembayaran.',
                order_id: order_id,
                total_price: parseFloat(total_price).toFixed(2), 
                order_date: order_date,
                shipping_address: finalShippingAddress, // Tampilkan alamat yang digunakan di respon
                status: 'waiting for payment'
            });

        } catch (err) {
            if (client) {
                await client.query('ROLLBACK');
                console.error(`[TRANSACTION] GAGAL, di ROLLBACK: ${err.message}`);
            }
            console.error('Order Creation Error:', err.stack);
            res.status(500).json({ message: 'Gagal membuat pesanan akibat kesalahan server/database.' });
        
        } finally {
            if (client) {
                client.release();
            }
        }
    });

    return router;
};