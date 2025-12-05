const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');

module.exports = (con) => {
    const router = express.Router();

    // ➤ Tambah item ke keranjang
   router.post('/', verifyToken, async (req, res) => {
    const client_id = req.clientId; // Dari JWT
    console.log(`[DEBUG CART] Menerima request untuk Client ID: ${client_id}`);
    const { product_id } = req.body; // Kuantitas diasumsikan selalu +1 per request

    try {
        // 1. Cek apakah item sudah ada di keranjang client ini
        const existingItem = await con.query(
            'SELECT cart_id, quantity FROM cart WHERE client_id = $1 AND product_id = $2',
            [client_id, product_id]
        );

        if (existingItem.rows.length > 0) {
            // 2. Jika sudah ada: UPDATE kuantitas
            const update = await con.query(
                'UPDATE cart SET quantity = quantity + 1 WHERE cart_id = $1 RETURNING cart_id',
                [existingItem.rows[0].cart_id]
            );
            res.status(200).json({ message: 'Kuantitas produk diperbarui di keranjang', cart_id: update.rows[0].cart_id });
        } else {
            // 3. Jika belum ada: INSERT baru dengan quantity = 1
            const insert = await con.query(
                `INSERT INTO cart (client_id, product_id, quantity, added_date)
                 VALUES ($1, $2, 1, NOW())
                 RETURNING cart_id`,
                [client_id, product_id]
            );
            res.status(201).json({ message: 'Produk berhasil dimasukkan ke keranjang', cart_id: insert.rows[0].cart_id });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});
    // ➤ Ambil keranjang berdasarkan client_id
    router.get('/', verifyToken, async (req, res) => { 
    const client_id = req.clientId;

        try {
            const cart = await con.query(
                `SELECT c.cart_id, c.added_date,
                        p.product_id, p.product_name, p.price
                 FROM cart c
                 JOIN product p ON c.product_id = p.product_id
                 WHERE c.client_id = $1
                 ORDER BY c.added_date DESC`,
                [client_id]
            );

            res.json(cart.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // ➤ Hapus item dari keranjang
    router.delete('/:cart_id', verifyToken, async (req, res) => {
    const { cart_id } = req.params;
    const client_id = req.clientId;
        try {
            const result = await con.query(
            'DELETE FROM cart WHERE cart_id = $1 AND client_id = $2',
            [cart_id, client_id]
        );
            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Item tidak ditemukan' });
            }

            res.json({ message: 'Item berhasil dihapus' });

        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    router.get('/summary', verifyToken, async (req, res) => {
    // client_id diambil dari Token JWT (keamanan)
    const client_id = req.clientId; 

    try {
        // Query untuk menghitung total kuantitas dan total harga
        const summary = await con.query(
            `SELECT 
                SUM(c.quantity * p.price) AS total_harga, 
                SUM(c.quantity) AS total_quantity 
             FROM cart c
             JOIN product p ON c.product_id = p.product_id
             WHERE c.client_id = $1`,
            [client_id]
        );

        const summaryData = summary.rows[0];

        // Cek jika keranjang kosong
        if (summaryData.total_quantity === null) {
             return res.status(200).json({ 
                message: "Keranjang kosong.", 
                total_harga: 0, 
                total_quantity: 0 
            });
        }
        
        // Mengembalikan hasil perhitungan
        res.json({
            total_harga: parseFloat(summaryData.total_harga).toFixed(2),
            total_quantity: parseInt(summaryData.total_quantity),
            message: "Ringkasan keranjang berhasil dihitung."
        });

      } catch (err) {
        console.error("Database Error (GET Cart Summary):", err.stack);
        res.status(500).json({ message: 'Server error' });
        }
    });

    return router;
};
