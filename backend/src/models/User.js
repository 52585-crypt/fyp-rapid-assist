const mongoose = require("mongoose");
const crypto = require("crypto");

const ROLES = ["user", "mechanic"];
const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"];

function normalizePhone(phone) {
  if (!phone) return phone;
  return String(phone).trim();
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPasswordHash(password, passwordHash) {
  if (!passwordHash || typeof passwordHash !== "string") return false;
  const [salt, storedHash] = passwordHash.split(":");
  if (!salt || !storedHash) return false;

  const hash = crypto.scryptSync(String(password), salt, 64);
  const stored = Buffer.from(storedHash, "hex");
  if (stored.length !== hash.length) return false;

  return crypto.timingSafeEqual(stored, hash);
}

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ROLES, required: true, default: "user" },
    name: { type: String, required: true, trim: true },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      set: normalizePhone,
    },
    passwordHash: { type: String, required: true, select: false },

    // Mechanic fields
    isCertified: { type: Boolean, default: false },
    certificateUrl: { type: String, default: "" },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: "unverified",
    },

    // Trust fields
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    completedJobs: { type: Number, default: 0, min: 0 },
    complaintsCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return verifyPasswordHash(password, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(password) {
  if (!password || String(password).length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }
  return createPasswordHash(password);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject({ virtuals: true });
  delete obj.passwordHash;
  return obj;
};

const User = mongoose.model("User", userSchema);

module.exports = User;

