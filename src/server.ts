import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Resolve .env from project root (one level above src/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

import express from "express";
import cors from "cors";
import type { SimpleMessage } from "./provider/index.js";
import { ceoBrain } from "./agents/Ceo/brain.js";
import {
  getMemoryStatus,
  searchMemory,
  appendDaily,
  flushToLongTerm,
} from "./memory/index.js";

console.log("LLM_API_KEY loaded:", process.env.LLM_API_KEY ? "✓" : "✗ MISSING");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// In-memory message store (plain user/assistant history — no system prompt)
const messages: SimpleMessage[] = [];

// Webhook endpoint — receives user messages, routes through CEO brain
app.post("/webhook", async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing 'message' string in body" });
    return;
  }

  // Store user message
  messages.push({ role: "user", content: message });

  try {
    // Route through the CEO agent brain
    const ceoRes = await ceoBrain(messages);

    messages.push({ role: "assistant", content: ceoRes.reply });

    res.json({
      reply: ceoRes.reply,
      intent: ceoRes.intent,
      ...(ceoRes.taskSummary && { taskSummary: ceoRes.taskSummary }),
    });
  } catch (err: any) {
    console.error("CEO brain error:", err?.message ?? err);
    const fallback = "[error] LLM call failed — check server logs.";
    messages.push({ role: "assistant", content: fallback });
    res.status(502).json({ reply: fallback });
  }
});

// Get chat history
app.get("/messages", (_req, res) => {
  res.json({ messages });
});

// ── Memory endpoints ──────────────────────────────────────

/** GET /memory — view current memory state */
app.get("/memory", async (_req, res) => {
  try {
    const status = await getMemoryStatus();
    res.json(status);
  } catch (err: any) {
    console.error("Memory read error:", err?.message ?? err);
    res.status(500).json({ error: "Failed to read memory" });
  }
});

/** POST /memory/search — keyword search across all memory files */
app.post("/memory/search", async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Missing 'query' string in body" });
    return;
  }
  try {
    const results = await searchMemory(query);
    res.json({ results });
  } catch (err: any) {
    console.error("Memory search error:", err?.message ?? err);
    res.status(500).json({ error: "Search failed" });
  }
});

/** POST /memory/flush — write to daily log or long-term memory */
app.post("/memory/flush", async (req, res) => {
  const { content, target } = req.body;
  if (!content || typeof content !== "string") {
    res.status(400).json({ error: "Missing 'content' string in body" });
    return;
  }
  try {
    if (target === "longterm") {
      await flushToLongTerm(content);
    } else {
      await appendDaily(content);
    }
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Memory flush error:", err?.message ?? err);
    res.status(500).json({ error: "Flush failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
