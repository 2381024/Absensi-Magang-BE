require("dotenv").config();

// Force process timezone to Asia/Jakarta (WIB) so new Date() is always WIB,
// regardless of server system timezone.
process.env.TZ = process.env.APP_TIMEZONE || "Asia/Jakarta";

const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const compression = require("compression");

const { closePool } = require("./src/config/db");
const healthRoutes = require("./src/routes/healthRoutes");
const authRoutes = require("./src/routes/authRoutes");
const userRoutes = require("./src/routes/userRoutes");
const profileRoutes = require("./src/routes/profileRoutes");
const geofenceRoutes = require("./src/routes/geofenceRoutes");
const logRoutes = require("./src/routes/logRoutes");
const dashboardRoutes = require("./src/routes/dashboardRoutes");
const configRoutes = require("./src/routes/configRoutes");
const scheduleRoutes = require("./src/routes/scheduleRoutes");
const rekapRoutes = require("./src/routes/rekapRoutes");
const leaveRoutes = require("./src/routes/leaveRoutes");
const holidayRoutes = require("./src/routes/holidayRoutes");
const errorHandler = require("./src/middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy (important when behind reverse proxy / load balancer)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Compression: gzip responses to reduce bandwidth
app.use(compression());

const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
};
app.use(cors(corsOptions));
app.use(express.json());

// Serve static uploads folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Rate limiter for login endpoint
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 attempts per minute
  message: {
    error: {
      message: "Terlalu banyak percobaan login. Coba lagi dalam 1 menit.",
      status: 429,
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/geofence", geofenceRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/config", configRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/rekap", rekapRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/health", healthRoutes);

// Error handler
app.use(errorHandler);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown: finish in-flight requests before closing
const shutdown = async (signal) => {
  console.log(`${signal} received. Starting graceful shutdown...`);
  server.close(async () => {
    console.log("HTTP server closed.");
    await closePool();
    process.exit(0);
  });

  // Force shutdown if graceful shutdown takes longer than 10 seconds
  setTimeout(() => {
    console.error("Forced shutdown: timeout exceeded");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));