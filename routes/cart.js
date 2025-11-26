const express = require('express');

module.exports = (con) => {
    const router = express.Router();

    // ➤ Tambah item ke keranjang
    router.post('/', async (req, res) => {
        const { client_id, product_id } = req.body;

        if (!client_id || !product_id) {
            return res.status(400).json({ message: 'client_id dan product_id wajib diisi' });
        }

        try {
            // Cek client
            const clientCheck = await con.query(
                'SELECT client_id FROM client WHERE client_id = $1',
                [client_id]
            );
            if (clientCheck.rows.length === 0) {
                return res.status(404).json({ message: 'Client tidak ditemukan' });
            }

            // Cek produk
            const productCheck = await con.query(
                'SELECT product_id FROM product WHERE product_id = $1',
                [product_id]
            );
            if (productCheck.rows.length === 0) {
                return res.status(404).json({ message: 'Produk tidak ditemukan' });
            }

            // Insert ke keranjang
            const insert = await con.query(
                `INSERT INTO cart (client_id, product_id, added_date)
                 VALUES ($1, $2, NOW())
                 RETURNING cart_id`,
                [client_id, product_id]
            );

            res.status(201).json({
                message: 'Produk berhasil dimasukkan ke keranjang',
                cart_id: insert.rows[0].cart_id
            });

        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // ➤ Ambil keranjang berdasarkan client_id
    router.get('/:client_id', async (req, res) => {
        const { client_id } = req.params;

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
    router.delete('/:client_id/:cart_id', async (req, res) => {
        const { client_id, cart_id } = req.params;

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

    return router;
};
