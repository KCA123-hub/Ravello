// File: routes/forgotPassword.js
const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const router = express.Router();

module.exports = (db) => {
  // Endpoint untuk request reset password
  router.post('/', async (req, res) => {
    const { email } = req.body;

    try {
      // Cek apakah email terdaftar
      const result = await db.query('SELECT * FROM client WHERE email = $1', [email]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Email tidak ditemukan' });
      }

      // Buat token unik
      const token = crypto.randomBytes(20).toString('hex');

      // Simpan token + waktu kedaluwarsa (1 jam)
      const expire = new Date(Date.now() + 3600000);
      await db.query('UPDATE client SET reset_token = $1, token_expire = $2 WHERE email = $3', [token, expire, email]);

      // Konfigurasi transport nodemailer
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          client: process.env.EMAIL_client,
          pass: process.env.EMAIL_pass,
        },
      });

      // Tautan reset password
      const resetLink = `http://localhost:${process.env.PORT}/reset-password/${token}`;

      // Kirim email
      await transporter.sendMail({
        from: `"Admin Ravello" <${process.env.EMAIL_client}>`,
        to: email,
        subject: 'Reset Password Anda',
        html: `
          <h2>Permintaan Reset Password</h2>
          <p>Klik tautan di bawah ini untuk mengatur ulang password Anda:</p>
          <a href="${resetLink}">${resetLink}</a>
          <p>Link ini akan kedaluwarsa dalam 1 jam.</p>
        `,
      });

      res.status(200).json({ message: 'Email reset password telah dikirim' });
    } catch (err) {
      console.error('Error:', err);
      res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
  });

  return router;
};
