const fs = require("fs").promises;
const path = require("path");
const mongoose = require("mongoose");
const User = require("../models/User");
const ServiceRequest = require("../models/ServiceRequest");
const { calculateDistanceKm, isValidLatLng } = require("../utils/locationUtils");
const { REQUEST_UPLOAD_RELATIVE_DIR } = require("../middleware/uploadMiddleware");

const PROVIDER_TYPE_TO_CATEGORY = {
  mechanic: "mechanic",
  fuel_rider: "fuel_delivery",
  towing_driver: "towing",
};

const TERMINAL_STATUSES = new Set(["completed", "cancelled"]);

function getProviderMatchingCategory(providerType) {
  return PROVIDER_TYPE_TO_CATEGORY[providerType] || null;
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

async function loadProvider(req, res) {
  const user = await User.findById(req.user._id);
  if (!user || user.role !== "provider") {
    res.status(403).json({ message: "Access denied." });
    return null;
  }
  if (!user.providerType) {
    res.status(403).json({ message: "Provider type is not configured." });
    return null;
  }
  return user;
}

function ensureServiceAreaSet(user, res) {
  const sa = user.serviceArea;
  if (!sa || !isValidLatLng(sa.lat, sa.lng)) {
    res.status(400).json({
      message: "Please set your service area first.",
    });
    return false;
  }
  return true;
}

function distancePickupFromServiceAreaKm(user, request) {
  const sa = user.serviceArea;
  const p = request.pickupLocation;
  return calculateDistanceKm(sa.lat, sa.lng, p.lat, p.lng);
}

function ensureRequestWithinServiceArea(user, request, res) {
  if (!ensureServiceAreaSet(user, res)) {
    return false;
  }
  const pickup = request.pickupLocation;
  if (!pickup || !isValidLatLng(pickup.lat, pickup.lng)) {
    res.status(400).json({
      message: "Request pickup location does not have valid coordinates.",
    });
    return false;
  }
  const km = distancePickupFromServiceAreaKm(user, request);
  const radiusKm = Number(user.serviceArea.radiusKm) || 5;
  if (km > radiusKm) {
    res.status(400).json({
      message: "Request is outside your service area.",
    });
    return false;
  }
  return true;
}

async function getAssignedJobOr404(req, res) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: "Invalid job id." });
    return null;
  }
  const job = await ServiceRequest.findOne({
    _id: id,
    provider: req.user._id,
  });
  if (!job) {
    res.status(404).json({ message: "Job not found." });
    return null;
  }
  return job;
}

function assertJobNotTerminal(job, res) {
  if (isTerminalStatus(job.status)) {
    res.status(400).json({
      message: "This job cannot be updated.",
    });
    return false;
  }
  return true;
}

