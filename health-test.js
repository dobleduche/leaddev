
const express = require("express");
const app = express();
app.get("/health", (_req, res) => res.json({ ok: true, uptime: process.uptime() }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, "127.0.0.1", () => console.log(`Listening on http://127.0.0.1:${PORT}`));
