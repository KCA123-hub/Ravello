// File: routes/order.js

const express = require('express');
const verifyToken = require('../middleware/auth'); 

module.exports = (con) => {
    const router = express.Router();

    router.post('/', verifyToken, async (req, res) => {
        const client_id = req.clientId;
        
        const { payment_method, orderItems, shipping_address } = req.body; 
        
        let client; // Dideklarasikan di luar try/catch
        let total_price = 0;
        const processedItems = []; 
        let clientAddressDefault = null;
        let finalShippingAddress = null;

        try {
            if (!orderItems || orderItems.length === 0) {
                return res.status(400).json({ message: 'Daftar produk pesanan (orderItems) wajib diisi.' });
            }
            if (!payment_method) {
                return res.status(400).json({ message: 'Metode pembayaran wajib diisi.' });
            }

            // 🚨 PERBAIKAN KRITIS: Pastikan client terkoneksi dengan benar HANYA SEKALI
            client = await con.connect(); // <--- Koneksi pertama
            await client.query('BEGIN');
            console.log(`[TRANSACTION] Dimulai untuk Client ID: ${client_id}`);
            
            // ... (Semua logic Validasi Alamat, Validasi Stok, INSERT Order, INSERT Detail, UPDATE Stok) ...

            // 1. Ambil alamat default client
            const clientResult = await client.query(
                `SELECT address FROM client WHERE client_id = $1`,
                [client_id]
            );

            clientAddressDefault = clientResult.rows[0]?.address;
            finalShippingAddress = shipping_address || clientAddressDefault;

            if (!finalShippingAddress) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    message: 'Alamat pengiriman wajib diisi. Mohon masukkan alamat atau lengkapi alamat default di profil Anda.' 
                });
            }

            // --- A. VALIDASI STOK & HITUNG TOTAL ---

            for (const item of orderItems) {
                const qty = item.quantity;
                
                // Ambil price, stock, dan store_id
                const productResult = await client.query(
                    `SELECT price, stock, store_id, product_name FROM product WHERE product_id = $1`,
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
                
                // Simpan semua data penting (termasuk product_name untuk log)
                processedItems.push({
                    product_id: item.product_id,
                    quantity: qty,
                    unit_price: unitPrice,
                    store_id: productData.store_id,
                    product_name: productData.product_name 
                });
            }

            // --- B. BUAT HEADER PESANAN (ORDER) ---
            
            const orderDate = new Date().toISOString();

            const orderResult = await client.query(
                `INSERT INTO "order" (client_id, order_date, total_price, status, shipping_address, payment_method)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING order_id, order_date`,
                [client_id, orderDate, total_price, 'waiting for payment', finalShippingAddress, payment_method]
            );
            
            const { order_id, order_date } = orderResult.rows[0];


            // --- C. BUAT DETAIL PESANAN & UPDATE STOK ---
            
            for (const item of processedItems) {
                // INSERT order_detail
                await client.query(
                    `INSERT INTO order_detail (order_id, product_id, quantity, unit_price, store_id)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [order_id, item.product_id, item.quantity, item.unit_price, item.store_id]
                );
                
                // UPDATE stok produk
                await client.query(
                    `UPDATE product SET stock = stock - $1 WHERE product_id = $2`,
                    [item.quantity, item.product_id]
                );
            }
            
            
            // 4. AKHIRI TRANSAKSI KRITIS (COMMIT)
            await client.query('COMMIT');
            console.log(`[TRANSACTION] Berhasil di COMMIT. Order ID: ${order_id}`);

            
            // --- D. LOGGING (BERJALAN SETELAH COMMIT) ---

            try {
                client = null;
                // 5. 🚨 LOG PEMBELI (CLient) - Log Penuh
                const buyerLogDetails = {
                    order_id: order_id,
                    order_date: order_date,
                    total_price: total_price,
                    shipping_address: finalShippingAddress,
                    items: processedItems.map(item => ({
                        product_id: item.product_id,
                        product_name: item.product_name,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        store_id: item.store_id
                    }))
                };
                
                /* // Placeholder: INSERT log untuk Pembeli (Client)
                await client.query(
                    `INSERT INTO client_log (client_id, order_id, summary) 
                     VALUES ($1, $2, $3)`, 
                    [client_id, order_id, JSON.stringify(buyerLogDetails)]
                );
                */
                console.log(`Log Pembeli untuk Order ${order_id} siap dicatat.`);


                // 6. 🚨 LOG PENJUAL (Store) - Pengelompokan Item Terjual
                
                // Kelompokkan item berdasarkan store_id
                const sellerLogGroups = {};
                for (const item of processedItems) {
                    if (!sellerLogGroups[item.store_id]) {
                        sellerLogGroups[item.store_id] = [];
                    }
                    // Hanya kirim data yang relevan untuk penjual: barang apa yang terjual
                    sellerLogGroups[item.store_id].push({
                        product_id: item.product_id,
                        product_name: item.product_name,
                        quantity_sold: item.quantity,
                        unit_price: item.unit_price
                    });
                }

                // Masukkan log untuk setiap penjual
                for (const storeId in sellerLogGroups) {
                    const logItems = sellerLogGroups[storeId];
                    
                    /*
                    // Placeholder: INSERT log untuk Penjual (Store Owner)
                    // Asumsi: Anda memiliki tabel Store yang bisa di-JOIN untuk mendapatkan Store Owner ID (user_id)
                    await client.query(
                        `INSERT INTO store_log (store_id, order_id, log_details) 
                         VALUES ($1, $2, $3)`, 
                        [storeId, order_id, JSON.stringify(logItems)]
                    );
                    */
                    console.log(`Log Penjual (Store ID: ${storeId}) untuk Order ${order_id} siap dicatat: ${logItems.length} item.`);
                }
                
            } catch (logError) {
                // Log GAGAL, tapi transaksi utama sudah commit, jadi hanya log error ini
                console.error("Pencatatan Log Gagal:", logError.message);
                // Lanjutkan ke respon sukses
            }
            
            
            // 7. Kirim Respon Sukses
            res.status(201).json({
                success: true,
                message: 'Pesanan berhasil dibuat. Menunggu pembayaran.',
                order_id: order_id,
                total_price: parseFloat(total_price).toFixed(2), 
                order_date: order_date,
                shipping_address: finalShippingAddress,
                status: 'waiting for payment'
            });

        } catch (err) {
            // 8. ROLLBACK jika ada kegagalan sebelum COMMIT
            // Cek apakah koneksi berhasil didapatkan sebelum mencoba ROLLBACK
            if (client) {
                await client.query('ROLLBACK');
                console.error(`[TRANSACTION] GAGAL, di ROLLBACK: ${err.message}`);
            }
            console.error('Order Creation Error:', err.stack);
            res.status(500).json({ message: 'Gagal membuat pesanan akibat kesalahan server/database.' });
        
        } finally {
            // 9. Pastikan koneksi dikembalikan ke pool
            // Cek apakah koneksi berhasil didapatkan sebelum mencoba RELEASE
            if (client) {
                client.release();
            }
        }
    });

    return router;
};