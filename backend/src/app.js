const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN === "*" ? true : process.env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    message: "Rapid Assist API",
    endpoints: ["/health"],
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.path });
});

module.exports = { app };

