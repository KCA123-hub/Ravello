const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth'); 
const upload = require('../middleware/upload');

module.exports = (con) => {

   
     router.post('/', verifyToken, upload.single('image'), async (req, res) => {
        
      
        const client_id = req.clientId; 
        
    
        const { product_name, description, price, stock, category_id } = req.body;
        const image = req.file ? `/uploads/${req.file.filename}` : null;
        
        console.log(req.body);
        console.log(req.file);
        
        try {
         
            if (!product_name || !price || !category_id || stock == null) {
                return res.status(400).send({ success: false, message: "Nama, harga, stok, dan category_id wajib diisi." });
            }

          
            const storeResult = await con.query(
                'SELECT store_id FROM store WHERE client_id = $1',
                [client_id]
            );

            if (storeResult.rows.length === 0) {
                return res.status(403).send({ success: false, message: "Akses ditolak. Anda harus memiliki toko untuk menambahkan produk." });
            }
            
            const store_id = storeResult.rows[0].store_id;

            const insert_query = `
                INSERT INTO product
                (store_id, category_id, product_name, price, stock, description, image_url)
                VALUES ($1, $2, $3, $4, $5, $6, $7) 
                RETURNING product_id, store_id
            `;
            const values = [store_id, category_id, product_name, price, stock, description, image];

            const result = await con.query(insert_query, values);
            const newProductId = result.rows[0].product_id;

            res.status(201).send({ 
                success: true, 
                message: "Produk berhasil ditambahkan.",
                product_id: newProductId,
                store_id: store_id,
                image_url: image
            });

        } catch (err) {
            console.error("Database Error (Product Post):", err.stack);
            
            if (err.code === '23503') {
                return res.status(400).send({ success: false, message: "category_id atau store_id tidak valid (Foreign Key violation)." });
            }

            res.status(500).send({ success: false, message: "Gagal memproses produk." });
        }
    });

    router.get('/', async (req, res) => {
    try {
        // Query untuk mengambil semua kolom dari tabel product
        const result = await con.query(
            `SELECT 
          p.product_id,
          p.product_name,
          p.description,
          p.price,
          p.stock,
          p.category_id,
          p.image_url,
          s.store_name,
          p.store_id
        FROM product p
        JOIN store s ON p.store_id = s.store_id
        ORDER BY p.product_id DESC` // Produk terbaru di atas
        );

        if (result.rows.length === 0) {
            return res.status(404).send({ 
                success: false, 
                message: "Belum ada produk yang terdaftar." 
            });
        }

        console.log(`✅ [PRODUCT GET] Berhasil mengambil ${result.rows.length} produk.`);
        res.status(200).json({
            success: true,
            products: result.rows 
        });

    } catch (err) {
        console.error("Database Error (GET Product):", err.stack);
        res.status(500).send({ 
            success: false, 
            message: "Gagal mengambil data produk." 
        });
    }
});

    return router;
};