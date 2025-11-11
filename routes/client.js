// File: routes/client.js

const express = require('express');
const router = express.Router();

// Ekspor fungsi router yang menerima koneksi DB (con) dari main.js
module.exports = (con) => {

    // Endpoint: POST /client (diakses sebagai /client)
    router.post('/', async (req, res) => {
        try {
            // Ambil data dari request body
            const { name, email, phone_number, password, role } = req.body;

            // Validasi input dasar
            if (!name || !email || !password) {
                return res.status(400).send({
                    success: false,
                    message: "Nama, email, dan password wajib diisi."
                });
            }

            // Gunakan default value jika tidak ada
            const finalPhone = phone_number || null;
            const finalRole = role || 'user';
            const finalPassword = password; // sementara tanpa hash

            // Query insert ke tabel client
            const insert_query = `
                INSERT INTO client (name, email, phone_number, password, role)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING client_id
            `;
            const values = [name, email, finalPhone, finalPassword, finalRole];

            const result = await con.query(insert_query, values);

            // Pastikan hasil query valid
            if (!result.rows || result.rows.length === 0) {
                return res.status(500).send({
                    success: false,
                    message: "Registrasi gagal: tidak ada data dikembalikan dari database."
                });
            }

            // Ambil ID klien baru
            const newClientId = result.rows[0].client_id;
            console.log(`➡️ [AUTH] Pengguna baru berhasil **Register**: ${name} (${email})`);
            // Kirim respons sukses
            res.status(201).send({
                success: true,
                message: "Registrasi berhasil.",
                client_id: newClientId
            });

        } catch (err) {
            console.error("Database Error (Client Registration):", err);

            // Tangani duplikasi email (unique constraint)
            if (err.code === '23505') {
                return res.status(409).send({
                    success: false,
                    message: "Email sudah terdaftar."
                });
            }

            // Tangani error umum lainnya
            res.status(500).send({
                success: false,
                message: "Gagal memproses registrasi.",
                error: err.message
            });
        }
    });

    return router;
};