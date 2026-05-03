const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { getAccessSecret } = require("../utils/generateToken");
const { ACCESS_COOKIE_NAME } = require("../utils/authCookie");

async function protect(req, res, next) {
  try {
    let token =
      req.cookies && req.cookies[ACCESS_COOKIE_NAME]
        ? req.cookies[ACCESS_COOKIE_NAME]
        : null;

    if (!token) {
      const authHeader = req.headers.authorization || "";
      const [type, bearer] = authHeader.split(" ");
      if (type === "Bearer" && bearer) {
        token = bearer;
      }
    }

    if (!token) {
      return res.status(401).json({
        message: "Not authorized, no token",
      });
    }

    let secret;

    try {
      secret = getAccessSecret();
    } catch {
      return res.status(500).json({
        message: "JWT_SECRET is missing",
      });
    }

    let decoded;

    try {
      decoded = jwt.verify(token, secret);
    } catch {
      return res.status(401).json({
        message: "Not authorized, token failed",
      });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        message: "Not authorized, user not found",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Please contact admin.",
      });
    }

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({
      message: "Not authorized",
    });
  }
}

module.exports = { protect };
