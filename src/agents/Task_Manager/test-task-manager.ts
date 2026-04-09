import { processTask } from "./src/agents/Task_Manager/brain.js";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testTaskManager() {
  console.log("Testing Task_Manager implementation...");
  
  // Create a test task
  const taskId = "test-001";
  const taskSummary = "Create a new landing page for the product";
  
  try {
    // Process the task
    await processTask(taskId, taskSummary, path.join(__dirname, "memory", "tasks"));
    console.log("Task processed successfully!");
  } catch (error) {
    console.error("Error processing task:", error);
  }
}

testTaskManager();