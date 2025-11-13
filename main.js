// File: main.js

const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ 
    path: path.resolve(__dirname, '.env') 
}); 

const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- KONFIGURASI DATABASE ---
const con = new Client({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "postgres",
    port: process.env.DB_PORT || 5432,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

// --- KONEKSI DATABASE ---
con.connect()
    .then(() => console.log("✅ Connected to PostgreSQL successfully! 🎉"))
    .catch(err => {
        console.error("❌ Connection error to PostgreSQL. Please check DB credentials in .env:", err.stack);
        process.exit(1);
    });

// --- IMPORT DAN MOUNT ROUTER ---
const createClientRouter = require('./routes/client');
const clientRouter = createClientRouter(con);
app.use('/postClient', clientRouter);

const createAuthRouter = require('./login');
const authRouter = createAuthRouter(con);
app.use('/auth', authRouter);

const createStoreRouter = require('./routes/store');
const storeRouter = createStoreRouter(con);
app.use('/store', storeRouter);

const createProductRouter = require('./routes/product');
const productRouter = createProductRouter(con); 
app.use('/product', productRouter);

const createForgotPasswordRouter = require('./routes/forgotPassword');
const forgotPasswordRouter = createForgotPasswordRouter(con);
app.use('/forgot-password', forgotPasswordRouter);

app.use('/store', storeRouter);


// --- START SERVER ---
app.listen(PORT, '0.0.0.0', () => {
    console.log('------------------------------------------------');
    console.log(`✅ Server is running on:   http://10.38.53.95:${PORT} 🚀`);
    console.log('------------------------------------------------');
    console.log('📍 Available Endpoints:');
    console.log(`🔐 Login:          POST http://10.38.53.95:${PORT}/auth/login`);
    console.log(`📝 Register:       POST http://10.38.53.95:${PORT}/auth/register`);
    console.log(`🛒 Store:          GET  http://10.38.53.95:${PORT}/store`);
    console.log(`👥 Client:         POST http://10.38.53.95:${PORT}/postClient`);
    console.log(`🔁 Forgot Password:`);
    console.log(`   ├─ Request OTP: POST http://10.38.53.95:${PORT}/forgot-password/request-otp`);
    console.log(`   ├─ Verify OTP:  POST http://10.38.53.95:${PORT}/forgot-password/verify-otp`);
    console.log(`   └─ Reset Pass:  POST http://10.38.53.95:${PORT}/forgot-password/reset-password`);
    console.log('------------------------------------------------');
});
