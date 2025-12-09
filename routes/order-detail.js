const express = require('express');
// 🚨 PERBAIKAN 1: Import middleware verifikasi
const verifyToken = require('../middleware/auth'); 

module.exports = (con) => {
    const router = express.Router();

    // 🚨 PERBAIKAN 2: Sisipkan middleware verifyToken di sini!
    router.post('/', verifyToken, async (req, res) => {
        
        // 🚨 PERBAIKAN 3: client_id diambil dari Token, HAPUS dari req.body destructuring
        const { product_id, quantity } = req.body;
        const client_id = req.clientId; // 👈 AMBIL DARI TOKEN JWT

        // Validasi input (client_id dihapus dari validasi karena sudah terjamin oleh JWT)
        if (!product_id || !quantity) {
            return res.status(400).json({
                message: 'product_id dan quantity wajib diisi'
            });
        }

        if (quantity <= 0) {
            return res.status(400).json({
                message: 'quantity harus lebih dari 0'
            });
        }

        try {
            // Ambil data produk dari database
            const productResult = await con.query(
                `SELECT product_id, product_name, price
                 FROM product
                 WHERE product_id = $1`,
                [product_id]
            );

            if (productResult.rows.length === 0) {
                return res.status(404).json({ message: 'Produk tidak ditemukan' });
            }

            const product = productResult.rows[0];

            
            const unitPrice = Number(product.price);
            const qty = Number(quantity);
            const totalPrice = unitPrice * qty;


            // Respon akhir tetap sama
            return res.status(200).json({
                client_id, // Menggunakan client_id yang aman dari Token
                product_id: product.product_id,
                product_name: product.product_name,
                unit_price: unitPrice,
                quantity: qty,
                total_price: totalPrice
            });

        } catch (err) {
            console.error('Error in /order-detail:', err);
            return res.status(500).json({ message: 'Server error' });
        }
    });

    return router;
};