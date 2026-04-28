const jwt = require("jsonwebtoken");

function generateToken(userId) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing in environment variables.");
  }

  return jwt.sign({ id: userId }, secret, { expiresIn: "7d" });
}

module.exports = generateToken;

