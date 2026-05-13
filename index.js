const express = require("express");
const cors = require("cors");
require("dotenv").config();

const healthRoutes = require("./src/routes/healthRoutes");
const authRoutes = require("./src/routes/authRoutes");
const userRoutes = require("./src/routes/userRoutes");
const profileRoutes = require("./src/routes/profileRoutes");
const geofenceRoutes = require("./src/routes/geofenceRoutes");
const logRoutes = require("./src/routes/logRoutes");
const dashboardRoutes = require("./src/routes/dashboardRoutes");
const configRoutes = require("./src/routes/configRoutes");
const errorHandler = require("./src/middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/geofence", geofenceRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/config", configRoutes);
app.use("/api/health", healthRoutes);

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
