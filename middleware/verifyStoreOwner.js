// File: middleware/verifyStoreOwner.js

const verifyStoreOwner = (con) => {
    
    // Middleware yang mengembalikan fungsi asynchronous
    return async (req, res, next) => {
        
        // 1. Cek: Pastikan sudah lolos verifyToken (req.clientId sudah ada)
        const client_id = req.clientId;
        if (!client_id) {
            // Seharusnya ini tidak terjadi jika verifyToken dipanggil sebelumnya
            return res.status(401).json({ 
                success: false, 
                message: "Akses ditolak. Token tidak ditemukan atau tidak valid." 
            });
        }
        
        try {
            // 2. Query: Cari store_id berdasarkan client_id dari token
            const storeResult = await con.query(
                'SELECT store_id FROM store WHERE client_id = $1',
                [client_id]
            );

            // 3. Otorisasi: Cek apakah pengguna memiliki toko
            if (storeResult.rows.length === 0) {
                // Jika tidak ditemukan, akses ditolak
                return res.status(403).json({
                    success: false,
                    message: "Akses ditolak. Anda belum terdaftar sebagai pemilik toko."
                });
            }

            // 4. Attach ID: Ambil store_id dan pasang ke objek request
            req.storeId = storeResult.rows[0].store_id; 
            
            // Lanjutkan ke handler (e.g., router.get('/report', ...))
            next(); 

        } catch (error) {
            console.error('Middleware verifyStoreOwner Error:', error.stack);
            res.status(500).json({ success: false, message: "Kesalahan server saat memverifikasi kepemilikan toko." });
        }
    };
};

module.exports = verifyStoreOwner;