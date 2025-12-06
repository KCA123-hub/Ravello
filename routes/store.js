const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/auth.js'); 


module.exports = (con) => {
    
    // --- ENDPOINT POST / (Buat Toko Baru) ---
    router.post('/', verifyToken, async (req, res) => {
        
       
        const client_id = req.clientId; 
        
        const { store_name, description, address } = req.body;

        try {
            // ... Logic Cek One-Store-Per-Client ...
            const existingStore = await con.query(
                'SELECT store_id FROM store WHERE client_id = $1',
                [client_id]
            );

            if (existingStore.rows.length > 0) {
                return res.status(403).send({ 
                    success: false, 
                    message: "Akses ditolak: Anda hanya diperbolehkan mendaftar satu toko." 
            });
            
            }
            // ... Logic Insert Toko dan Update Role ...
            const insert_query = `
                INSERT INTO store (client_id, store_name, description, address) 
                VALUES ($1, $2, $3, $4) RETURNING store_id
            `;
            const values = [client_id, store_name, description, address];
            
            const result = await con.query(insert_query, values);
            const newStoreId = result.rows[0].store_id;

            console.log(`[STORE] Toko baru berhasil dibuat. Store ID: ${newStoreId}, Owner ID: ${client_id}`);

            const updateRoleQuery = `
                UPDATE client 
                SET role = 'seller' 
                WHERE client_id = $1 AND role = 'user' 
                RETURNING client_id
            `;
            const updateResult = await con.query(updateRoleQuery, [client_id]);
            
            if (updateResult.rowCount > 0) {
                console.log(`🔄 [ROLE UPDATE] Client ID ${client_id} role diubah menjadi 'seller'.`);
            } else {
                console.log(`ℹ️ [ROLE SKIP] Client ID ${client_id} role tidak diubah (sudah 'seller' atau role lainnya).`);
            }

            res.status(201).send({ 
                success: true, 
                message: "Toko berhasil didaftarkan.",
                store_id: newStoreId,
                owner_id: client_id 
            });

        } catch (err) {
            console.error("Database Error (Store):", err.stack);
            res.status(500).send({
                success: false, 
                message: "Gagal membuat toko. Cek apakah client_id valid atau nama toko sudah ada."
            });
        }
    });


    // 🚨 ENDPOINT BARU: GET /store/:store_id (Lihat Detail Toko)
    router.get('/:store_id', async (req, res) => {
        const store_id = req.params.store_id; // ID toko dari URL

        try {
            // Ambil detail toko menggunakan JOIN untuk mendapatkan nama pemilik (client name)
            const storeQuery = `
                SELECT 
                    s.store_id, 
                    s.store_name, 
                    s.description, 
                    s.address, 
                    c.name AS owner_name,
                    c.client_id AS owner_id
                FROM store s
                JOIN client c ON s.client_id = c.client_id
                WHERE s.store_id = $1
            `;
            const result = await con.query(storeQuery, [store_id]);

            if (result.rows.length === 0) {
                return res.status(404).send({ success: false, message: "Toko tidak ditemukan." });
            }

            console.log(`✅ [STORE GET] Berhasil mengambil detail Toko ID ${store_id}.`);
            res.status(200).send({
                success: true,
                data: result.rows[0]
            });

        } catch (err) {
            console.error("Database Error (GET Store):", err.stack);
            res.status(500).send({
                success: false, 
                message: "Gagal mengambil data toko."
            });
        }
    });


    // --- ENDPOINT PUT /store/:store_id (Update Toko) ---
    router.put('/:store_id', verifyToken, async (req, res) => {
    // 1. Ambil ID dari Token dan URL
    const client_id = req.clientId; // ID pemilik dari JWT
    const store_id = req.params.store_id; // ID toko yang ingin diupdate dari URL
    
    // 2. Ambil data yang akan diupdate dari Body
    const { store_name, description, address } = req.body;

    try {
        // Validasi input dasar
        if (!store_name || !description || !address) {
            return res.status(400).send({ 
                success: false, 
                message: "Nama toko, deskripsi, dan alamat wajib diisi." 
            });
        }

        // --- TAHAP I: VERIFIKASI KEPEMILIKAN ---
        // Cek apakah client_id dari Token adalah pemilik sah dari store_id ini
        const checkOwnership = await con.query(
            'SELECT client_id FROM store WHERE store_id = $1 AND client_id = $2',
            [store_id, client_id]
        );

        if (checkOwnership.rows.length === 0) {
            // Jika toko tidak ditemukan ATAU tidak dimiliki oleh client ini
            return res.status(403).send({ 
                success: false, 
                message: "Akses ditolak. Toko tidak ditemukan atau Anda bukan pemilik sah." 
            });
        }

        // --- TAHAP II: EKSEKUSI UPDATE ---
        const updateQuery = `
            UPDATE store 
            SET store_name = $1, 
                description = $2, 
                address = $3
            WHERE store_id = $4
            RETURNING store_id, store_name
        `;
        const updateValues = [store_name, description, address, store_id];
        
        const result = await con.query(updateQuery, updateValues);

        if (result.rowCount === 0) {
            return res.status(404).send({ success: false, message: "Pembaruan gagal. Toko tidak ditemukan." });
        }

        console.log(`✅ [STORE UPDATE] Toko ID ${store_id} berhasil diupdate oleh Client ID ${client_id}.`);

        res.status(200).send({
            success: true,
            message: "Data toko berhasil diperbarui.",
            store_id: result.rows[0].store_id,
            new_name: result.rows[0].store_name
        });

    } catch (err) {
        console.error("Database Error (UPDATE Store):", err.stack);
        res.status(500).send({
            success: false, 
            message: "Terjadi kesalahan server saat pembaruan data."
        });
    }
});

    return router;
};