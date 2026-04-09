import { updateSubtaskProgress } from "./src/agents/Task_Manager/agent-coordinator.js";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testUpdate() {
  console.log("Testing subtask update...");
  
  try {
    // Update a subtask
    const jobFilePath = path.join(__dirname, "memory", "tasks", "jobtest-001.md");
    await updateSubtaskProgress(jobFilePath, "subtask-1", "completed", "Requirements gathered from stakeholder");
    console.log("Subtask updated successfully!");
  } catch (error) {
    console.error("Error updating subtask:", error);
  }
}

testUpdate();