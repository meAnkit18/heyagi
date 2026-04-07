import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";

// ── singleton ──────────────────────────────────────────────
let _vlm: ChatOpenAI | null = null;

/**
 * Returns a shared ChatOpenAI instance tuned for vision tasks.
 *
 * Falls back to the LLM env vars when VLM-specific ones aren't set.
 *
 * Env vars:
 *   VLM_API_KEY   – defaults to LLM_API_KEY
 *   VLM_BASE_URL  – defaults to LLM_BASE_URL
 *   VLM_MODEL     – defaults to LLM_MODEL
 */
export function getVLM(): ChatOpenAI {
  if (!_vlm) {
    _vlm = new ChatOpenAI({
      openAIApiKey:
        process.env.VLM_API_KEY || process.env.LLM_API_KEY,
      configuration: {
        baseURL:
          process.env.VLM_BASE_URL ||
          process.env.LLM_BASE_URL ||
          "https://integrate.api.nvidia.com/v1",
      },
      modelName:
        process.env.VLM_MODEL ||
        process.env.LLM_MODEL ||
        "qwen/qwen3-coder-480b-a35b-instruct",
      temperature: 0.3,
      maxTokens: 2048,
    });
  }
  return _vlm;
}

/**
 * Describe an image (URL or base64 data-URI).
 *
 * @param imageUrl  – public URL or `data:image/...;base64,...`
 * @param prompt    – optional instruction (default: "Describe this image.")
 */
export async function describeImage(
  imageUrl: string,
  prompt = "Describe this image in detail.",
): Promise<string> {
  const vlm = getVLM();

  const message = new HumanMessage({
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageUrl } },
    ],
  });

  const res = await vlm.invoke([message]);
  return typeof res.content === "string"
    ? res.content
    : JSON.stringify(res.content);
}
