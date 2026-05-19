const express = require("express");
const router = express.Router();
const { getProfile, updateProfile, uploadAvatar } = require("../controllers/profileController");
const authMiddleware = require("../middleware/authMiddleware");
const { uploadProfilePicture } = require("../middleware/uploadMiddleware");

router.use(authMiddleware);
router.get("/", getProfile);
router.put("/", updateProfile);
router.post("/avatar", uploadProfilePicture.single("avatar"), uploadAvatar);

module.exports = router;
