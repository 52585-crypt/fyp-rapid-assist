const fs = require("fs").promises;
const path = require("path");
const mongoose = require("mongoose");
const ServiceRequest = require("../models/ServiceRequest");
const {
  PAYMENT_METHODS,
  VEHICLE_CATEGORIES,
  VEHICLE_FUEL_TYPES,
} = require("../models/ServiceRequest");
const {
  calculateMechanicPricing,
  calculateFuelPricing,
  calculateTowingPricing,
  hasDropoffLocation,
} = require("../utils/calculateRequestPricing");
const { REQUEST_UPLOAD_RELATIVE_DIR } = require("../middleware/uploadMiddleware");

const MECHANIC_SERVICE_TYPES = new Set([
  "bike_puncture",
  "car_puncture",
  "general_repair",
  "battery_jump_start",
  "engine_issue",
  "overheating",
  "brake_issue",
  "electrical_issue",
  "ac_repair",
  "lockout",
  "other",
]);

const FUEL_SERVICE_TYPES = new Set(["fuel_petrol", "fuel_diesel"]);
const TOWING_SERVICE_TYPES = new Set(["vehicle_towing"]);

const TERMINAL_CANCEL_STATUSES = new Set(["completed", "cancelled"]);

function numOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function normalizePickup(body) {
  const pl = body.pickupLocation;
  if (!pl || typeof pl !== "object") return null;
  const address =
    typeof pl.address === "string" ? pl.address.trim() : "";
  const lat = numOrNull(pl.lat);
  const lng = numOrNull(pl.lng);
  return {
    address,
    lat: Number.isNaN(lat) ? null : lat,
    lng: Number.isNaN(lng) ? null : lng,
    _rawLat: pl.lat,
    _rawLng: pl.lng,
  };
}

function normalizeDropoff(body) {
  const dl = body.dropoffLocation;
  if (!dl || typeof dl !== "object") {
    return { address: "", lat: null, lng: null };
  }
  const address =
    typeof dl.address === "string" ? dl.address.trim() : "";
  const lat = numOrNull(dl.lat);
  const lng = numOrNull(dl.lng);
  return {
    address,
    lat: Number.isNaN(lat) ? null : lat,
    lng: Number.isNaN(lng) ? null : lng,
  };
}

function normalizeVehicleInfo(body) {
  const v = body.vehicleInfo;
  if (!v || typeof v !== "object") return null;
  return {
    vehicleCategory: v.vehicleCategory,
    brand: typeof v.brand === "string" ? v.brand.trim() : "",
    model: typeof v.model === "string" ? v.model.trim() : "",
    registrationNumber:
      typeof v.registrationNumber === "string"
        ? v.registrationNumber.trim()
        : "",
    fuelType: v.fuelType,
    color: typeof v.color === "string" ? v.color.trim() : "",
  };
}

function validateCommon(body) {
  const errors = [];

  if (!body.serviceCategory) {
    errors.push("serviceCategory is required.");
  }

  if (!body.serviceType || typeof body.serviceType !== "string") {
    errors.push("serviceType is required.");
  }

  const pickup = normalizePickup(body);
  if (!pickup || !pickup.address) {
    errors.push("pickupLocation.address is required.");
  }

  if (pickup) {
    if (
      pickup._rawLat !== undefined &&
      pickup._rawLat !== null &&
      pickup._rawLat !== "" &&
      pickup.lat === null
    ) {
      errors.push("pickupLocation.lat must be a valid number when provided.");
    }
    if (
      pickup._rawLng !== undefined &&
      pickup._rawLng !== null &&
      pickup._rawLng !== "" &&
      pickup.lng === null
    ) {
      errors.push("pickupLocation.lng must be a valid number when provided.");
    }
  }

  if (!body.paymentMethod) {
    errors.push("paymentMethod is required.");
  } else if (!PAYMENT_METHODS.includes(body.paymentMethod)) {
    errors.push("paymentMethod must be cash, online, or wallet.");
  }

  const vehicle = normalizeVehicleInfo(body);
  if (!vehicle || !vehicle.vehicleCategory) {
    errors.push("vehicleInfo.vehicleCategory is required.");
  } else if (!VEHICLE_CATEGORIES.includes(vehicle.vehicleCategory)) {
    errors.push(
      "vehicleInfo.vehicleCategory must be bike, car, van, truck, or other."
    );
  }

  if (vehicle && vehicle.fuelType !== undefined && vehicle.fuelType !== "") {
    if (!VEHICLE_FUEL_TYPES.includes(vehicle.fuelType)) {
      errors.push(
        "vehicleInfo.fuelType must be petrol, diesel, electric, hybrid, or other."
      );
    }
  }

  return { errors, pickup, vehicle };
}

