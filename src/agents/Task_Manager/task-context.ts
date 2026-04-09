import fs from "fs/promises";
import path from "path";
import {
  ExecutionPlan,
  ExecutionStep,
  AgentFeedbackEntry,
  TaskAssignment,
} from "./Schema.js";

// ── Create the master TASK_CONTEXT.md ───────────────────────

/**
 * Generate the full TASK_CONTEXT.md from an ExecutionPlan.
 * This is the single source of truth for all inter-agent coordination.
 */
export async function createTaskContextFromPlan(
  plan: ExecutionPlan,
  taskContextDir: string
): Promise<string> {
  const contextFilePath = path.join(taskContextDir, "TASK_CONTEXT.md");
  const content = renderContextFile(plan, []);
  await fs.writeFile(contextFilePath, content, "utf-8");
  return contextFilePath;
}

/**
 * Render the full markdown content for the context file
 */
function renderContextFile(
  plan: ExecutionPlan,
  feedbackLog: AgentFeedbackEntry[]
): string {
  const now = new Date().toISOString();

  let md = `# Task Management Context\n\n`;
  md += `**Task ID:** ${plan.taskId}\n`;
  md += `**Summary:** ${plan.taskSummary}\n`;
  md += `**Generated:** ${now}\n`;
  md += `**Overall Status:** ${plan.overallStatus}\n\n`;

  // ── Execution Plan ──────────────────────────────────────
  md += `## 📋 Execution Plan\n\n`;
  plan.steps.forEach((step) => {
    const checkbox = step.status === "completed" ? "[x]" : step.status === "in_progress" ? "[/]" : "[ ]";
    const deps =
      step.dependsOn.length > 0
        ? `⏳ depends on step ${step.dependsOn.join(", ")}`
        : `✅ can start immediately`;
    const statusIcon = getStatusIcon(step.status);

    md += `### Step ${step.stepNumber}: ${step.description}\n`;
    md += `- ${checkbox} **Status:** ${statusIcon} ${step.status}\n`;
    md += `- **Assigned to:** ${step.assignedAgent}\n`;
    md += `- **Dependencies:** ${deps}\n`;
    if (step.startedAt) md += `- **Started:** ${step.startedAt}\n`;
    if (step.completedAt) md += `- **Completed:** ${step.completedAt}\n`;
    if (step.agentFeedback.length > 0) {
      md += `- **Agent notes:**\n`;
      step.agentFeedback.forEach((fb) => {
        md += `  - ${fb}\n`;
      });
    }
    md += `\n`;
  });

  // ── Dependency Graph ───────────────────────────────────
  md += `## 🔗 Dependency Graph\n\n`;
  const hasDeps = plan.steps.some((s) => s.dependsOn.length > 0);
  if (hasDeps) {
    plan.steps.forEach((step) => {
      if (step.dependsOn.length > 0) {
        step.dependsOn.forEach((dep) => {
          const depStep = plan.steps.find((s) => s.stepNumber === dep);
          const depDesc = depStep ? depStep.description : `Step ${dep}`;
          md += `- Step ${dep} (${depDesc}) → **blocks** → Step ${step.stepNumber} (${step.description})\n`;
        });
      }
    });
  } else {
    md += `*All steps are independent — no blocking dependencies.*\n`;
  }
  md += `\n`;

  // ── Agent Status ────────────────────────────────────────
  md += `## 👥 Agent Assignments\n\n`;
  md += `| Agent | Assigned Steps | Current Status |\n`;
  md += `|-------|---------------|----------------|\n`;
  const agentMap = new Map<string, number[]>();
  plan.steps.forEach((step) => {
    const existing = agentMap.get(step.assignedAgent) || [];
    existing.push(step.stepNumber);
    agentMap.set(step.assignedAgent, existing);
  });
  agentMap.forEach((steps, agent) => {
    const stepList = steps.map((s) => `#${s}`).join(", ");
    const agentSteps = plan.steps.filter((s) => s.assignedAgent === agent);
    const anyInProgress = agentSteps.some((s) => s.status === "in_progress");
    const allDone = agentSteps.every((s) => s.status === "completed");
    const status = allDone ? "✅ done" : anyInProgress ? "🔄 working" : "⏳ waiting";
    md += `| ${agent} | ${stepList} | ${status} |\n`;
  });
  md += `\n`;

  // ── Agent Feedback Log ─────────────────────────────────
  md += `## 💬 Agent Feedback Log\n\n`;
  if (feedbackLog.length === 0) {
    md += `*No agent feedback yet — task just created.*\n`;
  } else {
    feedbackLog.forEach((entry) => {
      const icon = getFeedbackIcon(entry.type);
      md += `- [${entry.timestamp}] ${icon} **${entry.agent}** (Step #${entry.stepNumber}): ${entry.message}\n`;
    });
  }
  md += `\n`;

  // ── Next Steps ─────────────────────────────────────────
  md += `## 📌 Next Steps\n\n`;
  const actionable = getActionableSteps(plan);
  if (actionable.length === 0) {
    const allDone = plan.steps.every((s) => s.status === "completed");
    if (allDone) {
      md += `🎉 **All steps completed!**\n`;
    } else {
      md += `*Waiting for blocking dependencies to complete.*\n`;
    }
  } else {
    actionable.forEach((step, i) => {
      md += `${i + 1}. **${step.assignedAgent}** should execute: *${step.description}*\n`;
    });
  }
  md += `\n`;

  return md;
}

// ── Update helpers ──────────────────────────────────────────

/**
 * Log structured feedback from an agent and update the context file
 */
