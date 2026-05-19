const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  getAllSchedules,
  getScheduleByUserId,
  getMySchedule,
  importSchedules,
  updateSchedule,
  deleteSchedule,
} = require("../controllers/scheduleController");

// User route — must be before :userId param routes
router.get("/me", authMiddleware, getMySchedule);

// Admin routes
router.get("/", authMiddleware, adminMiddleware, getAllSchedules);
router.get("/user/:userId", authMiddleware, adminMiddleware, getScheduleByUserId);
router.post("/import", authMiddleware, adminMiddleware, importSchedules);
router.put("/user/:userId", authMiddleware, adminMiddleware, updateSchedule);
router.delete("/user/:userId/day/:dayOfWeek", authMiddleware, adminMiddleware, deleteSchedule);

module.exports = router;
