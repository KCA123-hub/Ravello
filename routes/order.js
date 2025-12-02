// File: routes/order.js
const express = require('express');

module.exports = (con) => {
    const router = express.Router();

    
    router.post('/detail', async (req, res) => {
        const { client_id, product_id, quantity } = req.body;

        // Validasi input
        if (!client_id || !product_id || !quantity) {
            return res.status(400).json({
                message: 'client_id, product_id, dan quantity wajib diisi'
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


            return res.status(200).json({
                client_id,
                product_id: product.product_id,
                product_name: product.product_name,
                unit_price: unitPrice,
                quantity: qty,
                total_price: totalPrice
            });

        } catch (err) {
            console.error('Error in /order/detail:', err);
            return res.status(500).json({ message: 'Server error' });
        }
    });

    return router;
};
