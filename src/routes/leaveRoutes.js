const express = require("express");
const router = express.Router();
const {
  submitLeave, getMyLeaves, deleteMyLeave,
  getAllLeaves, approveLeave, rejectLeave, getPendingCount
} = require("../controllers/leaveController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

// User routes
router.use(authMiddleware);
router.get("/", getMyLeaves);
router.post("/", submitLeave);
router.delete("/:id", deleteMyLeave);

// Admin routes
router.get("/all", adminMiddleware, getAllLeaves);
router.get("/pending-count", adminMiddleware, getPendingCount);
router.put("/:id/approve", adminMiddleware, approveLeave);
router.put("/:id/reject", adminMiddleware, rejectLeave);

module.exports = router;
