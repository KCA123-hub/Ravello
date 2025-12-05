// File: middleware/auth.js

const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ 
    // Pastikan path .env sama dengan di main.js
    path: path.resolve(__dirname, '..', '.env') 
});

const JWT_SECRET = process.env.JWT_SECRET;

const verifyToken = (req, res, next) => {
    // 1. Ambil Token dari Header (Authorization: Bearer <token>)
    const authHeader = req.headers['authorization'];
    // Cek apakah header ada, dan ambil string token setelah "Bearer "
    const token = authHeader && authHeader.split(' ')[1]; 

    if (token == null) {
        // Jika token tidak ada di header
        return res.status(401).send({ message: 'Akses ditolak. Token tidak ditemukan.' });
    }

    // 2. Verifikasi Token
   jwt.verify(token, JWT_SECRET, (err, decoded) => {
    // ...
    req.clientId = decoded.id; // 👈 ID diambil dari token
    console.log(`[DEBUG MIDDLEWARE] Token berhasil diekstrak. Menggunakan Client ID: ${decoded.id}`);
    next();
    
});
};

module.exports = verifyToken;