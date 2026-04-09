import {
  createTaskContextFromPlan,
  logAgentFeedback,
  markStepCompleted,
  markStepInProgress,
  getActionableSteps,
} from "./task-context.js";
import { breakDownTaskWithLLM, buildExecutionPlan } from "./task-planner.js";
import { getAvailableAgents, logAgentFeedbackToContext } from "./agent-coordinator.js";
import { processTask } from "./brain.js";
import { ExecutionPlan, AgentFeedbackEntry } from "./Schema.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testFullPipeline() {
  console.log("🧪 Testing Improved Task Manager Pipeline\n");
  console.log("=".repeat(60));

  const taskDir = path.join(__dirname, "..", "..", "..", "memory", "tasks");
  const taskId = "test-task-002";
  const taskSummary =
    "Build a user authentication system with login, registration, and password reset";

  try {
    // Ensure task directory exists
    await fs.mkdir(taskDir, { recursive: true });

    // ── Step 1: Full pipeline via processTask ─────────────
    console.log("\n📋 Step 1: Running full processTask pipeline...\n");
    const { plan, contextFilePath } = await processTask(
      taskId,
      taskSummary,
      taskDir
    );

    console.log(`\n  ✅ Pipeline complete!`);
    console.log(`     Steps: ${plan.steps.length}`);
    console.log(`     Context: ${contextFilePath}\n`);

    // ── Step 2: Show actionable steps ────────────────────
    console.log("📌 Step 2: Checking actionable steps...");
    const actionable = getActionableSteps(plan);
    console.log(`  ${actionable.length} steps can start immediately:`);
    actionable.forEach((s) => {
      console.log(`    → Step ${s.stepNumber}: ${s.description} (${s.assignedAgent})`);
    });

    // ── Step 3: Simulate agent feedback ──────────────────
    console.log("\n💬 Step 3: Simulating agent feedback...");

    if (actionable.length > 0) {
      const firstStep = actionable[0];

      // Start the first step
      await markStepInProgress(contextFilePath, plan, firstStep.stepNumber);
      console.log(`  🔄 Started step ${firstStep.stepNumber}`);

      // Log feedback
      await logAgentFeedbackToContext(
        contextFilePath,
        firstStep.assignedAgent,
        firstStep.stepNumber,
        "Started working on this step, gathering initial data",
        "progress"
      );
      console.log(`  💬 Logged progress feedback`);

      // Complete the step
      await markStepCompleted(
        contextFilePath,
        plan,
        firstStep.stepNumber,
        "Completed successfully — requirements gathered"
      );
      console.log(`  ✅ Marked step ${firstStep.stepNumber} as completed`);

      // Check what's now actionable
      const newActionable = getActionableSteps(plan);
      console.log(
        `\n  📌 After completing step ${firstStep.stepNumber}, ${newActionable.length} new steps are actionable:`
      );
      newActionable.forEach((s) => {
        console.log(`    → Step ${s.stepNumber}: ${s.description} (${s.assignedAgent})`);
      });
    }

    // ── Step 4: Read and display final context file ──────
    console.log("\n📂 Step 4: Final TASK_CONTEXT.md:\n");
    console.log("=".repeat(60));
    const context = await fs.readFile(contextFilePath, "utf-8");
    console.log(context);
    console.log("=".repeat(60));

    console.log("\n✅ All tests passed! Improved Task Manager is working.\n");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

testFullPipeline();
