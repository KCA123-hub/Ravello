// File: routes/store.js

const express = require('express');
const router = express.Router();
// Import middleware verifikasi token
const verifyToken = require('../middleware/auth.js'); 

// Ekspor fungsi router yang menerima koneksi DB (con)
module.exports = (con) => {
    
    // 🚨 Endpoint POST yang Dilindungi Token
    // Kita sisipkan middleware verifyToken di sini!
    router.post('/', verifyToken, async (req, res) => {
        
        // 🚨 Ambil client_id dari req.clientId yang disuntikkan oleh middleware
        const client_id = req.clientId; 
        
        // Ambil data toko dari body
        const { store_name, description, address } = req.body;

        try {
            const existingStore = await con.query(
                'SELECT store_id FROM store WHERE client_id = $1',
                [client_id]
            );

            if (existingStore.rows.length > 0) {
                // Jika klien sudah memiliki toko, tolak permintaan
                return res.status(403).send({ 
                    success: false, 
                    message: "Akses ditolak: Anda hanya diperbolehkan mendaftar satu toko." 
            });
            
            }
            const insert_query = `
                INSERT INTO store (client_id, store_name, description, address) 
                VALUES ($1, $2, $3, $4) RETURNING store_id
            `;
            const values = [client_id, store_name, description, address];
            
            const result = await con.query(insert_query, values);
            const newStoreId = result.rows[0].store_id;

            res.status(201).send({ 
                success: true, 
                message: "Toko berhasil didaftarkan.",
                store_id: newStoreId,
                owner_id: client_id // Konfirmasi client_id diambil dari token
            });

        } catch (err) {
            console.error("Database Error (Store):", err.stack);
            res.status(500).send({
                success: false, 
                message: "Gagal membuat toko. Cek apakah client_id valid atau nama toko sudah ada."
            });
        }
    });

    return router;
};