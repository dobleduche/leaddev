// mini.mjs  (ESM, no dependencies)
import http from "http";

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"; // bind all interfaces

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, HOST, () => {
  console.log(`Listening on http://127.0.0.1:${PORT} (host: ${HOST})`);
});
