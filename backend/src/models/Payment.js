const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceRequest",
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["cod", "online"],
      required: true,
    },
    gateway: {
      type: String,
      enum: ["cod", "card", "easypaisa", "jazzcash", "wallet", "mock"],
      default: "mock",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    transactionId: { type: String, default: "" },
    paidAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureReason: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

paymentSchema.index({ request: 1, createdAt: -1 });
paymentSchema.index({ customer: 1, createdAt: -1 });
paymentSchema.index({ provider: 1, createdAt: -1 });
paymentSchema.index({ paymentStatus: 1, createdAt: -1 });

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = Payment;
