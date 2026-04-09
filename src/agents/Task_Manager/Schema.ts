// ── Task Manager Types & System Prompt ────────────────────────

/** Task status types */
export type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "blocked";

/** Subtask structure */
export interface Subtask {
  id: string;
  description: string;
  status: TaskStatus;
  assignedAgent?: string;
  report?: string;
  completedAt?: string;
}

/** Main task structure */
export interface Task {
  id: string;
  summary: string;
  createdAt: string;
  subtasks: Subtask[];
  status: TaskStatus;
  completedAt?: string;
}

/** Agent capabilities */
export interface AgentCapability {
  name: string;
  description: string;
}

/** Task assignment result */
export interface TaskAssignment {
  subtask: Subtask;
  agent: string;
  reason: string;
}

// ── New types for intelligent planning ──────────────────────

/** A single step in the execution plan */
export interface ExecutionStep {
  stepNumber: number;
  description: string;
  assignedAgent: string;
  status: TaskStatus;
  dependsOn: number[];        // step numbers this step depends on
  agentFeedback: string[];    // accumulated feedback messages
  startedAt?: string;
  completedAt?: string;
}

/** The full execution plan for a task */
export interface ExecutionPlan {
  taskId: string;
  taskSummary: string;
  createdAt: string;
  steps: ExecutionStep[];
  overallStatus: TaskStatus;
}

/** Structured feedback entry from an agent */
export interface AgentFeedbackEntry {
  agent: string;
  stepNumber: number;
  message: string;
  timestamp: string;
  type: "progress" | "blocker" | "completed" | "info";
}

/**
 * System prompt for the Task Manager LLM call.
 * Instructs the LLM to decompose a user task into ordered, agent-specific subtasks.
 */
export const TASK_MANAGER_SYSTEM_PROMPT = `You are the Task Planner of HeyAGI — an orchestration engine that breaks tasks down into executable steps.

## Your Job
Given a task summary, decompose it into a sequence of concrete, single-agent steps.

## Available Agents
You will be told which agents are available. Assign each step to exactly ONE agent.
Common agent roles:
- **Ceo** — high-level decision-making, architecture, strategy
- **Researcher** — research, gather info, requirements, investigation, data analysis
- **Developer** — code implementation, building features, bug fixes
- **Tester** — writing and running tests, QA, validation
- **Documenter** — documentation, writing guides, READMEs

## Rules
1. Each step must be a single, clear action for ONE agent.
2. Steps should be ordered logically — earlier steps first.
3. Use the "dependsOn" array to indicate which previous steps must complete before this step can start. Use step numbers (1-indexed).
4. A step with an empty dependsOn array can run immediately.
5. Be specific — don't use vague descriptions like "handle things". Say exactly what to do.
6. Keep the number of steps reasonable (3-8 for most tasks).

## Output Format
Return ONLY valid JSON with this shape:
\`\`\`
{
  "steps": [
    {
      "stepNumber": 1,
      "description": "Research X and gather requirements",
      "suggestedAgent": "Researcher",
      "dependsOn": []
    },
    {
      "stepNumber": 2,
      "description": "Implement the core logic for Y",
      "suggestedAgent": "Developer",
      "dependsOn": [1]
    }
  ]
}
\`\`\`

IMPORTANT: Return ONLY the raw JSON object. No markdown fences, no extra text.`;