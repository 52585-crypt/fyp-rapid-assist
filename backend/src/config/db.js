const mongoose = require("mongoose");

async function connectDB() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    // eslint-disable-next-line no-console
    console.error("MONGO_URI is missing in environment variables.");
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(mongoUri);
    // eslint-disable-next-line no-console
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

module.exports = { connectDB };

