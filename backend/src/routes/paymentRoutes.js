const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const {
  getPaymentSummary,
  initiatePayment,
  markPaymentSuccess,
  markPaymentFailed,
  listMyPayments,
  getPaymentById,
} = require("../controllers/paymentController");

const router = express.Router();

router.get("/my", protect, listMyPayments);
router.get("/request/:requestId/summary", protect, getPaymentSummary);
router.post(
  "/request/:requestId/initiate",
  protect,
  allowRoles("customer"),
  initiatePayment
);
router.patch(
  "/:paymentId/success",
  protect,
  allowRoles("customer", "admin"),
  markPaymentSuccess
);
router.patch(
  "/:paymentId/failed",
  protect,
  allowRoles("customer", "admin"),
  markPaymentFailed
);
router.get("/:paymentId", protect, getPaymentById);

module.exports = router;
