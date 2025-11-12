// File: routes/forgotPassword.js
const express = require("express");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

module.exports = (con) => {
  const router = express.Router();

  // 1️⃣ Minta reset password (generate OTP)
  router.post("/request", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email wajib diisi." });

    try {
      // Cek apakah user terdaftar
      const result = await con.query("SELECT * FROM users WHERE email = $1", [email]);
      if (result.rows.length === 0)
        return res.status(404).json({ message: "Email tidak ditemukan." });

      // Buat OTP 6 digit
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 menit

      // Simpan ke database (kalau tabel otp belum ada, buat dulu)
      await con.query(
        "INSERT INTO password_reset (email, otp, expires_at) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET otp = $2, expires_at = $3",
        [email, otp, expires]
      );

      // Kirim email dengan nodemailer
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: `"Support App" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Kode Reset Password",
        text: `Kode OTP kamu adalah: ${otp}. Berlaku 10 menit.`,
      });

      res.json({ message: "OTP telah dikirim ke email kamu." });
    } catch (err) {
      console.error("Error forgot password:", err);
      res.status(500).json({ message: "Terjadi kesalahan server." });
    }
  });

  // 2️⃣ Verifikasi OTP dan ubah password
  router.post("/reset", async (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword)
      return res.status(400).json({ message: "Semua field wajib diisi." });

    try {
      const check = await con.query(
        "SELECT * FROM password_reset WHERE email = $1 AND otp = $2",
        [email, otp]
      );

      if (check.rows.length === 0)
        return res.status(400).json({ message: "OTP salah atau tidak ditemukan." });

      const data = check.rows[0];
      if (new Date() > data.expires_at)
        return res.status(400).json({ message: "OTP sudah kedaluwarsa." });

      // Update password user
      await con.query("UPDATE users SET password = $1 WHERE email = $2", [
        newPassword,
        email,
      ]);

      // Hapus OTP setelah digunakan
      await con.query("DELETE FROM password_reset WHERE email = $1", [email]);

      res.json({ message: "Password berhasil direset." });
    } catch (err) {
      console.error("Error reset password:", err);
      res.status(500).json({ message: "Terjadi kesalahan server." });
    }
  });

  return router;
};
