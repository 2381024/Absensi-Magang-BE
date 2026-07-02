const express = require("express");
const router = express.Router();
const { getStats, getRecentLogs, getWeeklyStats } = require("../controllers/dashboardController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.use(authMiddleware, adminMiddleware);
router.get("/stats", getStats);
router.get("/recent-logs", getRecentLogs);
router.get("/weekly-stats", getWeeklyStats);

module.exports = router;
