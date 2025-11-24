// File: routes/client.js

const express = require('express');
const router = express.Router();
const generateOtp = require('../utils/otp_generator'); 
const OTP_PURPOSES = require('../utils/otp_constants');
const nodemailer = require('nodemailer'); 
const path = require('path');

// Memuat .env secara eksplisit untuk Nodemailer
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') }); 

// Gunakan variabel ENV dari proses
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

module.exports = (con) => {
    
    // --- ENDPOINT 1: POST /client (Kirim OTP) ---
    router.post('/', async (req, res) => {
        try {
            const { name, email, phone_number, password, role } = req.body;
            
            // Validasi input dasar
            if (!name || !email || !password) {
                return res.status(400).send({ success: false, message: "Nama, email, dan password wajib diisi." });
            }

            // Cek apakah email sudah terdaftar secara permanen
            const clientCheck = await con.query('SELECT client_id FROM client WHERE email = $1', [email]);
            if (clientCheck.rows.length > 0) {
                 return res.status(409).send({ success: false, message: "Email sudah terdaftar." });
            }

            // Hapus OTP lama yang belum terpakai untuk email ini
            const purpose = OTP_PURPOSES.REGISTRATION;
            await con.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [email, purpose]);

            // --- GENERATE & SIMPAN OTP ---
            const { code, expiresAt } = generateOtp();
            const TEMP_CLIENT_ID = null; 

            // Simpan data OTP ke tabel otp_verification
            await con.query(
                `INSERT INTO otp_verification (client_id, email, otp_code, otp_expire, purpose) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [TEMP_CLIENT_ID, email, code, expiresAt, purpose] 
            );

            // --- KIRIM EMAIL ---
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: EMAIL_USER, pass: EMAIL_PASS },
            });
            
            await transporter.sendMail({
                from: `"Admin Ravello" <${EMAIL_USER}>`,
                to: email,
                subject: 'Kode Verifikasi Akun Marketplace Anda',
                html: `
                    <h2>Verifikasi Pendaftaran</h2>
                    <p>Terima kasih telah mendaftar. Kode verifikasi Anda adalah:</p>
                    <h3 style="color: #124170;">${code}</h3>
                    <p>Kode ini akan kedaluwarsa dalam 5 menit. Segera masukkan kode ini di aplikasi Anda.</p>
                `,
            });

            console.log(`➡️ [AUTH] OTP berhasil dikirim ke: ${email}. Kode: ${code}`);
            res.status(200).send({
                success: true,
                message: "OTP telah dikirim ke email Anda. Kedaluwarsa dalam 5 menit."
            });

        } catch (err) {
            console.error("Database/Nodemailer Error (Client OTP):", err);
            res.status(500).send({
                success: false,
                message: "Gagal memproses registrasi.",
                error: err.message
            });
        }
    });
    
    // --- ENDPOINT 2: POST /client/verify-otp (Verifikasi & Finalisasi) ---
    router.post('/verify-otp', async (req, res) => {
        // Asumsikan frontend mengirim ulang SEMUA data pendaftaran + otp_code
        const { name, email, phone_number, password, role, otp_code } = req.body;
        const purpose = OTP_PURPOSES.REGISTRATION;

        try {
            // 1. Validasi Input Kritis
            if (!email || !otp_code || !name || !password) {
                return res.status(400).send({ success: false, message: "Data registrasi atau kode OTP tidak lengkap." });
            }

            // 2. Cari Kode OTP yang Masih Aktif
            const otpResult = await con.query(
                `SELECT otp_expire FROM otp_verification 
                 WHERE email = $1 AND otp_code = $2 AND purpose = $3 
                 ORDER BY otp_expire DESC LIMIT 1`,
                [email, otp_code, purpose]
            );

            const otpRow = otpResult.rows[0];

            if (!otpRow) {
                return res.status(401).send({ success: false, message: "Kode OTP salah atau tidak ditemukan." });
            }
            
            // 3. Cek Kedaluwarsa
            const now = new Date();
            const expireTime = new Date(otpRow.otp_expire);

            if (now > expireTime) {
                await con.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [email, purpose]);
                return res.status(401).send({ success: false, message: "Kode OTP telah kedaluwarsa. Silakan minta kode baru." });
            }

            // --- TAHAP FINALISASI AKUN ---

            // 4. Masukkan Data ke Tabel client (Transaksional)
            const finalPhone = phone_number || null;
            const finalRole = role || 'user';
            
            // 🚨 PERINGATAN: Menggunakan password plaintext di sini. Ganti dengan password yang di-hash!
            const insert_query = `
                INSERT INTO client (name, email, phone_number, password, role) 
                VALUES ($1, $2, $3, $4, $5) 
                RETURNING client_id
            `;
            const values = [name, email, finalPhone, password, finalRole];

            const result = await con.query(insert_query, values);
            const newClientId = result.rows[0].client_id;
            
            // 5. Hapus Kode OTP setelah berhasil digunakan
            await con.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [email, purpose]);

            console.log(`✅ [AUTH] Registrasi final berhasil untuk ID: ${newClientId}`);
            res.status(201).send({
                success: true,
                message: "Registrasi dan verifikasi berhasil! Akun Anda sudah aktif.",
                client_id: newClientId
            });

        } catch (err) {
            console.error("Database Error (OTP Verification):", err);
            if (err.code === '23505') { // Tangani duplikasi email
                return res.status(409).send({ success: false, message: "Email sudah terdaftar." });
            }
            res.status(500).send({ success: false, message: "Gagal memproses verifikasi." });
        }
    });

    return router;
};