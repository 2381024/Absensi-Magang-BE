const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: { message: "Akses admin diperlukan", status: 403 } });
  }
  next();
};

module.exports = adminMiddleware;
