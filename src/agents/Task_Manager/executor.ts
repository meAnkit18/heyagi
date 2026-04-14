import fs from "fs/promises";
import { ExecutionStep, ExecutionPlan, AgentReport } from "./Schema.js";
import { logAgentFeedbackToContext } from "./agent-coordinator.js";
import { TaskLogEmitter } from "./task-logger.js";

/**
 * Execute a single step by routing to the correct agent.
 * Reads TASK_CONTEXT.md as prior context, runs the agent, writes the report back.
 */
export async function executeStep(
  step: ExecutionStep,
  plan: ExecutionPlan,
  contextFilePath: string,
  logger?: TaskLogEmitter
): Promise<AgentReport> {
  const log = (type: "step" | "info" | "success" | "warn" | "error", msg: string) => {
    if (logger) logger.log(type, msg);
    else console.log(`  ${msg}`);
  };

  // Read current context as prior context for the agent
  let priorContext = "";
  try {
    priorContext = await fs.readFile(contextFilePath, "utf-8");
  } catch { /* no context yet */ }

  log("step", `Executing step ${step.stepNumber} via ${step.assignedAgent}: ${step.description}`);

  let report: AgentReport;

  try {
    report = await routeToAgent(step, priorContext);
    report.stepNumber = step.stepNumber;
  } catch (err: any) {
    report = {
      stepNumber: step.stepNumber,
      agent: step.assignedAgent,
      status: "failed",
      output: "",
      error: err?.message ?? String(err),
      contextSummary: `Step ${step.stepNumber} failed: ${err?.message ?? err}`,
    };
  }

  // Write report back to context
  await logAgentFeedbackToContext(
    contextFilePath,
    report.agent,
    report.stepNumber,
    report.status === "success"
      ? `✅ ${report.contextSummary}`
      : `❌ Failed: ${report.error}`,
    report.status === "success" ? "completed" : "blocker"
  );

  log(
    report.status === "success" ? "success" : "error",
    `Step ${step.stepNumber} ${report.status}: ${report.contextSummary}`
  );

  return report;
}

async function routeToAgent(step: ExecutionStep, priorContext: string): Promise<AgentReport> {
  const agentName = step.assignedAgent.toLowerCase();

  if (agentName === "cli-agent") {
    const { execute } = await import("../cli-agent/src/agent.js");
    return execute(step.description, priorContext);
  }

  // Stub for agents not yet implemented
  return {
    stepNumber: step.stepNumber,
    agent: step.assignedAgent,
    status: "success",
    output: `Agent "${step.assignedAgent}" is not yet implemented. Step noted.`,
    contextSummary: `Step ${step.stepNumber} acknowledged by ${step.assignedAgent} (stub).`,
  };
}
