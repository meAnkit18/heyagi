import { ExecutionPlan } from "./Schema.js";
import {
  breakDownTaskWithLLM,
  buildExecutionPlan,
  createJobFile,
} from "./task-planner.js";
import { logAgentFeedbackToContext } from "./agent-coordinator.js";
import { discoverAgents } from "./agent-discovery.js";
import { createTaskContextFromPlan, getActionableSteps, markStepInProgress, markStepCompleted } from "./task-context.js";
import { executeStep } from "./executor.js";
import { TaskLogEmitter } from "./task-logger.js";
import fs from "fs/promises";
import path from "path";

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
  await fs.mkdir(taskDir, { recursive: true });

  // 1. Discover agents with manifests
  const agentsDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const manifests = await discoverAgents(agentsDir);
  log("info", `Available agents: ${manifests.map((m) => m.name).join(", ")}`);

  // 2. Decompose with LLM using full manifests
  log("step", "Decomposing task with LLM...");
  const steps = await breakDownTaskWithLLM(taskSummary, manifests);
  log("success", `Got ${steps.length} execution steps`);

  // 3. Build plan
  let plan = buildExecutionPlan(taskId, taskSummary, steps);
  plan.steps.forEach((step) => {
    const deps = step.dependsOn.length > 0 ? `(after step ${step.dependsOn.join(", ")})` : "(immediate)";
    log("info", `Step ${step.stepNumber}: ${step.description} → ${step.assignedAgent} ${deps}`);
  });

  // 4. Write job file + context
  const jobFilePath = await createJobFile(plan, taskDir);
  log("success", `Job file: ${jobFilePath}`);
  const contextFilePath = await createTaskContextFromPlan(plan, taskDir);
  log("success", `Context file: ${contextFilePath}`);

  await logAgentFeedbackToContext(contextFilePath, "Task_Manager", 0,
    `Task decomposed into ${steps.length} steps. Starting execution.`, "info");

  // 5. Execute steps in dependency order
  log("step", "Starting step execution...");
  const executed = new Set<number>();

  while (executed.size < plan.steps.length) {
    const actionable = getActionableSteps(plan).filter((s) => !executed.has(s.stepNumber));

    if (actionable.length === 0) {
      // Check if we're stuck (remaining steps are failed/blocked)
      const remaining = plan.steps.filter((s) => !executed.has(s.stepNumber));
      if (remaining.every((s) => s.status === "failed" || s.status === "blocked")) break;
      // Otherwise wait — shouldn't happen in sequential mode but guard anyway
      break;
    }

    for (const step of actionable) {
      plan = await markStepInProgress(contextFilePath, plan, step.stepNumber);
      const report = await executeStep(step, plan, contextFilePath, logger);
      plan = await markStepCompleted(contextFilePath, plan, step.stepNumber, report.contextSummary);
      executed.add(step.stepNumber);
    }
  }

  const allDone = plan.steps.every((s) => s.status === "completed");
  log(allDone ? "success" : "warn", allDone ? "All steps completed." : "Some steps did not complete.");

  if (logger) logger.done(`Task ${taskId} finished — ${executed.size}/${plan.steps.length} steps completed`);

  return { plan, contextFilePath };
}
