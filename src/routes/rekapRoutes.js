const express = require("express");
const router = express.Router();
const { getRekapAll } = require("../controllers/rekapController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.use(authMiddleware, adminMiddleware);
router.get("/all", getRekapAll);

module.exports = router;
