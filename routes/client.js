// File: routes/client.js

const express = require('express');
const router = express.Router();
const generateOtp = require('../utils/otp_generator'); 
const OTP_PURPOSES = require('../utils/otp_constants');
const nodemailer = require('nodemailer'); 
const path = require('path');
const jwt = require('jsonwebtoken');
const verifyToken = require('../middleware/auth');
const { hashPasswordScrypt } = require('../utils/auth_utils'); 

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') }); 

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const JWT_SECRET = process.env.JWT_SECRET;

module.exports = (con) => {
    
    // --- ENDPOINT 1: POST /client (Kirim OTP & Simpan Data Sementara) ---
    router.post('/', async (req, res) => {
        try {
            const { name, email, phone_number, password, role } = req.body;
            
            // Validasi input dasar
            if (!name || !email || !password) {
                return res.status(400).send({ success: false, message: "Nama, email, dan password wajib diisi." });
            }
            
            const standardizedEmail = email.toLowerCase(); // Normalisasi Email

            // Cek apakah email sudah terdaftar secara permanen
            const clientCheck = await con.query('SELECT client_id FROM client WHERE email = $1', [standardizedEmail]);
            if (clientCheck.rows.length > 0) {
                return res.status(409).send({ success: false, message: "Email sudah terdaftar." });
            }

            // Hapus data lama yang belum terpakai (membersihkan sisa kegagalan sebelumnya)
            const purpose = OTP_PURPOSES.REGISTRATION;
            await con.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [standardizedEmail, purpose]);
            await con.query('DELETE FROM temp_registration WHERE email = $1', [standardizedEmail]);


            // --- TAHAP I: SIMPAN DATA REGISTRASI SEMENTARA ---
            const finalPhone = phone_number || null;
            const finalRole = role || 'user';
            
            // 🚨 PERUBAHAN UTAMA: Password di-hash sebelum disimpan ke tabel sementara
            const hashedPassword = await hashPasswordScrypt(password); 
            // const finalPassword = password; // Logic plaintext dihapus

            const tempRegQuery = `INSERT INTO temp_registration (name, email, phone_number, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING temp_id`;
            const tempRegValues = [name, standardizedEmail, finalPhone, hashedPassword, finalRole]; // Menggunakan HASH
            const tempResult = await con.query(tempRegQuery, tempRegValues);
            const temp_reg_id = tempResult.rows[0].temp_id; 

            // --- TAHAP II: GENERATE & SIMPAN OTP ---
            const { code, expiresAt } = generateOtp();
            const TEMP_CLIENT_ID = null; 

            await con.query(
                `INSERT INTO otp_verification (email, otp, otp_expire, purpose, temp_reg_id) VALUES ($1, $2, $3, $4, $5)`,
                [standardizedEmail, code, expiresAt, purpose, temp_reg_id] 
            );

            // --- TAHAP III: KIRIM EMAIL ---
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: EMAIL_USER, pass: EMAIL_PASS },
            });
            
            await transporter.sendMail({
                from: `"Admin Ravello 😎" <${EMAIL_USER}>`,
                to: email,
                subject: 'Kode Verifikasi Akun Ravello Anda',
                html: `
                    <h2>Verifikasi Pendaftaran Akun</h2>
                    <p>Berikut adalah kode verifikasi Anda adalah:</p>
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
            console.error("Database/Nodemailer Error (Client OTP):", err.stack);
            if (err.code === '23505') { 
                return res.status(409).send({ success: false, message: "Email sudah terdaftar." });
            }
            res.status(500).send({
                success: false,
                message: "Gagal memproses registrasi.",
                error: err.message
            });
        }
    });
    
    // --- ENDPOINT 2: POST /client/verify-otp (Verifikasi & Finalisasi) ---
    router.post('/verify-otp', async (req, res) => {
        
        const { email, otp } = req.body; 
        const purpose = OTP_PURPOSES.REGISTRATION;
        const standardizedEmail = email.toLowerCase();


        try {
            // 1. Validasi Input Kritis
            if (!standardizedEmail || !otp) {
                return res.status(400).send({ success: false, message: "Email dan kode OTP wajib diisi." });
            }

            // 2. Cari Kode OTP yang Masih Aktif
            const otpResult = await con.query(
                `SELECT otp_expire, temp_reg_id FROM otp_verification 
                 WHERE email = $1 AND otp = $2 AND purpose = $3 
                 ORDER BY otp_expire DESC LIMIT 1`,
                [standardizedEmail, otp, purpose]
            );

            // Cek keberadaan baris
            if (otpResult.rows.length === 0) {
                return res.status(401).send({ success: false, message: "Kode OTP salah atau tidak ditemukan." });
            }
            const otpRow = otpResult.rows[0]; 
            
            // 3. Cek Kedaluwarsa
            const now = new Date();
            const expireTime = new Date(otpRow.otp_expire);

            if (now > expireTime) {
                // Hapus data sementara yang kedaluwarsa
                await con.query('DELETE FROM temp_registration WHERE temp_id = $1', [otpRow.temp_reg_id]);
                await con.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [standardizedEmail, purpose]);
                return res.status(401).send({ success: false, message: "Kode OTP telah kedaluwarsa. Silakan minta kode baru." });
            }

            // --- TAHAP FINALISASI AKUN ---

            // 4. Ambil data registrasi lengkap dari tabel sementara
            const tempRegistrationId = otpRow.temp_reg_id; 
            const tempRegResult = await con.query(
                'SELECT name, email, phone_number, password, role FROM temp_registration WHERE temp_id = $1',
                [tempRegistrationId]
            );
            const tempUserData = tempRegResult.rows[0];

            if (!tempUserData) {
                return res.status(500).send({ success: false, message: "Data registrasi sementara tidak ditemukan. Silakan coba mendaftar ulang." });
            }
            
            // 5. Masukkan Data ke Tabel client (Permanent)
            // CATATAN: tempUserData.password di sini sudah merupakan HASH yang aman.
            const insert_query = `INSERT INTO client (name, email, phone_number, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING client_id, name, email`;
            const values = [tempUserData.name, tempUserData.email, tempUserData.phone_number, tempUserData.password, tempUserData.role];

            const result = await con.query(insert_query, values);
            const newClientData = result.rows[0];
            
            // 6. Bersihkan data sementara (penting!)
            await con.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [standardizedEmail, purpose]);
            await con.query('DELETE FROM temp_registration WHERE temp_id = $1', [tempRegistrationId]);

            // 7. Auto-Login (Pembuatan Token)
            const payload = { 
                id: newClientData.client_id, 
                email: newClientData.email,
                name: newClientData.name
            };
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }); 


            console.log(`✅ [AUTH] Registrasi final berhasil untuk ID: ${newClientData.client_id}`);
            res.status(201).send({
                success: true,
                message: "Registrasi dan verifikasi berhasil! Akun Anda sudah aktif.",
                client_id: newClientData.client_id,
                token: token
            });

        } catch (err) {
            console.error("Database Error (OTP Verification):", err.stack);
            if (err.code === '23505') { 
                return res.status(409).send({ success: false, message: "Email sudah terdaftar." });
            }
            res.status(500).send({ success: false, message: "Gagal memproses verifikasi." });
        }
    });


    // --- ENDPOINT 3: PUT /client (Update Profil) ---
    router.put('/', verifyToken, async (req, res) => {
        const client_id = req.clientId; // dari middleware verifyToken
        const { name, email, phone_number, bio } = req.body; 

        try {
            if (!name && !email && !phone_number && !bio) { 
                return res.status(400).send({
                    success: false,
                    message: "Minimal satu data harus diubah."
                });
            }

            // Ambil data lama
            const currentData = await con.query(
                'SELECT name, email, phone_number, bio FROM client WHERE client_id = $1',
                [client_id]
            );

            if (currentData.rows.length === 0) {
                return res.status(404).send({
                    success: false,
                    message: "Client tidak ditemukan."
                });
            }

            const oldData = currentData.rows[0];

            // Cek jika password disertakan di body (untuk hashing jika perlu)
            const { password: new_password } = req.body;
            let hashedPassword = oldData.password; // Default ke hash lama

            if (new_password) {
                // 🚨 HASHING PASSWORD BARU
                hashedPassword = await hashPasswordScrypt(new_password); 
            }
            // ----------------------------------------------------

            const finalName = name || oldData.name;
            const finalEmail = email ? email.toLowerCase() : oldData.email;
            const finalPhone = phone_number || oldData.phone_number;
            const finalBio = bio ?? oldData.bio; 

            // Cek email jika diubah
            if (email && email !== oldData.email) {
                const emailCheck = await con.query(
                    'SELECT client_id FROM client WHERE email = $1',
                    [finalEmail]
                );
                if (emailCheck.rows.length > 0) {
                    return res.status(409).send({
                        success: false,
                        message: "Email sudah digunakan."
                    });
                }
            }

            const updateQuery = `
                UPDATE client
                SET name = $1,
                    email = $2,
                    phone_number = $3,
                    bio = $4,
                    password = $6  // 🚨 Tambahkan update password
                WHERE client_id = $5
                RETURNING client_id, name, email, phone_number, bio
            `;

            const values = [
                finalName,
                finalEmail,
                finalPhone,
                finalBio,
                client_id,
                hashedPassword // 🚨 Nilai hash baru/lama
            ];

            const result = await con.query(updateQuery, values);

            res.status(200).send({
                success: true,
                message: "Profil berhasil diperbarui.",
                data: result.rows[0]
            });

        } catch (err) {
            console.error("Database Error (Update Client):", err.stack);
            res.status(500).send({
                success: false,
                message: "Gagal memperbarui data client."
            });
        }
    });

    return router;
};