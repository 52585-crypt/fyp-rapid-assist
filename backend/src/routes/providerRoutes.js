const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const {
  uploadProofImages,
  handleMulterError,
} = require("../middleware/uploadMiddleware");
const provider = require("../controllers/providerController");

const router = express.Router();

const providerAuth = [protect, allowRoles("provider")];

router.patch("/availability", providerAuth, provider.patchAvailability);
router.patch("/service-area", providerAuth, provider.patchServiceArea);
router.patch("/location", providerAuth, provider.patchLocation);

router.get("/requests", providerAuth, provider.getMatchingRequests);
router.get("/dashboard", providerAuth, provider.getDashboard);
router.get("/jobs", providerAuth, provider.listJobs);
router.get("/jobs/:id", providerAuth, provider.getJobById);

router.patch("/jobs/:id/accept", providerAuth, provider.acceptJob);
router.patch("/jobs/:id/decline", providerAuth, provider.declineJob);
router.patch("/jobs/:id/on-the-way", providerAuth, provider.patchOnTheWay);
router.patch("/jobs/:id/arrived", providerAuth, provider.patchArrived);
router.patch(
  "/jobs/:id/start-inspection",
  providerAuth,
  provider.patchStartInspection
);
router.patch(
  "/jobs/:id/start-service",
  providerAuth,
  provider.patchStartService
);
router.patch(
  "/jobs/:id/vehicle-picked-up",
  providerAuth,
  provider.patchVehiclePickedUp
);
router.patch("/jobs/:id/delivered", providerAuth, provider.patchDelivered);
router.patch("/jobs/:id/complete", providerAuth, provider.patchComplete);
router.patch(
  "/jobs/:id/add-extra-work",
  providerAuth,
  provider.addExtraWork
);
router.patch(
  "/jobs/:id/proof-images",
  providerAuth,
  uploadProofImages,
  handleMulterError,
  provider.patchProofImages
);

module.exports = router;
