const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth'); 


module.exports = (con) => {

   
    router.post('/', verifyToken, async (req, res) => {
        
      
        const client_id = req.clientId; 
        
    
        const { product_name, description, price, stock, category_id } = req.body;
        console.log(req.body);
        
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
                INSERT INTO product (store_id, category_id, product_name, price, stock, description) 
                VALUES ($1, $2, $3, $4, $5, $6) 
                RETURNING product_id, store_id
            `;
            const values = [store_id, category_id, product_name, price, stock, description];

            const result = await con.query(insert_query, values);
            const newProductId = result.rows[0].product_id;

            res.status(201).send({ 
                success: true, 
                message: "Produk berhasil ditambahkan.",
                product_id: newProductId,
                store_id: store_id
            });

        } catch (err) {
            console.error("Database Error (Product Post):", err.stack);
            
            if (err.code === '23503') {
                return res.status(400).send({ success: false, message: "category_id atau store_id tidak valid (Foreign Key violation)." });
            }

            res.status(500).send({ success: false, message: "Gagal memproses produk." });
        }
    });

    return router;
};