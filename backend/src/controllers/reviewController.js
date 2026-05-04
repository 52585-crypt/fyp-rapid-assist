const mongoose = require("mongoose");
const Review = require("../models/Review");
const ServiceRequest = require("../models/ServiceRequest");
const User = require("../models/User");

async function updateProviderRating(providerId) {
  const pid = new mongoose.Types.ObjectId(String(providerId));

  const agg = await Review.aggregate([
    { $match: { provider: pid } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  let ratingAvg = 0;
  let ratingCount = 0;

  if (agg.length > 0) {
    ratingCount = agg[0].count;
    ratingAvg = Math.round(agg[0].avgRating * 10) / 10;
  }

  await User.findByIdAndUpdate(providerId, {
    ratingAvg,
    ratingCount,
  });

  return { ratingAvg, ratingCount };
}

async function createReview(req, res) {
  try {
    const { requestId, rating, comment, isHelpful } = req.body || {};

    if (!requestId || !mongoose.Types.ObjectId.isValid(String(requestId))) {
      return res.status(400).json({
        message: "Valid requestId is required.",
      });
    }

    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return res.status(400).json({
        message: "rating must be an integer between 1 and 5.",
      });
    }

    const request = await ServiceRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({
        message: "Request not found.",
      });
    }

    if (!request.customer.equals(req.user._id)) {
      return res.status(403).json({
        message: "Access denied.",
      });
    }

    if (request.status !== "completed") {
      return res.status(400).json({
        message: "You can review only completed requests.",
      });
    }

    if (!request.provider) {
      return res.status(400).json({
        message: "This request has no assigned provider to review.",
      });
    }

    const existing = await Review.findOne({ request: request._id });
    if (existing) {
      return res.status(400).json({
        message: "Review already submitted for this request.",
      });
    }

    const commentStr =
      typeof comment === "string" ? comment.trim() : "";
    const helpful =
      typeof isHelpful === "boolean" ? isHelpful : false;

    let review;
    try {
      review = await Review.create({
        request: request._id,
        customer: req.user._id,
        provider: request.provider,
        rating: r,
        comment: commentStr,
        isHelpful: helpful,
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(400).json({
          message: "Review already submitted for this request.",
        });
      }
      throw err;
    }

    const providerRating = await updateProviderRating(request.provider);

    return res.status(201).json({
      message: "Review submitted successfully.",
      review: review.toObject(),
      providerRating: providerRating,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function getMyReviews(req, res) {
  try {
    const list = await Review.find({ customer: req.user._id })
      .sort({ createdAt: -1 })
      .populate("provider", "name phone providerType ratingAvg")
      .populate(
        "request",
        "serviceCategory serviceType totalAmount status vehicleInfo"
      )
      .lean();

    return res.json({
      message: "OK",
      count: list.length,
      reviews: list,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

async function getProviderReviews(req, res) {
  try {
    const { providerId } = req.params;

    if (!providerId || !mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        message: "Valid providerId is required.",
      });
    }

    const provider = await User.findById(providerId).select(
      "role providerType name"
    );

    if (!provider) {
      return res.status(404).json({
        message: "Provider not found.",
      });
    }

    if (provider.role !== "provider") {
      return res.status(400).json({
        message: "User is not a service provider.",
      });
    }

    const reviews = await Review.find({ provider: providerId })
      .sort({ createdAt: -1 })
      .populate("customer", "name")
      .populate("request", "serviceCategory serviceType vehicleInfo")
      .lean();

    const agg = await Review.aggregate([
      {
        $match: {
          provider: new mongoose.Types.ObjectId(providerId),
        },
      },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);

    let ratingAvg = 0;
    let ratingCount = 0;
    if (agg.length > 0) {
      ratingCount = agg[0].count;
      ratingAvg = Math.round(agg[0].avgRating * 10) / 10;
    }

    return res.json({
      message: "OK",
      count: reviews.length,
      ratingSummary: {
        ratingAvg,
        ratingCount,
      },
      reviews,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error.",
    });
  }
}

module.exports = {
  createReview,
  getMyReviews,
  getProviderReviews,
  updateProviderRating,
};
