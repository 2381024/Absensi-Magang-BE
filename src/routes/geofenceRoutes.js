const express = require("express");
const router = express.Router();
const {
  getGeofences,
  createGeofence,
  updateGeofence,
  deleteGeofence,
  toggleGeofence,
} = require("../controllers/geofenceController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.use(authMiddleware, adminMiddleware);
router.get("/", getGeofences);
router.post("/", createGeofence);
router.put("/:id", updateGeofence);
router.delete("/:id", deleteGeofence);
router.patch("/:id/toggle", toggleGeofence);

module.exports = router;
