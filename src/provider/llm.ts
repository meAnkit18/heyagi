import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  type BaseMessage,
} from "@langchain/core/messages";

// ── singleton ──────────────────────────────────────────────
let _llm: ChatOpenAI | null = null;

/**
 * Returns a shared ChatOpenAI instance configured from env vars.
 * Only connection-level config lives here (API key, base URL, model).
 * Per-call params like temperature / maxTokens are set at each call site.
 *
 * Env vars:
 *   LLM_API_KEY   – API key  (required at runtime)
 *   LLM_BASE_URL  – OpenAI-compatible endpoint
 *   LLM_MODEL     – model name
 */
export function getLLM(): ChatOpenAI {
  if (!_llm) {
    const apiKey = process.env.LLM_API_KEY;
    // LangChain internally also checks OPENAI_API_KEY env var
    if (apiKey && !process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = apiKey;
    }

    _llm = new ChatOpenAI({
      apiKey,
      configuration: {
        baseURL: process.env.LLM_BASE_URL || "https://integrate.api.nvidia.com/v1",
      },
      model: process.env.LLM_MODEL || "qwen/qwen3-coder-480b-a35b-instruct",
      streaming: true,
    });
  }
  return _llm;
}

// ── helper types ───────────────────────────────────────────
export type Role = "user" | "assistant" | "system";

export interface SimpleMessage {
  role: Role;
  content: string;
}

/** Per-call options that each call site can customise */
export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

// ── convenience helpers ────────────────────────────────────

/** Convert our simple {role, content} messages into LangChain BaseMessages */
export function toLangChainMessages(msgs: SimpleMessage[]): BaseMessage[] {
  return msgs.map((m) => {
    switch (m.role) {
      case "system":
        return new SystemMessage(m.content);
      case "assistant":
        return new AIMessage(m.content);
      default:
        return new HumanMessage(m.content);
    }
  });
}

/**
 * One-shot chat: send messages → get a string reply.
 * Pass opts to control temperature, maxTokens, topP per call.
 */
export async function chat(
  messages: SimpleMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  const llm = getLLM();
  const callOpts: Record<string, unknown> = {};
  if (opts.temperature !== undefined) callOpts.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) callOpts.max_tokens = opts.maxTokens;
  if (opts.topP !== undefined) callOpts.top_p = opts.topP;

  const res = await llm.invoke(toLangChainMessages(messages), callOpts);
  return typeof res.content === "string"
    ? res.content
    : JSON.stringify(res.content);
}

/**
 * Streaming chat: yields string chunks as they arrive.
 * Pass opts to control temperature, maxTokens, topP per call.
 */
export async function* chatStream(
  messages: SimpleMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string> {
  const llm = getLLM();
  const callOpts: Record<string, unknown> = {};
  if (opts.temperature !== undefined) callOpts.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) callOpts.max_tokens = opts.maxTokens;
  if (opts.topP !== undefined) callOpts.top_p = opts.topP;

  const stream = await llm.stream(toLangChainMessages(messages), callOpts);
  for await (const chunk of stream) {
    const text =
      typeof chunk.content === "string"
        ? chunk.content
        : JSON.stringify(chunk.content);
    if (text) yield text;
  }
}