async function patchAvailability(req, res) {
  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    if (typeof req.body?.isAvailable !== "boolean") {
      return res.status(400).json({
        message: "isAvailable (boolean) is required.",
      });
    }

    user.isAvailable = req.body.isAvailable;
    await user.save({ validateModifiedOnly: true });

    return res.json({
      message: "Availability updated.",
      user: user.toSafeJSON(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function patchServiceArea(req, res) {
  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    const { address, city, lat, lng, radiusKm } = req.body || {};

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({
        message: "lat and lng are required.",
      });
    }

    if (!isValidLatLng(lat, lng)) {
      return res.status(400).json({
        message: "Invalid lat or lng.",
      });
    }

    let radius = radiusKm !== undefined ? Number(radiusKm) : user.serviceArea?.radiusKm ?? 5;
    if (Number.isNaN(radius) || radius < 0.5 || radius > 200) {
      return res.status(400).json({
        message: "radiusKm must be between 0.5 and 200.",
      });
    }

    user.serviceArea = user.serviceArea || {};
    user.serviceArea.address =
      typeof address === "string" ? address.trim() : "";
    user.serviceArea.city = typeof city === "string" ? city.trim() : "";
    user.serviceArea.lat = Number(lat);
    user.serviceArea.lng = Number(lng);
    user.serviceArea.radiusKm = radius;

    await user.save({ validateModifiedOnly: true });

    return res.json({
      message: "Service area updated.",
      user: user.toSafeJSON(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function patchLocation(req, res) {
  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    const { address, lat, lng } = req.body || {};

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({
        message: "lat and lng are required.",
      });
    }

    if (!isValidLatLng(lat, lng)) {
      return res.status(400).json({
        message: "Invalid lat or lng.",
      });
    }

    user.currentLocation = user.currentLocation || {};
    user.currentLocation.address =
      typeof address === "string" ? address.trim() : "";
    user.currentLocation.lat = Number(lat);
    user.currentLocation.lng = Number(lng);

    await user.save({ validateModifiedOnly: true });

    return res.json({
      message: "Location updated.",
      user: user.toSafeJSON(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function getMatchingRequests(req, res) {
  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    if (!user.isAvailable) {
      return res.status(400).json({
        message: "Turn on availability to see matching requests.",
      });
    }

    if (!ensureServiceAreaSet(user, res)) {
      return;
    }

    const category = getProviderMatchingCategory(user.providerType);
    if (!category) {
      return res.status(400).json({ message: "Unknown provider type." });
    }

    const candidates = await ServiceRequest.find({
      status: "pending",
      $or: [{ provider: null }, { provider: { $exists: false } }],
      serviceCategory: category,
      "pickupLocation.lat": { $ne: null },
      "pickupLocation.lng": { $ne: null },
    })
      .sort({ createdAt: -1 })
      .lean();

    const radiusKm = Number(user.serviceArea.radiusKm) || 5;
    const saLat = user.serviceArea.lat;
    const saLng = user.serviceArea.lng;

    const requests = [];
    for (const doc of candidates) {
      const km = calculateDistanceKm(
        saLat,
        saLng,
        doc.pickupLocation.lat,
        doc.pickupLocation.lng
      );
      if (km <= radiusKm) {
        requests.push({
          ...doc,
          distanceFromServiceAreaKm: Math.round(km * 100) / 100,
        });
      }
    }

    return res.json({
      message: "OK",
      count: requests.length,
      requests,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function listJobs(req, res) {
  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    const jobs = await ServiceRequest.find({ provider: user._id })
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      message: "OK",
      count: jobs.length,
      jobs,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function getJobById(req, res) {
  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    const job = await getAssignedJobOr404(req, res);
    if (!job) return;

    return res.json({
      message: "OK",
      job: job.toObject(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function acceptJob(req, res) {
  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid job id." });
    }

    const category = getProviderMatchingCategory(user.providerType);
    const requestDoc = await ServiceRequest.findById(id);

    if (!requestDoc) {
      return res.status(404).json({ message: "Request not found." });
    }

    if (requestDoc.status !== "pending" || requestDoc.provider) {
      return res.status(400).json({
        message: "Request is no longer available.",
      });
    }

    if (requestDoc.serviceCategory !== category) {
      return res.status(403).json({
        message: "This request does not match your provider type.",
      });
    }

    if (!isValidLatLng(requestDoc.pickupLocation?.lat, requestDoc.pickupLocation?.lng)) {
      return res.status(400).json({
        message: "Request pickup location does not have valid coordinates.",
      });
    }

    if (!ensureRequestWithinServiceArea(user, requestDoc, res)) {
      return;
    }

    const updated = await ServiceRequest.findOneAndUpdate(
      {
        _id: id,
        status: "pending",
        $or: [{ provider: null }, { provider: { $exists: false } }],
      },
      {
        $set: {
          provider: user._id,
          status: "provider_assigned",
          acceptedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({
        message: "Request is no longer available.",
      });
    }

    return res.json({
      message: "Request accepted.",
      job: updated.toObject(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function declineJob(_req, res) {
  return res.json({
    message: "Request declined.",
  });
}

async function patchJobStatus(req, res, nextStatus, options = {}) {
  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    const job = await getAssignedJobOr404(req, res);
    if (!job) return;

    if (!assertJobNotTerminal(job, res)) return;

    const {
      allowedFrom = [],
      requireMechanic = false,
      requireCategory,
      requireTowingDriver = false,
    } = options;

    if (requireMechanic && user.providerType !== "mechanic") {
      return res.status(403).json({
        message: "Only mechanics can perform this action.",
      });
    }

    if (requireCategory && job.serviceCategory !== requireCategory) {
      return res.status(403).json({
        message: "Invalid service category for this action.",
      });
    }

    if (requireTowingDriver) {
      if (user.providerType !== "towing_driver") {
        return res.status(403).json({
          message: "Only towing drivers can perform this action.",
        });
      }
      if (job.serviceCategory !== "towing") {
        return res.status(403).json({
          message: "This action is only for towing jobs.",
        });
      }
    }

    const expectedCategory = getProviderMatchingCategory(user.providerType);
    if (expectedCategory && job.serviceCategory !== expectedCategory) {
      return res.status(403).json({
        message: "This job does not match your provider type.",
      });
    }

    if (allowedFrom.length && !allowedFrom.includes(job.status)) {
      return res.status(400).json({
        message: `Invalid status transition from ${job.status}.`,
      });
    }

    const timeField = options.timeField;
    job.status = nextStatus;
    if (timeField) {
      job[timeField] = new Date();
    }

    await job.save();

    return res.json({
      message: "Status updated.",
      job: job.toObject(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function patchOnTheWay(req, res) {
  return patchJobStatus(req, res, "on_the_way", {
    allowedFrom: ["provider_assigned"],
    timeField: "onTheWayAt",
  });
}

async function patchArrived(req, res) {
  return patchJobStatus(req, res, "arrived", {
    allowedFrom: ["on_the_way"],
    timeField: "arrivedAt",
  });
}

async function patchStartInspection(req, res) {
  return patchJobStatus(req, res, "inspection_started", {
    allowedFrom: ["arrived"],
    requireMechanic: true,
    requireCategory: "mechanic",
  });
}

async function patchStartService(req, res) {
  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    const job = await getAssignedJobOr404(req, res);
    if (!job) return;

    if (!assertJobNotTerminal(job, res)) return;

    let allowedFrom = [];
    if (job.serviceCategory === "mechanic") {
      allowedFrom = [
        "provider_assigned",
        "arrived",
        "inspection_started",
        "extra_work_approved",
        "extra_work_rejected",
      ];
    } else if (
      job.serviceCategory === "fuel_delivery" ||
      job.serviceCategory === "towing"
    ) {
      allowedFrom = ["arrived"];
    }

    if (!allowedFrom.includes(job.status)) {
      return res.status(400).json({
        message: `Invalid status transition from ${job.status}.`,
      });
    }

    const expectedCategory = getProviderMatchingCategory(user.providerType);
    if (expectedCategory && job.serviceCategory !== expectedCategory) {
      return res.status(403).json({
        message: "This job does not match your provider type.",
      });
    }

    job.status = "service_in_progress";
    await job.save();

    return res.json({
      message: "Status updated.",
      job: job.toObject(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function patchVehiclePickedUp(req, res) {
  return patchJobStatus(req, res, "vehicle_picked_up", {
    allowedFrom: ["service_in_progress"],
    requireTowingDriver: true,
  });
}

async function patchDelivered(req, res) {
  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    const job = await getAssignedJobOr404(req, res);
    if (!job) return;

    if (!assertJobNotTerminal(job, res)) return;

    if (user.providerType === "fuel_rider") {
      if (job.serviceCategory !== "fuel_delivery") {
        return res.status(403).json({
          message: "Invalid job type for fuel rider.",
        });
      }
      if (job.status !== "service_in_progress") {
        return res.status(400).json({
          message: `Invalid status transition from ${job.status}.`,
        });
      }
    } else if (user.providerType === "towing_driver") {
      if (job.serviceCategory !== "towing") {
        return res.status(403).json({
          message: "Invalid job type for towing driver.",
        });
      }
      if (!["vehicle_picked_up", "service_in_progress"].includes(job.status)) {
        return res.status(400).json({
          message: `Invalid status transition from ${job.status}.`,
        });
      }
    } else {
      return res.status(403).json({
        message: "Only fuel riders or towing drivers can mark delivered.",
      });
    }

    job.status = "delivered";
    await job.save();

    return res.json({
      message: "Status updated.",
      job: job.toObject(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function patchComplete(req, res) {
  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    const job = await getAssignedJobOr404(req, res);
    if (!job) return;

    if (isTerminalStatus(job.status)) {
      return res.status(400).json({
        message: "This job cannot be updated.",
      });
    }

    let ok = false;
    if (job.serviceCategory === "mechanic") {
      ok =
        user.providerType === "mechanic" &&
        job.status === "service_in_progress";
    } else if (job.serviceCategory === "fuel_delivery") {
      ok =
        user.providerType === "fuel_rider" && job.status === "delivered";
    } else if (job.serviceCategory === "towing") {
      ok =
        user.providerType === "towing_driver" && job.status === "delivered";
    }

    if (!ok) {
      return res.status(400).json({
        message: `Cannot complete job from status ${job.status}.`,
      });
    }

    job.status = "completed";
    job.completedAt = new Date();
    if (job.paymentMethod === "cash") {
      job.paymentStatus = "paid";
    }

    await job.save();

    await User.findByIdAndUpdate(user._id, {
      $inc: { completedJobs: 1 },
    });

    return res.json({
      message: "Job completed.",
      job: job.toObject(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function addExtraWork(req, res) {
  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    if (user.providerType !== "mechanic") {
      return res.status(403).json({
        message: "Only mechanics can add extra work.",
      });
    }

    const job = await getAssignedJobOr404(req, res);
    if (!job) return;

    if (!assertJobNotTerminal(job, res)) return;

    if (job.serviceCategory !== "mechanic") {
      return res.status(403).json({
        message: "Extra work is only for mechanic jobs.",
      });
    }

    if (!["inspection_started", "service_in_progress"].includes(job.status)) {
      return res.status(400).json({
        message: "Cannot add extra work at this stage.",
      });
    }

    const { title, description, amount } = req.body || {};
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "title is required." });
    }
    const amt = Number(amount);
    if (Number.isNaN(amt) || amt < 0) {
      return res.status(400).json({
        message: "amount must be a non-negative number.",
      });
    }

    job.extraWork.push({
      title: title.trim(),
      description:
        typeof description === "string" ? description.trim() : "",
      amount: amt,
      status: "pending",
    });
    job.status = "extra_work_requested";
    await job.save();

    return res.json({
      message: "Extra work requested.",
      job: job.toObject(),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function patchProofImages(req, res) {
  const files = req.files || [];

  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    const job = await getAssignedJobOr404(req, res);
    if (!job) return;

    if (isTerminalStatus(job.status)) {
      for (const f of files) {
        await fs.unlink(f.path).catch(() => {});
      }
      return res.status(400).json({
        message: "Cannot upload proof for a completed or cancelled job.",
      });
    }

    if (!files.length) {
      return res.status(400).json({
        message: "No images uploaded. Use multipart field name: images",
      });
    }

    const existing = job.media?.proofImages?.length || 0;
    if (existing + files.length > 5) {
      for (const f of files) {
        await fs.unlink(f.path).catch(() => {});
      }
      return res.status(400).json({
        message: "Maximum 5 proof images per request.",
      });
    }

    const now = new Date();
    const additions = files.map((f) => ({
      url: `${REQUEST_UPLOAD_RELATIVE_DIR}/${path.basename(f.path)}`.replace(
        /\\/g,
        "/"
      ),
      uploadedBy: user._id,
      uploadedAt: now,
    }));

    job.media.proofImages = [...(job.media.proofImages || []), ...additions];
    await job.save();

    return res.json({
      message: "Proof images uploaded.",
      job: job.toObject(),
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

async function getDashboard(req, res) {
  try {
    const user = await loadProvider(req, res);
    if (!user) return;

    const providerId = user._id;

    const [
      totalAssignedJobs,
      completedJobs,
      cancelledJobs,
      activeJobs,
      earningsAgg,
    ] = await Promise.all([
      ServiceRequest.countDocuments({ provider: providerId }),
      ServiceRequest.countDocuments({
        provider: providerId,
        status: "completed",
      }),
      ServiceRequest.countDocuments({
        provider: providerId,
        status: "cancelled",
      }),
      ServiceRequest.countDocuments({
        provider: providerId,
        status: { $nin: ["completed", "cancelled"] },
      }),
      ServiceRequest.aggregate([
        {
          $match: {
            provider: providerId,
            status: "completed",
            paymentStatus: "paid",
          },
        },
        { $group: { _id: null, sum: { $sum: "$totalAmount" } } },
      ]),
    ]);

    const totalEarnings =
      earningsAgg.length && typeof earningsAgg[0].sum === "number"
        ? earningsAgg[0].sum
        : 0;

    const successRate =
      totalAssignedJobs > 0
        ? Math.round((completedJobs / totalAssignedJobs) * 10000) / 100
        : 0;

    const recentJobs = await ServiceRequest.find({ provider: providerId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate("customer", "name phone")
      .lean();

    return res.json({
      message: "OK",
      stats: {
        totalAssignedJobs,
        completedJobs,
        cancelledJobs,
        activeJobs,
        totalEarnings,
        successRate,
        ratingAvg: user.ratingAvg ?? 0,
        ratingCount: user.ratingCount ?? 0,
        recentJobs,
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

module.exports = {
  patchAvailability,
  patchServiceArea,
  patchLocation,
  getMatchingRequests,
  listJobs,
  getJobById,
  acceptJob,
  declineJob,
  patchOnTheWay,
  patchArrived,
  patchStartInspection,
  patchStartService,
  patchVehiclePickedUp,
  patchDelivered,
  patchComplete,
  addExtraWork,
  patchProofImages,
  getDashboard,
};
