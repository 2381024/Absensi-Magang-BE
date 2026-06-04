const express = require("express");
const router = express.Router();
const { getHolidays, createHoliday, updateHoliday, deleteHoliday } = require("../controllers/holidayController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.get("/", getHolidays);
router.post("/", authMiddleware, adminMiddleware, createHoliday);
router.put("/:id", authMiddleware, adminMiddleware, updateHoliday);
router.delete("/:id", authMiddleware, adminMiddleware, deleteHoliday);

module.exports = router;
