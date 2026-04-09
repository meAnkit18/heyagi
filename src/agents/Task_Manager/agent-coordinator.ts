import fs from "fs/promises";
import path from "path";
import {
  logAgentFeedback as contextLogFeedback,
  markStepCompleted as contextMarkComplete,
  markStepInProgress as contextMarkInProgress,
} from "./task-context.js";
import { ExecutionPlan, AgentFeedbackEntry } from "./Schema.js";

/**
 * Dynamically discover available agents by scanning the agents directory.
 * Each subdirectory under src/agents/ is treated as an agent.
 */
export async function getAvailableAgents(
  agentsDir?: string
): Promise<string[]> {
  const dir =
    agentsDir || path.resolve(import.meta.dirname ?? ".", "..");

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    // Fallback if directory read fails
    return ["Ceo", "Researcher", "Developer", "Tester", "Documenter"];
  }
}

/**
 * Log agent feedback to the context file
 */
export async function logAgentFeedbackToContext(
  contextFilePath: string,
  agent: string,
  stepNumber: number,
  message: string,
  type: AgentFeedbackEntry["type"] = "info"
): Promise<void> {
  const entry: AgentFeedbackEntry = {
    agent,
    stepNumber,
    message,
    timestamp: new Date().toLocaleTimeString(),
    type,
  };

  try {
    await contextLogFeedback(contextFilePath, entry);
  } catch (error) {
    console.error("Error logging agent feedback:", error);
  }
}

/**
 * Mark a step as completed in the context file
 */
export async function completeStep(
  contextFilePath: string,
  plan: ExecutionPlan,
  stepNumber: number,
  note?: string
): Promise<ExecutionPlan> {
  return contextMarkComplete(contextFilePath, plan, stepNumber, note);
}

/**
 * Mark a step as in-progress in the context file
 */
export async function startStep(
  contextFilePath: string,
  plan: ExecutionPlan,
  stepNumber: number
): Promise<ExecutionPlan> {
  return contextMarkInProgress(contextFilePath, plan, stepNumber);
}

/**
 * Update a subtask in a legacy job file with agent progress
 */
export async function updateSubtaskProgress(
  jobFilePath: string,
  subtaskId: string,
  status: string,
  report: string,
  contextFilePath?: string
): Promise<void> {
  try {
    let content = await fs.readFile(jobFilePath, "utf-8");
    const lines = content.split("\n");
    const updatedLines: string[] = [];

    let inSubtaskSection = false;
    let subtaskFound = false;
    let reportAdded = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith("### ") && line.includes(subtaskId)) {
        inSubtaskSection = true;
        subtaskFound = true;
        updatedLines.push(line);
        continue;
      } else if (inSubtaskSection && line.startsWith("### ")) {
        if (subtaskFound && !reportAdded) {
          updatedLines.push(`- Report: ${report}`);
          reportAdded = true;
        }
        inSubtaskSection = false;
      } else if (inSubtaskSection && line.startsWith("- Status:")) {
        updatedLines.push(`- Status: ${status}`);
        continue;
      } else if (
        inSubtaskSection &&
        (line.startsWith("- Report:") || line.trim() === "") &&
        subtaskFound &&
        !reportAdded
      ) {
        if (line.trim() === "") {
          updatedLines.push(line);
          updatedLines.push(`- Report: ${report}`);
          reportAdded = true;
          continue;
        } else if (line.startsWith("- Report:")) {
          updatedLines.push(`- Report: ${report}`);
          reportAdded = true;
          continue;
        }
      }

      updatedLines.push(line);
    }

    if (subtaskFound && !reportAdded) {
      updatedLines.push(`- Report: ${report}`);
    }

    await fs.writeFile(jobFilePath, updatedLines.join("\n"), "utf-8");
  } catch (error) {
    console.error("Error updating subtask progress:", error);
    throw error;
  }
}