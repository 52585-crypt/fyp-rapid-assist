const mongoose = require("mongoose");

const SERVICE_CATEGORIES = ["mechanic", "fuel_delivery", "towing"];

const REQUEST_STATUSES = [
  "pending",
  "provider_assigned",
  "on_the_way",
  "arrived",
  "inspection_started",
  "extra_work_requested",
  "extra_work_approved",
  "extra_work_rejected",
  "service_in_progress",
  "vehicle_picked_up",
  "delivered",
  "completed",
  "cancelled",
];

/** Stored on documents; legacy "cash" / "wallet" kept for existing DB rows. */
const PAYMENT_METHODS_STORABLE = ["cod", "online", "cash", "wallet"];
/** Allowed on new API creates (estimate + create request). */
const PAYMENT_METHODS = ["cod", "online"];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"];

const VEHICLE_CATEGORIES = ["bike", "car", "van", "truck", "other"];
const VEHICLE_FUEL_TYPES = ["petrol", "diesel", "electric", "hybrid", "other"];

const requestImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const extraWorkItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    amount: { type: Number, required: true, min: 0 },
    proofImages: {
      type: [requestImageSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { _id: true }
);

const serviceRequestSchema = new mongoose.Schema(
  {
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

    serviceCategory: {
      type: String,
      enum: SERVICE_CATEGORIES,
      required: true,
    },

    serviceType: {
      type: String,
      required: true,
      trim: true,
    },

    vehicleInfo: {
      vehicleCategory: {
        type: String,
        enum: VEHICLE_CATEGORIES,
        required: true,
      },
      brand: { type: String, default: "", trim: true },
      model: { type: String, default: "", trim: true },
      registrationNumber: { type: String, default: "", trim: true },
      fuelType: {
        type: String,
        enum: VEHICLE_FUEL_TYPES,
        default: "other",
      },
      color: { type: String, default: "", trim: true },
    },

    pickupLocation: {
      address: { type: String, required: true, trim: true },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },

    dropoffLocation: {
      address: { type: String, default: "", trim: true },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },

    fuelDetails: {
      fuelType: {
        type: String,
        enum: ["petrol", "diesel"],
      },
      quantityLiters: { type: Number },
      pricePerLiter: { type: Number },
    },

    distanceKm: { type: Number, default: null },
    towingDistanceKm: { type: Number, default: null },

    mechanicBaseFee: { type: Number },
    mechanicDistanceFeePerKm: { type: Number },
    mechanicDistanceFee: { type: Number },
    extraWorkTotal: { type: Number, default: 0 },

    extraWork: {
      type: [extraWorkItemSchema],
      default: [],
    },

    extraWorkRejectionReason: {
      type: String,
      default: "",
      trim: true,
    },

    fuelAmount: { type: Number },
    fuelDeliveryFee: { type: Number },

    towingMinimumFee: { type: Number },
    towingPerKmRate: { type: Number },
    towingDistanceFee: { type: Number },

    totalAmount: { type: Number, required: true, min: 0 },

    pricing: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    status: {
      type: String,
      enum: REQUEST_STATUSES,
      default: "pending",
    },

    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS_STORABLE,
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "pending",
    },

    media: {
      customerImages: { type: [requestImageSchema], default: [] },
      beforeImages: { type: [requestImageSchema], default: [] },
      afterImages: { type: [requestImageSchema], default: [] },
      proofImages: { type: [requestImageSchema], default: [] },
    },

    cancellationReason: { type: String, default: "", trim: true },
    cancelledAt: { type: Date, default: null },

    acceptedAt: { type: Date, default: null },
    onTheWayAt: { type: Date, default: null },
    arrivedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const ServiceRequest = mongoose.model("ServiceRequest", serviceRequestSchema);

module.exports = ServiceRequest;
module.exports.SERVICE_CATEGORIES = SERVICE_CATEGORIES;
module.exports.REQUEST_STATUSES = REQUEST_STATUSES;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
module.exports.PAYMENT_METHODS_STORABLE = PAYMENT_METHODS_STORABLE;
module.exports.VEHICLE_CATEGORIES = VEHICLE_CATEGORIES;
module.exports.VEHICLE_FUEL_TYPES = VEHICLE_FUEL_TYPES;
