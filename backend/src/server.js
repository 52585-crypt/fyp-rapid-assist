const http = require("http");
const dotenv = require("dotenv");

dotenv.config();

const { app } = require("./app");
const { connectDB } = require("./config/db");

const port = Number(process.env.PORT || 5000);
const server = http.createServer(app);

async function start() {
  await connectDB();

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${port}`);
  });
}

start();