function validateServiceTypeForCategory(category, serviceType) {
  if (category === "mechanic") {
    return MECHANIC_SERVICE_TYPES.has(serviceType);
  }
  if (category === "fuel_delivery") {
    return FUEL_SERVICE_TYPES.has(serviceType);
  }
  if (category === "towing") {
    return TOWING_SERVICE_TYPES.has(serviceType);
  }
  return false;
}

function fuelServiceTypeMatchesDetails(serviceType, fuelDetailsFuelType) {
  if (serviceType === "fuel_petrol") return fuelDetailsFuelType === "petrol";
  if (serviceType === "fuel_diesel") return fuelDetailsFuelType === "diesel";
  return false;
}

async function estimate(req, res) {
  try {
    const body = req.body || {};
    const { errors, pickup, vehicle } = validateCommon(body);

    if (!["mechanic", "fuel_delivery", "towing"].includes(body.serviceCategory)) {
      errors.push(
        "serviceCategory must be mechanic, fuel_delivery, or towing."
      );
    }

    const st = typeof body.serviceType === "string" ? body.serviceType.trim() : "";
    if (st && body.serviceCategory) {
      if (!validateServiceTypeForCategory(body.serviceCategory, st)) {
        errors.push("serviceType is not valid for the selected serviceCategory.");
      }
    }

    if (errors.length) {
      return res.status(400).json({ message: errors.join(" ") });
    }

    const dropoff = normalizeDropoff(body);

    if (body.serviceCategory === "mechanic") {
      if (body.distanceKm === undefined || body.distanceKm === null) {
        return res.status(400).json({
          message: "distanceKm is required for mechanic requests.",
        });
      }
      try {
        const pricing = calculateMechanicPricing(body.distanceKm);
        return res.json({
          message: "Estimate calculated.",
          serviceCategory: "mechanic",
          pricing,
        });
      } catch (e) {
        return res.status(400).json({ message: e.message });
      }
    }

    if (body.serviceCategory === "fuel_delivery") {
      const fd = body.fuelDetails;
      if (!fd || typeof fd !== "object") {
        return res.status(400).json({
          message: "fuelDetails is required for fuel_delivery.",
        });
      }
      if (!fd.fuelType || !["petrol", "diesel"].includes(fd.fuelType)) {
        return res.status(400).json({
          message: "fuelDetails.fuelType must be petrol or diesel.",
        });
      }
      if (fd.quantityLiters === undefined || fd.quantityLiters === null) {
        return res.status(400).json({
          message: "fuelDetails.quantityLiters is required for fuel_delivery.",
        });
      }
      if (!fuelServiceTypeMatchesDetails(st, fd.fuelType)) {
        return res.status(400).json({
          message:
            "serviceType must match fuelDetails.fuelType (fuel_petrol with petrol, fuel_diesel with diesel).",
        });
      }
      try {
        const pricing = calculateFuelPricing(fd.fuelType, fd.quantityLiters);
        return res.json({
          message: "Estimate calculated.",
          serviceCategory: "fuel_delivery",
          pricing,
        });
      } catch (e) {
        return res.status(400).json({ message: e.message });
      }
    }

    if (body.serviceCategory === "towing") {
      try {
        const pricing = calculateTowingPricing(
          dropoff,
          body.towingDistanceKm
        );
        return res.json({
          message: "Estimate calculated.",
          serviceCategory: "towing",
          pricing,
          dropoffUsed: hasDropoffLocation(dropoff),
        });
      } catch (e) {
        return res.status(400).json({ message: e.message });
      }
    }

    return res.status(400).json({ message: "Invalid serviceCategory." });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

function buildCreatePayload(body, customerId, pricingBlock, category) {
  const pickup = normalizePickup(body);
  const dropoff = normalizeDropoff(body);
  const vehicle = normalizeVehicleInfo(body);
  const st = String(body.serviceType).trim();

  const base = {
    customer: customerId,
    serviceCategory: category,
    serviceType: st,
    vehicleInfo: {
      vehicleCategory: vehicle.vehicleCategory,
      brand: vehicle.brand,
      model: vehicle.model,
      registrationNumber: vehicle.registrationNumber,
      fuelType: vehicle.fuelType || "other",
      color: vehicle.color,
    },
    pickupLocation: {
      address: pickup.address,
      lat: pickup.lat,
      lng: pickup.lng,
    },
    dropoffLocation: {
      address: dropoff.address,
      lat: dropoff.lat,
      lng: dropoff.lng,
    },
    paymentMethod: body.paymentMethod,
    paymentStatus: "pending",
    status: "pending",
    media: {
      customerImages: [],
      beforeImages: [],
      afterImages: [],
      proofImages: [],
    },
    extraWorkTotal: 0,
  };

  if (category === "mechanic") {
    return {
      ...base,
      ...pricingBlock,
      fuelDetails: undefined,
      towingDistanceKm: null,
    };
  }

  if (category === "fuel_delivery") {
    return {
      ...base,
      fuelDetails: pricingBlock.fuelDetails,
      fuelAmount: pricingBlock.fuelAmount,
      fuelDeliveryFee: pricingBlock.fuelDeliveryFee,
      totalAmount: pricingBlock.totalAmount,
      distanceKm: null,
      towingDistanceKm: null,
      mechanicBaseFee: undefined,
      mechanicDistanceFeePerKm: undefined,
      mechanicDistanceFee: undefined,
      towingMinimumFee: undefined,
      towingPerKmRate: undefined,
      towingDistanceFee: undefined,
    };
  }

  if (category === "towing") {
    return {
      ...base,
      towingMinimumFee: pricingBlock.towingMinimumFee,
      towingPerKmRate: pricingBlock.towingPerKmRate,
      towingDistanceKm: pricingBlock.towingDistanceKm,
      towingDistanceFee: pricingBlock.towingDistanceFee,
      totalAmount: pricingBlock.totalAmount,
      fuelDetails: undefined,
      distanceKm: null,
      mechanicBaseFee: undefined,
      mechanicDistanceFeePerKm: undefined,
      mechanicDistanceFee: undefined,
      fuelAmount: undefined,
      fuelDeliveryFee: undefined,
    };
  }

  return base;
}

async function createRequest(req, res) {
  try {
    const body = req.body || {};
    const { errors, pickup, vehicle } = validateCommon(body);

    if (!["mechanic", "fuel_delivery", "towing"].includes(body.serviceCategory)) {
      errors.push(
        "serviceCategory must be mechanic, fuel_delivery, or towing."
      );
    }

    const st = typeof body.serviceType === "string" ? body.serviceType.trim() : "";
    if (st && body.serviceCategory) {
      if (!validateServiceTypeForCategory(body.serviceCategory, st)) {
        errors.push("serviceType is not valid for the selected serviceCategory.");
      }
    }

    if (errors.length) {
      return res.status(400).json({ message: errors.join(" ") });
    }

    const dropoff = normalizeDropoff(body);
    let pricingBlock;
    let category = body.serviceCategory;

    if (category === "mechanic") {
      if (body.distanceKm === undefined || body.distanceKm === null) {
        return res.status(400).json({
          message: "distanceKm is required for mechanic requests.",
        });
      }
      try {
        pricingBlock = calculateMechanicPricing(body.distanceKm);
      } catch (e) {
        return res.status(400).json({ message: e.message });
      }
    } else if (category === "fuel_delivery") {
      const fd = body.fuelDetails;
      if (!fd || typeof fd !== "object") {
        return res.status(400).json({
          message: "fuelDetails is required for fuel_delivery.",
        });
      }
      if (!fd.fuelType || !["petrol", "diesel"].includes(fd.fuelType)) {
        return res.status(400).json({
          message: "fuelDetails.fuelType must be petrol or diesel.",
        });
      }
      if (fd.quantityLiters === undefined || fd.quantityLiters === null) {
        return res.status(400).json({
          message: "fuelDetails.quantityLiters is required for fuel_delivery.",
        });
      }
      if (!fuelServiceTypeMatchesDetails(st, fd.fuelType)) {
        return res.status(400).json({
          message:
            "serviceType must match fuelDetails.fuelType (fuel_petrol with petrol, fuel_diesel with diesel).",
        });
      }
      try {
        pricingBlock = calculateFuelPricing(fd.fuelType, fd.quantityLiters);
      } catch (e) {
        return res.status(400).json({ message: e.message });
      }
    } else if (category === "towing") {
      try {
        pricingBlock = calculateTowingPricing(dropoff, body.towingDistanceKm);
      } catch (e) {
        return res.status(400).json({ message: e.message });
      }
    } else {
      return res.status(400).json({ message: "Invalid serviceCategory." });
    }

    const payload = buildCreatePayload(
      body,
      req.user._id,
      pricingBlock,
      category
    );

    const doc = await ServiceRequest.create(payload);

    return res.status(201).json({
      message: "Service request created.",
      request: doc.toObject(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function listMyRequests(req, res) {
  try {
    const list = await ServiceRequest.find({ customer: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      message: "OK",
      count: list.length,
      requests: list,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function getRequestById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid request id." });
    }

    const doc = await ServiceRequest.findOne({
      _id: id,
      customer: req.user._id,
    }).lean();

    if (!doc) {
      return res.status(404).json({ message: "Request not found." });
    }

    return res.json({
      message: "OK",
      request: doc,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function cancelRequest(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid request id." });
    }

    const doc = await ServiceRequest.findOne({
      _id: id,
      customer: req.user._id,
    });

    if (!doc) {
      return res.status(404).json({ message: "Request not found." });
    }

    if (TERMINAL_CANCEL_STATUSES.has(doc.status)) {
      return res.status(400).json({
        message: "This request cannot be cancelled.",
      });
    }

    const reason =
      typeof req.body?.cancellationReason === "string"
        ? req.body.cancellationReason.trim()
        : "";

    doc.status = "cancelled";
    doc.cancelledAt = new Date();
    doc.cancellationReason = reason;
    await doc.save();

    return res.json({
      message: "Request cancelled.",
      request: doc.toObject(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function patchCustomerImages(req, res) {
  const files = req.files || [];

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      for (const f of files) {
        await fs.unlink(f.path).catch(() => {});
      }
      return res.status(400).json({ message: "Invalid request id." });
    }

    if (!files.length) {
      return res.status(400).json({
        message: "No images uploaded. Use multipart field name: images",
      });
    }

    const doc = await ServiceRequest.findOne({
      _id: id,
      customer: req.user._id,
    });

    if (!doc) {
      for (const f of files) {
        await fs.unlink(f.path).catch(() => {});
      }
      return res.status(404).json({ message: "Request not found." });
    }

    if (doc.status === "cancelled" || doc.status === "completed") {
      for (const f of files) {
        await fs.unlink(f.path).catch(() => {});
      }
      return res.status(400).json({
        message: "Cannot upload images for a completed or cancelled request.",
      });
    }

    const existing = doc.media?.customerImages?.length || 0;
    if (existing + files.length > 5) {
      for (const f of files) {
        await fs.unlink(f.path).catch(() => {});
      }
      return res.status(400).json({
        message: "Maximum 5 customer images per request.",
      });
    }

    const now = new Date();
    const additions = files.map((f) => ({
      url: `${REQUEST_UPLOAD_RELATIVE_DIR}/${path.basename(f.path)}`.replace(
        /\\/g,
        "/"
      ),
      uploadedBy: req.user._id,
      uploadedAt: now,
    }));

    doc.media.customerImages = [
      ...(doc.media.customerImages || []),
      ...additions,
    ];
    await doc.save();

    return res.json({
      message: "Customer images uploaded.",
      request: doc.toObject(),
    });
  } catch (err) {
    for (const f of files) {
      await fs.unlink(f.path).catch(() => {});
    }
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

module.exports = {
  estimate,
  createRequest,
  listMyRequests,
  getRequestById,
  cancelRequest,
  patchCustomerImages,
};
