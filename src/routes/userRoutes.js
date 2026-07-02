const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  uploadUserAvatar,
} = require("../controllers/userController");
const {
  getUserAssignments,
  replaceUserAssignments,
} = require("../controllers/assignmentController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { uploadProfilePicture } = require("../middleware/uploadMiddleware");

router.use(authMiddleware, adminMiddleware);
router.get("/", getAllUsers);
router.get("/:id", getUserById);
router.post("/", createUser);
router.put("/:id", updateUser);
router.post("/:id/avatar", uploadProfilePicture.single("avatar"), uploadUserAvatar);
router.delete("/:id", deleteUser);

router.get("/:id/assignments", getUserAssignments);
router.put("/:id/assignments", replaceUserAssignments);

module.exports = router;
