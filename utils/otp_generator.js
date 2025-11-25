const ONE_TIME_LIMIT_MS = 5 * 60 * 1000; 

/**
 * Menghasilkan kode OTP 6 digit dan waktu kedaluwarsa 5 menit.
 * @returns {{code: string, expiresAt: Date}}
 */
function generateOtp() {
    // Menghasilkan angka acak 6 digit (100000 hingga 999999)
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Menghitung waktu kedaluwarsa (Waktu Sekarang + 5 Menit)
    const expiresAt = new Date(Date.now() + ONE_TIME_LIMIT_MS);

    return { 
        code: code, 
        expiresAt: expiresAt 
    };
}

module.exports = generateOtp;