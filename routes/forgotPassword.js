const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken'); 
const nodemailer = require('nodemailer'); 
const generateOtp = require('../utils/otp_generator'); 
const OTP_PURPOSES = require('../utils/otp_constants');
const path = require('path');


require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') }); 

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const JWT_SECRET = process.env.JWT_SECRET;
const APP_PORT = process.env.PORT || 3000;

module.exports = (con) => {
    

    router.post('/forgot-password', async (req, res) => {
        const { email } = req.body;
        const standardizedEmail = email ? email.toLowerCase() : '';
        const purpose = OTP_PURPOSES.PASSWORD_RESET;

        console.log(`\n🔵 [START] Request FORGOT PASSWORD untuk email: ${email}`);

        try {
            if (!standardizedEmail) {
                return res.status(400).send({ success: false, message: "Email wajib diisi." });
            }

           
            const clientCheck = await con.query('SELECT client_id FROM client WHERE email = $1', [standardizedEmail]);
            
            if (clientCheck.rows.length === 0) {
                console.log(`   -> ⚠️ GAGAL: Email ${email} tidak terdaftar.`);
                return res.status(200).json({ success: true, message: 'Email tidak terdaftar.' });
            }

            
            await con.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [standardizedEmail, purpose]);

           
            const { code, expiresAt } = generateOtp();
            const TEMP_REG_ID = null; 

           
            await con.query(
                `INSERT INTO otp_verification (email, otp_code, otp_expire, purpose, temp_reg_id) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [standardizedEmail, code, expiresAt, purpose, TEMP_REG_ID] 
            );

           
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: EMAIL_USER, pass: EMAIL_PASS },
            });

            await transporter.sendMail({
                from: `"Admin Ravello 😎" <${EMAIL_USER}>`,
                to: standardizedEmail,
                subject: 'Kode Reset Password Akun Anda',
                html: `
                    <h2>Kode Reset Password</h2>
                    <p>Kode OTP Anda adalah: <b>${code}</b></p>
                    <p>Kode ini akan kedaluwarsa dalam 5 menit. Masukkan kode ini di aplikasi Anda untuk melanjutkan.</p>
                `,
            });
            console.log(`   -> Success: Email OTP dikirim ke ${standardizedEmail}.`);
            res.status(200).json({ success: true, message: 'Kode reset password telah dikirim.' });

        } catch (err) {
            console.error("Forgot Password Error:", err.stack);
            res.status(500).send({ success: false, message: "Gagal memproses permintaan reset password." });
        }
    });
    
    
    router.post('/verify-reset-otp', async (req, res) => {
        const { email, otp_code } = req.body;
        const standardizedEmail = email ? email.toLowerCase() : '';
        const purpose = OTP_PURPOSES.PASSWORD_RESET;

        try {
            if (!standardizedEmail || !otp_code) {
                return res.status(400).send({ success: false, message: "Email dan kode OTP wajib diisi." });
            }
            
           
            const otpResult = await con.query(
                `SELECT otp_expire FROM otp_verification 
                 WHERE email = $1 AND otp_code = $2 AND purpose = $3 
                 ORDER BY otp_expire DESC LIMIT 1`,
                [standardizedEmail, otp_code, purpose]
            );

            if (otpResult.rows.length === 0) {
                console.log("   -> ⚠️ GAGAL: Kode OTP salah.");
                return res.status(401).send({ success: false, message: "Kode OTP salah." });
            }
            const otpRow = otpResult.rows[0]; 

            
            if (new Date() > new Date(otpRow.otp_expire)) {
                await con.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [standardizedEmail, purpose]);
                console.log("   -> ⚠️ GAGAL: Kode OTP sudah kadaluwarsa.");
                return res.status(401).send({ success: false, message: "Kode OTP telah kedaluwarsa. Silakan minta kode baru." });
            }

           
            await con.query('DELETE FROM otp_verification WHERE email = $1 AND purpose = $2', [standardizedEmail, purpose]);
            
            
            res.status(200).send({
                success: true,
                message: "Verifikasi berhasil. Lanjutkan untuk mengatur password baru.",
                email: standardizedEmail 
            });

        } catch (err) {
            console.error("Verify Reset OTP Error:", err.stack);
            res.status(500).send({ success: false, message: "Gagal memproses verifikasi." });
        }
    });
    
    
    router.post('/reset-password', async (req, res) => {
        const { email, new_password } = req.body;
        const standardizedEmail = email ? email.toLowerCase() : '';
        console.log(`\n🔵 [START] Request RESET PASSWORD untuk email: ${email}`);
        try {
            if (!standardizedEmail || !new_password) {
                return res.status(400).send({ success: false, message: "Email dan password baru wajib diisi." });
            }
            
           
            const updateResult = await con.query(
                'UPDATE client SET password = $1 WHERE email = $2 RETURNING client_id',
                [new_password, standardizedEmail]
            );

            if (updateResult.rows.length === 0) {
                console.log(`   -> ⚠️ GAGAL: Pengguna ${standardizedEmail} tidak ditemukan .`);
                 return res.status(404).send({ success: false, message: "Pengguna tidak ditemukan." });
            }

            console.log(`✅ [AUTH] Password berhasil direset untuk email: ${standardizedEmail}`);
            res.status(200).send({
                success: true,
                message: "Password berhasil direset. Silakan login dengan password baru Anda."
            });

        } catch (err) {
            console.error("Reset Password Error:", err.stack);
            res.status(500).send({ success: false, message: "Gagal memproses reset password." });
        }
    });

    return router;
};