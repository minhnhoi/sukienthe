require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");

const app = express();
const ROOT = process.cwd();

const PORT = Number(process.env.PORT || process.env.APP_PORT || 4000);

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error(
    "❌ Missing MONGODB_URI. Set it in .env (local) or Render Environment Variables."
  );
  process.exit(1);
}

/**
 * Chuẩn hoá để chống trùng:
 * - trim
 * - gộp mọi khoảng trắng (space/tab/newline) thành 1 space
 * - lowercase
 */
function normalizeText(input) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const EntrySchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    text: { type: String, required: true },
    // NEW: khóa chống trùng
    norm: { type: String, required: true, index: true },
    createdAt: { type: Number, required: true, index: true },
  },
  { versionKey: false, timestamps: false }
);

// Unique index cho norm (chống trùng ở DB-level)
EntrySchema.index({ norm: 1 }, { unique: true });

const Entry = mongoose.model("Entry", EntrySchema);

// serve frontend
app.use(express.static(ROOT));
app.use(express.json({ limit: "200kb" }));

app.get("/api/health", async (req, res) => {
  try {
    const connected = mongoose.connection.readyState === 1;
    res.json({ ok: true, db: connected });
  } catch (e) {
    res.status(500).json({ ok: false, db: false, error: e.message });
  }
});

// list entries (latest first)
app.get("/api/entries", async (req, res) => {
  try {
    const docs = await Entry.find({}, { _id: 0 })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const items = docs.map((x) => ({
      id: x.id,
      text: x.text,
      createdAt: Number(x.createdAt),
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
});

// add entry (ANTI-DUP)
app.post("/api/entries", async (req, res) => {
  try {
    const text = (req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Text is required" });

    const norm = normalizeText(text);
    if (!norm) return res.status(400).json({ error: "Text is required" });

    // 1) Check trùng trước
    const existed = await Entry.findOne({ norm }, { _id: 0 }).lean();
    if (existed) {
      return res.json({ exists: true, entry: existed });
    }

    // 2) Tạo mới
    const entry = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      text,
      norm,
      createdAt: Date.now(),
    };

    try {
      await Entry.create(entry);
      return res.json({ exists: false, entry });
    } catch (err) {
      // 3) Chặn race-condition bằng unique index
      if (err && (err.code === 11000 || String(err.message || "").includes("E11000"))) {
        const existed2 = await Entry.findOne({ norm }, { _id: 0 }).lean();
        return res.json({ exists: true, entry: existed2 || null });
      }
      throw err;
    }
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
});

// delete entry by id
app.delete("/api/entries/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });

    const r = await Entry.deleteOne({ id });
    if ((r.deletedCount || 0) === 0)
      return res.status(404).json({ error: "Not found" });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
});

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
  } catch (e) {
    console.error("❌ Mongo connect failed:", e);
    process.exit(1);
  }
}

start();

process.on("SIGTERM", async () => {
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(0);
});
