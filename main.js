const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ 
    path: path.resolve(__dirname, '.env') 
}); 

const app = express();
const PORT = process.env.PORT || 3000;

// --- PERBAIKAN PENTING UNTUK PROXY (NGROK) ---
// Memberitahu Express untuk memercayai header dari proxy (Ngrok). 
app.set('trust proxy', 1); 

// --- MIDDLEWARE WAJIB ---
app.use(cors());
app.use(express.json());

// --- PERBAIKAN: MIDDLEWARE LOGGING (Wajib diletakkan di awal) ---
// Middleware ini harus memunculkan log jika request melewati express.json()
app.use((req, res, next) => {
    // Log ini harus muncul bahkan jika request gagal di router.
    console.log(`[REQUEST LOG] ${req.method} ${req.url}`);
    if (req.method === 'POST') {
        console.log('Body received (DEBUG):', req.body); 
    }
    next();
});


// --- KONFIGURASI DATABASE ---
const con = new Pool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "postgres",
    port: process.env.DB_PORT || 5432,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

con.query('SELECT 1 + 1 AS result')
    .then(() => console.log("✅ Connected to PostgreSQL Pool successfully! 🎉"))
    .catch(err => {
        console.error("❌ Connection error to PostgreSQL. Please check DB credentials in .env:", err.stack);
        process.exit(1);
    });

// --- KONEKSI DATABASE ---
con.connect()
    .then(() => console.log("✅ Connected to PostgreSQL successfully! 🎉"))
    .catch(err => {
        console.error("❌ Connection error to PostgreSQL. Please check DB credentials in .env:", err.stack);
        process.exit(1);
    });

// --- DEBUGGING: ENDPOINT TEST POST PALING SEDERHANA ---
// Ini berada di atas semua router untuk memastikan endpoint ini pertama diproses.
app.post('/test-post', (req, res) => {
    console.log("!!! Request POST /test-post BERHASIL MENCAPAI SERVER !!!");
    console.log("Body diterima:", req.body);
    res.status(200).json({ status: "ok", message: "Test POST Berhasil! Blokir ada di router lain." });
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

const createResetRouter = require('./routes/forgotPassword'); // Ganti dengan nama file Anda
const resetRouter = createResetRouter(con); 
app.use('/', resetRouter);

const createCartRouter = require('./routes/cart');
const cartRouter = createCartRouter(con);
app.use('/cart', cartRouter);

const orderRouter = require('./routes/order'); // Pastikan path file benar
app.use('/order', orderRouter(con)); // 👈 PASTIKAN BASE PATH INI ADALAH '/order'

const createOrderRouter2 = require('./routes/order-detail');
const orderRouter2 = createOrderRouter2(con);
app.use('/order-detail', orderRouter2);

const createPaymentRouter = require('./routes/payment'); 
const paymentRouter = createPaymentRouter(con);
app.use('/payment', paymentRouter); // Base path /payment

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// --- START SERVER ---
app.listen(PORT, '0.0.0.0', () => {
    console.log('------------------------------------------------');
    console.log(`✅ Server is running on:   http://10.38.53.95:${PORT} 🚀`);
    console.log('------------------------------------------------');
});