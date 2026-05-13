const express = require("express");
const router = express.Router();
const { getConfig, updateConfig } = require("../controllers/configController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.use(authMiddleware, adminMiddleware);
router.get("/", getConfig);
router.put("/", updateConfig);

module.exports = router;
