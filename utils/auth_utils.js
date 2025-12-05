// File: utils/auth_utils.js

const crypto = require('crypto');
// Catatan: Karena Anda sebelumnya menggunakan 'bcryptjs', saya akan mengimplementasikan
// ulang menggunakan Scrypt (native crypto) yang lebih sederhana.

// Parameter Scrypt (biaya komputasi)
const SCYPT_PARAMS = {
    N: 16384, // Cost factor
    r: 8,     
    p: 1,     
    keylen: 32 
};

/**
 * Menghasilkan hash Scrypt untuk password (Digunakan saat Register/Reset)
 */
function hashPasswordScrypt(password) {
    return new Promise((resolve, reject) => {
        crypto.randomBytes(16, (err, salt) => {
            if (err) return reject(err);

            crypto.scrypt(password, salt, SCYPT_PARAMS.keylen, SCYPT_PARAMS, (err, hash) => {
                if (err) return reject(err);

                // Format: <salt>.<hash>
                const combined = salt.toString('base64') + '.' + hash.toString('base64');
                resolve(combined);
            });
        });
    });
}

/**
 * Membandingkan password mentah dengan hash yang tersimpan (Digunakan saat Login)
 */
function comparePasswordScrypt(password, combinedHash) {
    return new Promise((resolve, reject) => {
        const [saltBase64, originalHashBase64] = combinedHash.split('.');
        
        if (!saltBase64 || !originalHashBase64) {
            return resolve(false); 
        }

        const salt = Buffer.from(saltBase64, 'base64');
        
        crypto.scrypt(password, salt, SCYPT_PARAMS.keylen, SCYPT_PARAMS, (err, hash) => {
            if (err) return reject(err);

            const newHashBase64 = hash.toString('base64');
            resolve(newHashBase64 === originalHashBase64);
        });
    });
}

module.exports = { 
    hashPasswordScrypt, 
    comparePasswordScrypt 
};