const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const {
  createReview,
  getMyReviews,
  getProviderReviews,
} = require("../controllers/reviewController");

const router = express.Router();

router.post("/", protect, allowRoles("customer"), createReview);
router.get("/my", protect, allowRoles("customer"), getMyReviews);
router.get("/provider/:providerId", protect, getProviderReviews);

module.exports = router;
