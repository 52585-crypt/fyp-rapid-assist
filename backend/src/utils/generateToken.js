const jwt = require("jsonwebtoken");

function getAccessSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is missing in environment variables.");
  }
  return secret;
}

function getRefreshSecret() {
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (refreshSecret) {
    return refreshSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_REFRESH_SECRET is required in production environment."
    );
  }
  return getAccessSecret();
}

function generateAccessToken(userId) {
  return jwt.sign({ id: userId }, getAccessSecret(), {
    expiresIn: "15m",
  });
}

function generateRefreshToken(userId) {
  return jwt.sign({ id: userId }, getRefreshSecret(), {
    expiresIn: "7d",
  });
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  getAccessSecret,
  getRefreshSecret,
};
