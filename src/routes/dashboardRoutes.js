const express = require("express");
const router = express.Router();
const { getStats, getRecentLogs } = require("../controllers/dashboardController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.use(authMiddleware, adminMiddleware);
router.get("/stats", getStats);
router.get("/recent-logs", getRecentLogs);

module.exports = router;
