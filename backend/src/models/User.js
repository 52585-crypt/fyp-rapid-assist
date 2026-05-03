const mongoose = require("mongoose");
const crypto = require("crypto");

const ROLES = ["customer", "provider", "admin"];
const PROVIDER_TYPES = ["mechanic", "fuel_rider", "towing_driver"];
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
    role: {
      type: String,
      enum: ROLES,
      required: true,
      default: "customer",
    },

    providerType: {
      type: String,
      enum: PROVIDER_TYPES,
      default: null,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      set: normalizePhone,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    refreshTokenHash: {
      type: String,
      select: false,
      default: "",
    },

    isPhoneVerified: {
      type: Boolean,
      default: false,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    isAvailable: {
      type: Boolean,
      default: false,
    },

    currentLocation: {
      address: {
        type: String,
        default: "",
      },
      lat: {
        type: Number,
        default: null,
      },
      lng: {
        type: Number,
        default: null,
      },
    },

    serviceArea: {
      address: {
        type: String,
        default: "",
        trim: true,
      },
      city: {
        type: String,
        default: "",
        trim: true,
      },
      lat: {
        type: Number,
        default: null,
      },
      lng: {
        type: Number,
        default: null,
      },
      radiusKm: {
        type: Number,
        default: 5,
        min: 0.5,
        max: 200,
      },
    },

    isCertified: {
      type: Boolean,
      default: false,
    },

    certificateUrl: {
      type: String,
      default: "",
    },

    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: "unverified",
    },

    providerProfile: {
      skills: [
        {
          type: String,
        },
      ],
      experienceYears: {
        type: Number,
        default: 0,
      },
      shopName: {
        type: String,
        default: "",
        trim: true,
      },
      shopAddress: {
        type: String,
        default: "",
        trim: true,
      },
      workArea: {
        type: String,
        default: "",
        trim: true,
      },
      vehicleNumber: {
        type: String,
        default: "",
      },
      licenseNumber: {
        type: String,
        default: "",
      },
    },

    verificationDocs: {
      cnicFrontUrl: {
        type: String,
        default: "",
      },
      cnicBackUrl: {
        type: String,
        default: "",
      },
      selfieUrl: {
        type: String,
        default: "",
      },
      shopPhotoUrl: {
        type: String,
        default: "",
      },
    },

    ratingAvg: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    completedJobs: {
      type: Number,
      default: 0,
      min: 0,
    },

    complaintsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

userSchema.pre("validate", function () {
  if (this.role !== "provider") {
    this.providerType = null;
    this.isAvailable = false;
    this.providerProfile = undefined;
    this.verificationDocs = undefined;
    this.serviceArea = undefined;
  }

  if (this.role === "provider" && !this.providerType) {
    throw new Error("Provider type is required for service providers.");
  }
});

userSchema.statics.hashPassword = function hashPassword(password) {
  if (!password || String(password).length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  return createPasswordHash(password);
};

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return verifyPasswordHash(password, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject({ virtuals: true });
  delete obj.passwordHash;
  delete obj.refreshTokenHash;
  return obj;
};

const User = mongoose.model("User", userSchema);

module.exports = User;
