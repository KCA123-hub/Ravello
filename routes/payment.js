// File: routes/payment.js
const express = require('express');
const verifyToken = require('../middleware/auth'); 

module.exports = (con) => {
    const router = express.Router();

    // POST /payment/confirm 
    // Mengonfirmasi bahwa pembayaran telah dilakukan untuk order_id tertentu
    router.post('/confirm', verifyToken, async (req, res) => {
        const client_id = req.clientId;
        // Asumsi client mengirimkan order_id dan, opsional, payment_details (misalnya transaction ID)
        const { order_id, transaction_details } = req.body; 

        if (!order_id) {
            return res.status(400).json({ message: 'Order ID wajib diisi untuk konfirmasi pembayaran.' });
        }

        let client;

        try {
            client = await con.connect();
            await client.query('BEGIN');

            // 1. Verifikasi Kepemilikan dan Status Order
            const orderResult = await client.query(
                `SELECT status, total_price FROM "order" 
                 WHERE order_id = $1 AND client_id = $2`,
                [order_id, client_id]
            );

            if (orderResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'Pesanan tidak ditemukan atau bukan milik Anda.' });
            }

            const currentStatus = orderResult.rows[0].status;
            
            // Cek jika status sudah dibayar atau selesai
            if (currentStatus === 'paid' || currentStatus === 'completed') {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: `Pesanan ID ${order_id} sudah diproses atau dibayar.` });
            }
            
            // 2. Update Status Pesanan menjadi 'paid'
            // Kita pindahkan status dari 'waiting for payment' -> 'paid'
            await client.query(
                `UPDATE "order" SET status = $1, payment_date = NOW() WHERE order_id = $2`,
                ['paid', order_id]
            );

            // 3. 🚨 OPSI: Simpan Detail Transaksi (Opsional, tergantung skema payment)
            // Jika Anda memiliki tabel 'payment' untuk menyimpan bukti transfer/ID transaksi
            /*
            const transactionQuery = `
                INSERT INTO payment (order_id, amount, payment_details, client_id)
                VALUES ($1, $2, $3, $4)`;
            await client.query(transactionQuery, [
                order_id, 
                orderResult.rows[0].total_price, 
                transaction_details || 'Confirmed manually',
                client_id
            ]);
            */
            
            // 4. COMMIT Transaksi
            await client.query('COMMIT');
            
            console.log(`✅ [PAYMENT] Order ID ${order_id} berhasil dikonfirmasi dan status diubah menjadi 'paid'.`);

            res.status(200).json({
                success: true,
                message: 'Konfirmasi pembayaran berhasil. Pesanan Anda akan segera diproses.',
                order_id: order_id,
                new_status: 'paid'
            });

        } catch (err) {
            if (client) {
                await client.query('ROLLBACK');
            }
            console.error('Payment Confirmation Error:', err.stack);
            res.status(500).json({ message: 'Gagal memproses konfirmasi pembayaran.' });
        } finally {
            if (client) {
                client.release();
            }
        }
    });

    return router;
};