import { ExecutionPlan } from "./Schema.js";
import {
  breakDownTaskWithLLM,
  buildExecutionPlan,
  createJobFile,
} from "./task-planner.js";
import { getAvailableAgents, logAgentFeedbackToContext } from "./agent-coordinator.js";
import { createTaskContextFromPlan } from "./task-context.js";
import { TaskLogEmitter } from "./task-logger.js";
import fs from "fs/promises";
import path from "path";

/**
 * Process a new task from the CEO.
 *
 * Pipeline:
 *  1. Discover available agents
 *  2. Use the LLM to decompose the task into ordered, agent-specific steps
 *  3. Build an ExecutionPlan
 *  4. Write the job file (per-task markdown)
 *  5. Write the TASK_CONTEXT.md (centralized coordination file)
 *  6. Log the initial plan creation as feedback
 *
 * Accepts an optional TaskLogEmitter to stream logs in real-time.
 */
export async function processTask(
  taskId: string,
  taskSummary: string,
  taskDir: string,
  logger?: TaskLogEmitter
): Promise<{ plan: ExecutionPlan; contextFilePath: string }> {
  const log = (type: "step" | "info" | "success" | "warn" | "error", msg: string) => {
    if (logger) logger.log(type, msg);
    else console.log(`  ${msg}`);
  };

  log("step", `Processing task: ${taskSummary}`);

  // Ensure directory exists
  await fs.mkdir(taskDir, { recursive: true });

  // 1. Discover agents
  const agentsDir = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    ".."
  );
  const availableAgents = await getAvailableAgents(agentsDir);
  log("info", `Available agents: ${availableAgents.join(", ")}`);

  // 2. Decompose with LLM (falls back to keyword-based if LLM fails)
  log("step", "Decomposing task with LLM...");
  const steps = await breakDownTaskWithLLM(taskSummary, availableAgents);
  log("success", `Got ${steps.length} execution steps`);

  // 3. Build the execution plan
  const plan = buildExecutionPlan(taskId, taskSummary, steps);

  // Log each step
  plan.steps.forEach((step) => {
    const deps =
      step.dependsOn.length > 0
        ? `(after step ${step.dependsOn.join(", ")})`
        : "(immediate)";
    log("info", `Step ${step.stepNumber}: ${step.description} → ${step.assignedAgent} ${deps}`);
  });

  // 4. Write job file
  log("step", "Writing job file...");
  const jobFilePath = await createJobFile(plan, taskDir);
  log("success", `Job file created: ${jobFilePath}`);

  // 5. Write TASK_CONTEXT.md
  log("step", "Writing TASK_CONTEXT.md...");
  const contextFilePath = await createTaskContextFromPlan(plan, taskDir);
  log("success", `Context file created: ${contextFilePath}`);

  // 6. Log initial feedback
  await logAgentFeedbackToContext(
    contextFilePath,
    "Task_Manager",
    0,
    `Task decomposed into ${steps.length} steps and assigned to agents. Ready for execution.`,
    "info"
  );

  log("success", "Task is ready for agent execution");

  if (logger) {
    logger.done(`Task ${taskId} processed — ${steps.length} steps assigned`);
  }

  return { plan, contextFilePath };
}