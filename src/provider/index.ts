/**
 * Centralized AI provider — import everything from here.
 *
 * Usage:
 *   import { chat, chatStream, getLLM, describeImage } from "./provider";
 */
export { getLLM, chat, chatStream, toLangChainMessages } from "./llm.js";
export type { SimpleMessage, Role } from "./llm.js";
export { getVLM, describeImage } from "./vlm.js";
