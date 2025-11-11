// File: config/login.js

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
//const bcrypt = require('bcrypt'); 
const path = require('path');

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
    
    // 🚨 DEBUGGING SEMENTARA
    console.log("Request Body diterima:", req.body); 
    // Jika outputnya {}, maka header Content-Type Anda salah.
    // ---------------------------------

    const { email, password } = req.body;

        try {
            // 1. Cari pengguna di database
            const clientResult = await con.query('SELECT client_id, password, email FROM client WHERE email = $1', [email]);
            const client = clientResult.rows[0];
            
            if (!client) {
                return res.status(401).send({ success: false, message: 'Email atau password salah.' });
            }

            // 2. Bandingkan Password
            //const passwordMatch = await bcrypt.compare(password, client.password);
            const passwordMatch = (password === client.password);

            if (!passwordMatch) {
                return res.status(401).send({ success: false, message: 'Email atau password salah.' });
            }

            // 3. Buat Payload dan Tandatangani Token
            const payload = { 
                id: client.client_id, 
                email: client.email 
            };

            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }); 

            // 4. Kirim Token
            res.status(200).send({
                success: true,
                message: 'Login berhasil.',
                token: token,
                client_id: client.client_id
            });

        } catch (error) {
            console.error("Login Error:", error.stack);
            res.status(500).send({ success: false, message: 'Terjadi kesalahan server internal.' });
        }
    });

    return router; // Kembalikan objek router
};git 