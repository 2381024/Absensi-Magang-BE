const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  startShift,
  finishShift,
  getTodayLog,
  getLogs,
  getLogSummary,
  getLogById,
  getAllLogs,
  adminUpdateLog,
  deleteLog,
  addLogEntry,
  getLogEntries,
  deleteLogEntry,
} = require("../controllers/logController");

router.post("/start", authMiddleware, startShift);
router.put("/:id/finish", authMiddleware, finishShift);
router.get("/today", authMiddleware, getTodayLog);
router.get("/", authMiddleware, getLogs);
router.get("/summary", authMiddleware, getLogSummary);
router.get("/all", authMiddleware, adminMiddleware, getAllLogs);
router.get("/:id", authMiddleware, getLogById);
router.put("/:id", authMiddleware, adminMiddleware, adminUpdateLog);
router.delete("/:id", authMiddleware, adminMiddleware, deleteLog);
router.post("/:id/entries", authMiddleware, addLogEntry);
router.get("/:id/entries", authMiddleware, getLogEntries);
router.delete("/entries/:entryId", authMiddleware, deleteLogEntry);

module.exports = router;
