const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const ROOT = process.cwd();
const PORT = 4000;

// auto-create data folder
const dataDir = path.join(ROOT, "data");
const entriesFile = path.join(dataDir, "entries.jsonl");
fs.mkdirSync(dataDir, { recursive: true });

// serve frontend
app.use(express.static(ROOT));
app.use(express.json({ limit: "200kb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

function readAllEntries() {
  if (!fs.existsSync(entriesFile)) return [];
  const lines = fs
    .readFileSync(entriesFile, "utf8")
    .split("\n")
    .filter(Boolean);
  const items = [];
  for (const line of lines) {
    try {
      items.push(JSON.parse(line));
    } catch {}
  }
  return items;
}

function writeAllEntries(items) {
  const content =
    items.map((x) => JSON.stringify(x)).join("\n") + (items.length ? "\n" : "");
  fs.writeFileSync(entriesFile, content, "utf8");
}

// list entries (latest first)
app.get("/api/entries", (req, res) => {
  const items = readAllEntries()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 500);
  res.json({ items });
});

// add entry
app.post("/api/entries", (req, res) => {
  try {
    const text = (req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Text is required" });

    const entry = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      text,
      createdAt: Date.now(),
    };

    fs.appendFileSync(entriesFile, JSON.stringify(entry) + "\n", "utf8");
    res.json({ entry });
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
});

// delete entry by id
app.delete("/api/entries/:id", (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });

    const items = readAllEntries();
    const before = items.length;
    const filtered = items.filter((x) => x.id !== id);

    if (filtered.length === before) {
      return res.status(404).json({ error: "Not found" });
    }

    writeAllEntries(filtered);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
});

app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));