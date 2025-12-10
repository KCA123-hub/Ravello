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
            const action_flow = 'REGISTRATION';
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

            console.log(`➡️ [AUTH] OTP berhasil dikirim ke: ${email}. Kode: ${code}. Action Flow: ${action_flow}`);
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

    // --- ENDPOINT 3: PUT /client (Update Profil) ---
    router.put('/', verifyToken, async (req, res) => {
        const client_id = req.clientId; // dari middleware verifyToken
         // 🚨 PERBAIKAN 1: Tambahkan 'address' ke destructuring
        const { name, email, phone_number, bio, address } = req.body; 

        try {
         // 🚨 PERBAIKAN 2: Tambahkan 'address' ke validasi
         if (!name && !email && !phone_number && !bio && !address) { 
             return res.status(400).send({
                success: false,
                message: "Minimal satu data harus diubah."
             });
            }

             // 🚨 PERBAIKAN 3: Ambil data lama, termasuk 'address'
             const currentData = await con.query(
            'SELECT name, email, phone_number, bio, address FROM client WHERE client_id = $1',
             [client_id]
         );

            if (currentData.rows.length === 0) {
                return res.status(404).send({
                     success: false,
                     message: "Client tidak ditemukan."
            });
         }

         const oldData = currentData.rows[0];

            // 🚨 PERBAIKAN 4: Logic Defaulting untuk Address
            const finalName = name || oldData.name;
            const finalEmail = email ? email.toLowerCase() : oldData.email;
            const finalPhone = phone_number || oldData.phone_number;
            const finalBio = bio ?? oldData.bio; 
            const finalAddress = address || oldData.address; // 👈 Alamat baru/lama

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

            // 🚨 PERBAIKAN 5: Tambahkan 'address' ke Query UPDATE
             const updateQuery = `
             UPDATE client
                 SET name = $1,
                    email = $2,
                    phone_number = $3,
                    bio = $4,
                    address = $5  
                WHERE client_id = $6 
            RETURNING client_id, name, email, phone_number, bio, address
                 `;

            const values = [
                finalName,
                finalEmail,
                finalPhone,
                finalBio,
                finalAddress, // 👈 Nilai $5
                client_id    // 👈 Nilai $6
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