const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const uploadRoot = path.join(process.cwd(), "uploads", "requests");

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const allowedMime = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadRoot);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = allowedExtensions.has(ext) ? ext : ".jpg";
    const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!allowedExtensions.has(ext)) {
    return cb(new Error("Only jpg, jpeg, png, and webp images are allowed."));
  }
  if (file.mimetype && !allowedMime.has(file.mimetype)) {
    return cb(new Error("Invalid image type."));
  }
  return cb(null, true);
}

const upload = multer({
  storage,
  limits: {
    fileSize: 3 * 1024 * 1024,
  },
  fileFilter,
});

const uploadCustomerImages = upload.array("images", 5);
const uploadProofImages = upload.array("images", 5);

function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "Each image must be 3MB or smaller.",
      });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        message: "Unexpected file field. Use field name: images",
      });
    }
    return res.status(400).json({
      message: err.message || "Upload failed.",
    });
  }
  if (err) {
    return res.status(400).json({
      message: err.message || "File upload failed.",
    });
  }
  return next();
}

module.exports = {
  uploadCustomerImages,
  uploadProofImages,
  handleMulterError,
  REQUEST_UPLOAD_RELATIVE_DIR: "/uploads/requests",
};
