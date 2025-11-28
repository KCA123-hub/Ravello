const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpg|jpeg|png/;
    const ext = allowed.test(
      path.extname(file.originalname).toLowerCase()
    );
    if (ext) {
      cb(null, true);
    } else {
      cb(new Error('Hanya gambar JPG, JPEG, PNG yang diizinkan'));
    }
  }
});

module.exports = upload;
