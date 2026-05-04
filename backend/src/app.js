const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/authRoutes");
const requestRoutes = require("./routes/requestRoutes");
const providerRoutes = require("./routes/providerRoutes");
const reviewRoutes = require("./routes/reviewRoutes");

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN === "*" ? true : process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"))
);

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    message: "Rapid Assist API",
    endpoints: [
      "/health",
      "/api/auth/register",
      "/api/auth/login",
      "/api/auth/refresh",
      "/api/auth/me",
      "/api/auth/logout",
      "/api/requests/estimate",
      "/api/requests",
      "/api/requests/my",
      "/api/requests/:id",
      "/api/requests/:id/cancel",
      "/api/requests/:id/customer-images",
      "/api/provider/*",
      "/api/reviews",
      "/api/reviews/my",
      "/api/reviews/provider/:providerId",
    ],
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "OK",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/provider", providerRoutes);
app.use("/api/reviews", reviewRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    path: req.path,
  });
});
app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
});

module.exports = { app };
