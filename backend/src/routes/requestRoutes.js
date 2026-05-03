const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const {
  uploadCustomerImages,
  handleMulterError,
} = require("../middleware/uploadMiddleware");
const {
  estimate,
  createRequest,
  listMyRequests,
  getRequestById,
  cancelRequest,
  patchCustomerImages,
} = require("../controllers/requestController");

const router = express.Router();

const customerAuth = [protect, allowRoles("customer")];

router.post("/estimate", customerAuth, estimate);
router.post("/", customerAuth, createRequest);
router.get("/my", customerAuth, listMyRequests);
router.get("/:id", customerAuth, getRequestById);
router.patch("/:id/cancel", customerAuth, cancelRequest);
router.patch(
  "/:id/customer-images",
  customerAuth,
  uploadCustomerImages,
  handleMulterError,
  patchCustomerImages
);

module.exports = router;
