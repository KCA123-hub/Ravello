// File: config/login.js

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken'); 
const path = require('path');
// 🚨 TAMBAH: Import fungsi perbandingan Scrypt
const { comparePasswordScrypt } = require('./utils/auth_utils.js'); 

// --- PENTING: MENGATASI LOKASI .ENV ---
// Pastikan variabel lingkungan dimuat
require('dotenv').config({ 
    // Naik satu level dari 'config' ke root proyek
    path: path.resolve(__dirname, '..', '.env') 
}); 

const JWT_SECRET = process.env.JWT_SECRET;

// 🚨 Ekspor fungsi yang Menerima 'con'
module.exports = (con) => {
    
    // Guardrail JWT_SECRET 
    if (!JWT_SECRET) {
        throw new Error("FATAL ERROR: JWT_SECRET not defined.");
    }

    // Endpoint: POST /login (Diakses sebagai /auth/login)
    router.post('/login', async (req, res) => {

    const { email, password } = req.body;
    // 🚨 Normalisasi Email
    const standardizedEmail = email ? email.toLowerCase() : ''; 

        try {
            if (!standardizedEmail || !password) {
             return res.status(400).send({ success: false, message: 'Email dan password wajib diisi.' });
             }

            // 1. Cari pengguna di database (ambil hash password yang tersimpan)
            const clientResult = await con.query('SELECT client_id, name, password, email FROM client WHERE email = $1', [standardizedEmail]);
            const client = clientResult.rows[0];

            if (!client) {
                return res.status(401).send({ success: false, message: 'Email atau password salah.' });
             }

            // 2. Bandingkan Password (MENGGUNAKAN SCRYPT)
             const hashedPasswordDB = client.password; // Ambil hash (salt.hash) dari DB

             // 🚨 PERUBAHAN UTAMA: Gunakan comparePasswordScrypt
            // await digunakan karena comparePasswordScrypt mengembalikan Promise
            const passwordMatch = await comparePasswordScrypt(password, hashedPasswordDB);

            if (!passwordMatch) {
                return res.status(401).send({ success: false, message: 'Email atau password salah.' });
            }
            
            // 3. Buat Payload dan Tandatangani Token
             const payload = { 
                id: client.client_id, 
                 email: client.email,
                 name: client.name
            };
            console.log(`[DEBUG LOGIN] ID yang dimasukkan ke token: ${client.client_id}`);
             const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }); 

            // 4. Kirim Token
             res.status(200).send({
                success: true,
                message: 'Login berhasil.',
                 token: token,
                 client_id: client.client_id,
                 name: client.name, 
                email: client.email
            });

        } catch (error) {
            console.error("Login Error:", error.stack);
             res.status(500).send({ success: false, message: 'Terjadi kesalahan server internal.' });
        }
     });

     return router; // Kembalikan objek router
};