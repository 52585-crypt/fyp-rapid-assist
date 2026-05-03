const crypto = require("crypto");

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function compareToken(token, hashedToken) {
  if (!token || !hashedToken) return false;
  try {
    const digest = hashToken(token);
    const a = Buffer.from(digest, "hex");
    const b = Buffer.from(String(hashedToken), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = {
  hashToken,
  compareToken,
};
