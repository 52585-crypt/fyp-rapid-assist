const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
  generateAccessToken,
  generateRefreshToken,
  getRefreshSecret,
} = require("../utils/generateToken");
const { hashToken, compareToken } = require("../utils/tokenHash");
const {
  setAuthCookies,
  setAccessTokenCookie,
  clearAuthCookies,
} = require("../utils/authCookie");

const VALID_ROLES = ["customer", "provider", "admin"];
const VALID_PROVIDER_TYPES = ["mechanic", "fuel_rider", "towing_driver"];

const PW_MIN_LEN = 6;

async function persistRefreshToken(userId, plainRefreshToken) {
  const user = await User.findById(userId);
  if (!user) return null;
  user.refreshTokenHash = hashToken(plainRefreshToken);
  await user.save({ validateModifiedOnly: true });
  return user;
}

async function register(req, res) {
  try {
    const {
      role,
      providerType,
      name,
      phone,
      email,
      password,
      isCertified,
      certificateUrl,
      providerProfile,
      verificationDocs,
    } = req.body;

    if (
      typeof name !== "string" ||
      typeof phone !== "string" ||
      password === undefined ||
      password === null
    ) {
      return res.status(400).json({
        message: "Name, phone and password are required.",
      });
    }

    const trimmedName = String(name).trim();
    const trimmedPhone = String(phone).trim();
    const pwStr = String(password);

    if (!trimmedName || !trimmedPhone) {
      return res.status(400).json({
        message: "Name, phone and password are required.",
      });
    }

    if (pwStr.length < PW_MIN_LEN) {
      return res.status(400).json({
        message: `Password must be at least ${PW_MIN_LEN} characters.`,
      });
    }

    const selectedRole = role || "customer";

    if (!VALID_ROLES.includes(selectedRole)) {
      return res.status(400).json({
        message: "Invalid role. Role must be customer, provider, or admin.",
      });
    }

    if (selectedRole === "provider") {
      if (!providerType || typeof providerType !== "string") {
        return res.status(400).json({
          message: "Provider type is required for service provider.",
        });
      }

      if (!VALID_PROVIDER_TYPES.includes(providerType)) {
        return res.status(400).json({
          message:
            "Invalid provider type. It must be mechanic, fuel_rider, or towing_driver.",
        });
      }
    }

    if (selectedRole !== "provider" && providerType) {
      return res.status(400).json({
        message: "Provider type is only allowed when role is provider.",
      });
    }

    const existing = await User.findOne({ phone: trimmedPhone });

    if (existing) {
      return res.status(400).json({
        message: "Phone already registered.",
      });
    }

    let passwordHash;
    try {
      passwordHash = User.hashPassword(pwStr);
    } catch (hashErr) {
      return res.status(400).json({
        message: hashErr.message || "Invalid password.",
      });
    }

    const verificationStatus =
      selectedRole === "provider" ? "pending" : "unverified";

    const createPayload = {
      role: selectedRole,
      providerType:
        selectedRole === "provider" ? providerType : null,
      name: trimmedName,
      phone: trimmedPhone,
      email:
        typeof email === "string" ? email.trim().toLowerCase() : "",
      passwordHash,

      isCertified: selectedRole === "provider" ? Boolean(isCertified) : false,
      certificateUrl:
        selectedRole === "provider" &&
        certificateUrl &&
        typeof certificateUrl === "string"
          ? certificateUrl
          : "",

      verificationStatus,

      providerProfile:
        selectedRole === "provider"
          ? {
              skills: Array.isArray(providerProfile?.skills)
                ? providerProfile.skills.map(String)
                : [],
              experienceYears: Number(providerProfile?.experienceYears) || 0,
              shopName:
                typeof providerProfile?.shopName === "string"
                  ? providerProfile.shopName
                  : "",
              shopAddress:
                typeof providerProfile?.shopAddress === "string"
                  ? providerProfile.shopAddress
                  : "",
              workArea:
                typeof providerProfile?.workArea === "string"
                  ? providerProfile.workArea
                  : "",
              vehicleNumber:
                typeof providerProfile?.vehicleNumber === "string"
                  ? providerProfile.vehicleNumber
                  : "",
              licenseNumber:
                typeof providerProfile?.licenseNumber === "string"
                  ? providerProfile.licenseNumber
                  : "",
            }
          : undefined,

      verificationDocs:
        selectedRole === "provider"
          ? {
              cnicFrontUrl:
                typeof verificationDocs?.cnicFrontUrl === "string"
                  ? verificationDocs.cnicFrontUrl
                  : "",
              cnicBackUrl:
                typeof verificationDocs?.cnicBackUrl === "string"
                  ? verificationDocs.cnicBackUrl
                  : "",
              selfieUrl:
                typeof verificationDocs?.selfieUrl === "string"
                  ? verificationDocs.selfieUrl
                  : "",
              shopPhotoUrl:
                typeof verificationDocs?.shopPhotoUrl === "string"
                  ? verificationDocs.shopPhotoUrl
                  : "",
            }
          : undefined,
    };

    const user = await User.create(createPayload);

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    await persistRefreshToken(user._id, refreshToken);

    setAuthCookies(res, accessToken, refreshToken);

    return res.status(201).json({
      message: "Registered successfully.",
      user: user.toSafeJSON(),
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(400).json({
        message: "Phone already registered.",
      });
    }
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function login(req, res) {
  try {
    const { phone, password } = req.body;

    if (phone === undefined || password === undefined || phone === null) {
      return res.status(400).json({
        message: "Phone and password are required.",
      });
    }

    const trimmedPhone = String(phone).trim();
    const pwStr = String(password);

    if (!trimmedPhone) {
      return res.status(400).json({
        message: "Phone and password are required.",
      });
    }

    const user = await User.findOne({ phone: trimmedPhone }).select(
      "+passwordHash"
    );

    if (!user) {
      return res.status(401).json({
        message: "Invalid phone or password.",
      });
    }

    const ok = user.verifyPassword(pwStr);

    if (!ok) {
      return res.status(401).json({
        message: "Invalid phone or password.",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account is blocked. Please contact admin.",
      });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    await persistRefreshToken(user._id, refreshToken);

    setAuthCookies(res, accessToken, refreshToken);

    return res.json({
      message: "Login successful.",
      user: user.toSafeJSON(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function refresh(req, res) {
  try {
    const refreshTokenCookie = req.cookies?.refreshToken;

    if (!refreshTokenCookie) {
      return res.status(401).json({
        message: "Refresh token missing.",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshTokenCookie, getRefreshSecret());
    } catch {
      return res.status(401).json({
        message: "Invalid or expired refresh token.",
      });
    }

    const user = await User.findById(decoded.id).select("+refreshTokenHash");

    if (!user) {
      return res.status(401).json({
        message: "User not found.",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Please contact admin.",
      });
    }

    const hashOk = compareToken(refreshTokenCookie, user.refreshTokenHash);

    if (!hashOk) {
      return res.status(401).json({
        message: "Refresh token revoked or invalid.",
      });
    }

    const newAccessToken = generateAccessToken(user._id);
    setAccessTokenCookie(res, newAccessToken);

    const safeUser = await User.findById(user._id);

    return res.json({
      message: "Access token refreshed.",
      user: safeUser.toSafeJSON(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function logout(req, res) {
  try {
    const refreshCookie = req.cookies?.refreshToken;

    if (refreshCookie) {
      try {
        const decoded = jwt.verify(refreshCookie, getRefreshSecret());
        const user = await User.findById(decoded.id).select(
          "+refreshTokenHash"
        );
        if (
          user &&
          user.refreshTokenHash &&
          compareToken(refreshCookie, user.refreshTokenHash)
        ) {
          user.refreshTokenHash = "";
          await user.save({ validateModifiedOnly: true });
        }
      } catch {
        /* stale or forged token — still clear cookies below */
      }
    }

    clearAuthCookies(res);

    return res.json({
      message: "Logged out successfully.",
    });
  } catch (err) {
    clearAuthCookies(res);
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function me(req, res) {
  return res.json({
    user: req.user.toSafeJSON(),
  });
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
};