export async function logAgentFeedback(
  contextFilePath: string,
  entry: AgentFeedbackEntry
): Promise<void> {
  try {
    let content = await fs.readFile(contextFilePath, "utf-8");
    const icon = getFeedbackIcon(entry.type);
    const line = `- [${entry.timestamp}] ${icon} **${entry.agent}** (Step #${entry.stepNumber}): ${entry.message}\n`;

    // Insert into the Agent Feedback Log section
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("## 💬 Agent Feedback Log")) {
        // Find the insertion point (after the placeholder or after existing entries)
        let insertIdx = i + 2;
        if (lines[insertIdx] && lines[insertIdx].includes("*No agent feedback yet")) {
          lines[insertIdx] = line.trimEnd();
        } else {
          // Insert at the top of the log (newest first)
          lines.splice(insertIdx, 0, line.trimEnd());
        }
        break;
      }
    }

    await fs.writeFile(contextFilePath, lines.join("\n"), "utf-8");
  } catch (error) {
    console.error("Error logging agent feedback:", error);
    throw error;
  }
}

/**
 * Mark a step as completed and persist to the context file.
 * Also auto-advances any steps that were blocked only on this step.
 */
export async function markStepCompleted(
  contextFilePath: string,
  plan: ExecutionPlan,
  stepNumber: number,
  completionNote?: string
): Promise<ExecutionPlan> {
  const step = plan.steps.find((s) => s.stepNumber === stepNumber);
  if (!step) throw new Error(`Step ${stepNumber} not found`);

  step.status = "completed";
  step.completedAt = new Date().toISOString();
  if (completionNote) step.agentFeedback.push(completionNote);

  // Check if all steps are done
  const allDone = plan.steps.every((s) => s.status === "completed");
  if (allDone) {
    plan.overallStatus = "completed";
  } else {
    plan.overallStatus = "in_progress";
  }

  // Re-render and save
  const feedbackLog = await parseFeedbackLog(contextFilePath);
  const content = renderContextFile(plan, feedbackLog);
  await fs.writeFile(contextFilePath, content, "utf-8");

  return plan;
}

/**
 * Mark a step as in-progress
 */
export async function markStepInProgress(
  contextFilePath: string,
  plan: ExecutionPlan,
  stepNumber: number
): Promise<ExecutionPlan> {
  const step = plan.steps.find((s) => s.stepNumber === stepNumber);
  if (!step) throw new Error(`Step ${stepNumber} not found`);

  step.status = "in_progress";
  step.startedAt = new Date().toISOString();
  plan.overallStatus = "in_progress";

  const feedbackLog = await parseFeedbackLog(contextFilePath);
  const content = renderContextFile(plan, feedbackLog);
  await fs.writeFile(contextFilePath, content, "utf-8");

  return plan;
}

/**
 * Get all steps that are unblocked and ready to execute
 */
export function getActionableSteps(plan: ExecutionPlan): ExecutionStep[] {
  const completedSteps = new Set(
    plan.steps.filter((s) => s.status === "completed").map((s) => s.stepNumber)
  );

  return plan.steps.filter((step) => {
    if (step.status !== "pending") return false;
    // All dependencies must be completed
    return step.dependsOn.every((dep) => completedSteps.has(dep));
  });
}

/**
 * Get full context summary
 */
export async function getContextSummary(
  contextFilePath: string
): Promise<string> {
  return fs.readFile(contextFilePath, "utf-8");
}

// ── Legacy wrapper (backward compat) ────────────────────────

/**
 * Legacy createTaskContext — wraps the new plan-based function
 */
export async function createTaskContext(
  taskId: string,
  taskSummary: string,
  assignments: TaskAssignment[],
  taskContextDir: string
): Promise<string> {
  // Convert TaskAssignments to ExecutionSteps for backward compat
  const steps: ExecutionStep[] = assignments.map((a, index) => ({
    stepNumber: index + 1,
    description: a.subtask.description,
    assignedAgent: a.agent,
    status: a.subtask.status || "pending",
    dependsOn: index === 0 ? [] : [index], // sequential dependency
    agentFeedback: [],
  }));

  const plan: ExecutionPlan = {
    taskId,
    taskSummary,
    createdAt: new Date().toISOString(),
    steps,
    overallStatus: "pending",
  };

  return createTaskContextFromPlan(plan, taskContextDir);
}

// ── Private helpers ─────────────────────────────────────────

function getStatusIcon(status: string): string {
  switch (status) {
    case "completed": return "✅";
    case "in_progress": return "🔄";
    case "failed": return "❌";
    case "blocked": return "🚫";
    default: return "⏳";
  }
}

function getFeedbackIcon(type: string): string {
  switch (type) {
    case "completed": return "✅";
    case "progress": return "🔄";
    case "blocker": return "🚫";
    default: return "💡";
  }
}

/**
 * Parse the existing feedback log from the context file
 * so we can preserve it across re-renders
 */
async function parseFeedbackLog(contextFilePath: string): Promise<AgentFeedbackEntry[]> {
  try {
    const content = await fs.readFile(contextFilePath, "utf-8");
    const entries: AgentFeedbackEntry[] = [];
    const lines = content.split("\n");
    let inSection = false;

    for (const line of lines) {
      if (line.includes("## 💬 Agent Feedback Log")) {
        inSection = true;
        continue;
      }
      if (inSection && line.startsWith("##")) {
        break;
      }
      if (inSection && line.startsWith("- [")) {
        // Parse: - [timestamp] icon **agent** (Step #N): message
        const match = line.match(
          /^- \[(.+?)\] .+? \*\*(.+?)\*\* \(Step #(\d+)\): (.+)$/
        );
        if (match) {
          entries.push({
            timestamp: match[1],
            agent: match[2],
            stepNumber: parseInt(match[3], 10),
            message: match[4],
            type: "info", // we can't reconstruct the original type from markdown, default to info
          });
        }
      }
    }

    return entries;
  } catch {
    return [];
  }
}
