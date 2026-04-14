import {
  Task,
  Subtask,
  TaskAssignment,
  ExecutionStep,
  ExecutionPlan,
  AgentManifest,
  TASK_MANAGER_SYSTEM_PROMPT,
} from "./Schema.js";
import { chat, type SimpleMessage } from "../../provider/index.js";
import fs from "fs/promises";
import path from "path";

/**
 * Agent capability mapping — keyword-based fallback for when LLM is unavailable
 */
interface AgentCapabilities {
  [agentName: string]: string[];
}

const AGENT_CAPABILITY_REGISTRY: AgentCapabilities = {
  Researcher: [
    "research", "gather", "requirement", "analysis", "investigate", "data",
    "find", "search", "explore", "study",
  ],
  Developer: [
    "implement", "code", "build", "develop", "create", "write code",
    "feature", "fix", "refactor", "program",
  ],
  Tester: [
    "test", "testing", "validate", "validation", "qa", "quality", "verify",
    "check", "assert",
  ],
  Documenter: [
    "document", "documentation", "write", "guide", "readme", "manual",
    "explain", "describe",
  ],
  Ceo: [
    "plan", "strategy", "architecture", "design", "decide", "review",
    "approve", "prioritize",
  ],
};

// ── Keyword-based helpers (fallback) ────────────────────────

function findBestAgent(
  subtaskDescription: string,
  availableAgents: string[]
): string {
  const lowerDesc = subtaskDescription.toLowerCase();
  const scores: { [agent: string]: number } = {};

  availableAgents.forEach((agent) => {
    scores[agent] = 0;
  });

  for (const [agentName, keywords] of Object.entries(AGENT_CAPABILITY_REGISTRY)) {
    if (!availableAgents.includes(agentName)) continue;
    keywords.forEach((keyword) => {
      if (lowerDesc.includes(keyword.toLowerCase())) {
        scores[agentName] = (scores[agentName] || 0) + 1;
      }
    });
  }

  let bestAgent = availableAgents[0];
  let maxScore = 0;
  for (const [agent, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestAgent = agent;
    }
  }
  return bestAgent;
}

function generateAssignmentReason(
  subtaskDescription: string,
  agent: string
): string {
  const keywords = AGENT_CAPABILITY_REGISTRY[agent] || [];
  const matched = keywords.filter(
    (k) => subtaskDescription.toLowerCase().includes(k.toLowerCase())
  );
  if (matched.length > 0) {
    return `Agent specializes in: ${matched.join(", ")}`;
  }
  return `Best match for: ${subtaskDescription}`;
}

// ── Hardcoded fallback decomposition ────────────────────────

export function breakDownTask(taskSummary: string): Subtask[] {
  const baseSubtasks = [
    "Research and gather requirements",
    "Design solution architecture",
    "Implement core functionality",
    "Write unit tests",
    "Documentation",
    "Code review and refinement",
  ];

  return baseSubtasks.map((desc, index) => ({
    id: `subtask-${index + 1}`,
    description: desc,
    status: "pending" as const,
  }));
}

// ── LLM-powered decomposition ───────────────────────────────

/**
 * Use the LLM to intelligently decompose a task into agent-specific steps.
 * Falls back to keyword-based breakdown if the LLM call fails.
 */
