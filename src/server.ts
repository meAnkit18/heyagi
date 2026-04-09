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
import { processTask } from "./agents/Task_Manager/brain.js";
import { createTaskLogger } from "./agents/Task_Manager/task-logger.js";
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

// Task processing endpoint — receives task from CEO for processing
app.post("/task", async (req, res) => {
  const { taskId, taskSummary } = req.body;

  if (!taskId || !taskSummary) {
    res.status(400).json({ error: "Missing taskId or taskSummary in body" });
    return;
  }

  try {
    // Process the task using Task_Manager
    const { plan, contextFilePath } = await processTask(
      taskId, taskSummary, path.join(__dirname, "..", "memory", "tasks")
    );
    res.json({
      success: true,
      message: `Task ${taskId} processed successfully`,
      stepsCount: plan.steps.length,
      contextFile: contextFilePath,
    });
  } catch (err: any) {
    console.error("Task processing error:", err?.message ?? err);
    res.status(500).json({ error: "Task processing failed" });
  }
});

// ── SSE streaming endpoint for task processing logs ───────

/** GET /task/stream?taskId=...&taskSummary=... — streams task processing logs via SSE */
app.get("/task/stream", async (req, res) => {
  const taskId = req.query.taskId as string;
  const taskSummary = req.query.taskSummary as string;

  if (!taskId || !taskSummary) {
    res.status(400).json({ error: "Missing taskId or taskSummary query params" });
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Create a logger for this task
  const logger = createTaskLogger(taskId);

  // Stream each log event to the client
  logger.on("log", (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // When the task is done, close the stream
  logger.on("done", () => {
    res.write(`data: ${JSON.stringify({ type: "close" })}\n\n`);
    res.end();
  });

  // Handle client disconnect
  req.on("close", () => {
    logger.removeAllListeners();
  });

  // Process the task with the logger
  try {
    await processTask(
      taskId,
      taskSummary,
      path.join(__dirname, "..", "memory", "tasks"),
      logger
    );
  } catch (err: any) {
    logger.log("error", `Task failed: ${err?.message ?? err}`);
    logger.done("Task processing failed");
  }
});

// Get chat history
app.get("/messages", (_req, res) => {
  res.json({ messages });
});

// ── Task context endpoint ─────────────────────────────────

/** GET /task/context — returns the current TASK_CONTEXT.md content */
app.get("/task/context", async (_req, res) => {
  const contextPath = path.join(__dirname, "..", "memory", "tasks", "TASK_CONTEXT.md");
  try {
    const { readFile } = await import("fs/promises");
    const content = await readFile(contextPath, "utf-8");
    res.json({ exists: true, content });
  } catch {
    res.json({ exists: false, content: null });
  }
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
