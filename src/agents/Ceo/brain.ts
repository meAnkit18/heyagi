import { chat, type SimpleMessage } from "../../provider/index.js";
import { CEO_SYSTEM_PROMPT, type CeoResponse } from "./Schema.js";
import { getMemoryContext, appendDaily } from "../../memory/index.js";

/**
 * CEO brain — the conversational gateway.
 *
 * 1. Loads persistent memory context.
 * 2. Prepends the CEO system prompt + memory to the conversation history.
 * 3. Calls the LLM.
 * 4. Parses the structured JSON response.
 * 5. Auto-flushes a summary of the exchange to the daily log.
 * 6. Returns a clean CeoResponse.
 */
export async function ceoBrain(
  history: SimpleMessage[],
): Promise<CeoResponse> {
  // Load persistent memory context
  const memoryCtx = await getMemoryContext();

  // Build message list with system prompt + memory at the front
  const messages: SimpleMessage[] = [
    { role: "system", content: CEO_SYSTEM_PROMPT },
    ...(memoryCtx.trim()
      ? [{ role: "system" as const, content: memoryCtx }]
      : []),
    ...history,
  ];

  const raw = await chat(messages, { temperature: 0.7, maxTokens: 1024 });

  // ── Parse LLM response ─────────────────────────────────
  const parsed = tryParseJson(raw);
  let result: CeoResponse;

  if (parsed) {
    const intent = parsed.intent === "task" ? "task" : "chat";
    const reply = String(parsed.reply ?? "");
    const taskSummary = parsed.taskSummary
      ? String(parsed.taskSummary)
      : undefined;

    if (intent === "task") {
      console.log("planning task");
      if (taskSummary) {
        console.log(`  └─ ${taskSummary}`);
      }
    }

    result = { intent, reply, taskSummary };
  } else {
    // ── Regex fallback for partial / malformed JSON ────────
    const fallback = extractFromPartialJson(raw);
    if (fallback) {
      if (fallback.intent === "task") {
        console.log("planning task");
        if (fallback.taskSummary) {
          console.log(`  └─ ${fallback.taskSummary}`);
        }
      }
      result = fallback;
    } else {
      // Last resort — treat entire output as a chat reply
      result = { intent: "chat", reply: raw };
    }
  }

  // ── Auto-flush exchange to daily memory log ────────────
  const lastUserMsg = history.filter((m) => m.role === "user").pop();
  if (lastUserMsg) {
    const logEntry =
      `**User:** ${lastUserMsg.content.slice(0, 200)}\n` +
      `**Agent:** ${result.reply.slice(0, 200)}\n` +
      (result.intent === "task" && result.taskSummary
        ? `**Task:** ${result.taskSummary}\n`
        : "");
    appendDaily(logEntry).catch((err) =>
      console.error("Memory flush failed:", err),
    );
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Try to parse a complete JSON object from the LLM output.
 * Handles optional markdown fences.
 */
function tryParseJson(text: string): Record<string, unknown> | null {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const cleaned = fenceMatch ? fenceMatch[1].trim() : text.trim();

  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      return obj as Record<string, unknown>;
    }
  } catch {
    // Not valid JSON
  }

  return null;
}

/**
 * Regex-based extraction for when the JSON is truncated or malformed.
 * Pulls intent, reply, and taskSummary individually.
 */
function extractFromPartialJson(text: string): CeoResponse | null {
  const intentMatch = text.match(/"intent"\s*:\s*"(chat|task)"/);
  const replyMatch = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);

  if (!intentMatch || !replyMatch) return null;

  const intent = intentMatch[1] as "chat" | "task";
  // Unescape basic JSON escapes
  const reply = replyMatch[1]
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

  const taskMatch = text.match(/"taskSummary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const taskSummary = taskMatch
    ? taskMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
    : undefined;

  return { intent, reply, taskSummary };
}