export async function breakDownTaskWithLLM(
  taskSummary: string,
  availableAgents: string[] | AgentManifest[]
): Promise<ExecutionStep[]> {
  try {
    const agentList = (availableAgents as any[])
      .filter((a) => (typeof a === "string" ? a : a.name) !== "Task_Manager")
      .map((a) =>
        typeof a === "string"
          ? a
          : `${a.name}${a.description ? ` (${a.description})` : ""}${a.capabilities.length ? ` [capabilities: ${a.capabilities.join(", ")}]` : ""}${a.mcps.length ? ` [mcps: ${a.mcps.join(", ")}]` : ""}`
      )
      .join("\n");

    const messages: SimpleMessage[] = [
      { role: "system", content: TASK_MANAGER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Available agents:\n${agentList}\n\nTask to decompose: "${taskSummary}"`,
      },
    ];

    const raw = await chat(messages, { temperature: 0.4, maxTokens: 1024 });
    const parsed = tryParseJson(raw);

    if (parsed && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
      console.log(`  LLM produced ${parsed.steps.length} steps`);

      return parsed.steps.map((step: any, index: number) => ({
        stepNumber: step.stepNumber ?? index + 1,
        description: String(step.description || ""),
        assignedAgent: resolveAgent(
          String(step.suggestedAgent || ""),
          String(step.description || ""),
          toNames(availableAgents)
        ),
        status: "pending" as const,
        dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn : [],
        agentFeedback: [],
      }));
    }

    console.warn("  LLM response was not a valid step list, using fallback");
  } catch (err: any) {
    console.warn(`  LLM decomposition failed: ${err?.message ?? err}`);
  }

  // ── Fallback: convert hardcoded subtasks into ExecutionSteps ──
  return fallbackDecomposition(taskSummary, toNames(availableAgents));
}

/** Normalize string[] | AgentManifest[] → string[] of names */
function toNames(agents: string[] | AgentManifest[]): string[] {
  return (agents as any[]).map((a) => (typeof a === "string" ? a : a.name));
}

/**
 * If the LLM suggested an agent name that exists, use it.
 * Otherwise fall back to keyword-based matching.
 */
function resolveAgent(
  suggested: string,
  description: string,
  availableAgents: string[]
): string {
  const assignable = availableAgents.filter((a) => a !== "Task_Manager");

  // Check exact match (case-insensitive)
  const match = assignable.find(
    (a) => a.toLowerCase() === suggested.toLowerCase()
  );
  if (match) return match;

  // Keyword fallback
  return findBestAgent(description, assignable);
}

/**
 * Deterministic fallback when LLM is unavailable
 */
function fallbackDecomposition(
  taskSummary: string,
  availableAgents: string[]
): ExecutionStep[] {
  const subtasks = breakDownTask(taskSummary);
  const assignable = availableAgents.filter((a) => a !== "Task_Manager");

  return subtasks.map((st, index) => ({
    stepNumber: index + 1,
    description: st.description,
    assignedAgent: findBestAgent(st.description, assignable),
    status: "pending" as const,
    dependsOn: index === 0 ? [] : [index], // each depends on previous
    agentFeedback: [],
  }));
}

// ── Build the full ExecutionPlan ─────────────────────────────

/**
 * Package steps into a complete ExecutionPlan object
 */
export function buildExecutionPlan(
  taskId: string,
  taskSummary: string,
  steps: ExecutionStep[]
): ExecutionPlan {
  return {
    taskId,
    taskSummary,
    createdAt: new Date().toISOString(),
    steps,
    overallStatus: "pending",
  };
}

// ── Job file creation ────────────────────────────────────────

/**
 * Write a per-task markdown job file with the execution plan
 */
export async function createJobFile(
  plan: ExecutionPlan,
  taskDir: string
): Promise<string> {
  const jobFilePath = path.join(taskDir, `job${plan.taskId}.md`);

  let md = `# Task: ${plan.taskSummary}\n\n`;
  md += `**Task ID:** ${plan.taskId}\n`;
  md += `**Created:** ${plan.createdAt}\n`;
  md += `**Status:** ${plan.overallStatus}\n\n`;

  md += `## Execution Plan\n\n`;
  plan.steps.forEach((step) => {
    const deps =
      step.dependsOn.length > 0
        ? ` (depends on step ${step.dependsOn.join(", ")})`
        : " (can start immediately)";
    const checkbox = step.status === "completed" ? "[x]" : "[ ]";
    md += `${checkbox} **Step ${step.stepNumber}** — ${step.description}\n`;
    md += `   - Agent: ${step.assignedAgent}\n`;
    md += `   - Status: ${step.status}${deps}\n\n`;
  });

  await fs.writeFile(jobFilePath, md, "utf-8");
  return jobFilePath;
}

// ── Legacy assignTasks (kept for backward compat) ────────────

export function assignTasks(
  subtasks: Subtask[],
  availableAgents: string[] = Object.keys(AGENT_CAPABILITY_REGISTRY)
): TaskAssignment[] {
  const assignments: TaskAssignment[] = [];
  subtasks.forEach((subtask) => {
    const bestAgent = findBestAgent(subtask.description, availableAgents);
    const reason = generateAssignmentReason(subtask.description, bestAgent);
    assignments.push({ subtask, agent: bestAgent, reason });
  });
  return assignments;
}

// ── JSON parsing helper ──────────────────────────────────────

function tryParseJson(text: string): Record<string, any> | null {
  // Strip markdown fences if present
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const cleaned = fenceMatch ? fenceMatch[1].trim() : text.trim();

  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      return obj;
    }
  } catch {
    // Not valid JSON
  }
  return null;
}