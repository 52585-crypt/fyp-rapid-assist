const User = require("../models/User");
const generateToken = require("../utils/generateToken");

async function register(req, res) {
  try {
    const { role, name, phone, password, isCertified, certificateUrl } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ message: "name, phone, password are required" });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(400).json({ message: "Phone already registered" });
    }

    const passwordHash = User.hashPassword(password);

    const user = await User.create({
      role: role || "user",
      name,
      phone,
      passwordHash,
      isCertified: Boolean(isCertified),
      certificateUrl: certificateUrl || "",
    });

    const token = generateToken(user._id);
    return res.status(201).json({ token, user: user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
}

async function login(req, res) {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: "phone and password are required" });
    }

    const user = await User.findOne({ phone }).select("+passwordHash");
    if (!user) {
      return res.status(401).json({ message: "Invalid phone or password" });
    }

    const ok = user.verifyPassword(password);
    if (!ok) {
      return res.status(401).json({ message: "Invalid phone or password" });
    }

    const token = generateToken(user._id);
    return res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
}

async function me(req, res) {
  return res.json({ user: req.user.toSafeJSON() });
}

module.exports = { register, login, me };

