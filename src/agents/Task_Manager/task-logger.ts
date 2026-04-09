import { EventEmitter } from "events";

/**
 * TaskLogEmitter — collects logs from the task processing pipeline
 * and emits them as events so the SSE endpoint can stream them.
 *
 * Usage:
 *   const emitter = createTaskLogger(taskId);
 *   emitter.log("step", "Breaking down task...");
 *   emitter.log("info", "Found 5 subtasks");
 *   emitter.done();
 */

export interface TaskLogEvent {
  taskId: string;
  type: "step" | "info" | "success" | "warn" | "error" | "done";
  message: string;
  timestamp: string;
}

export class TaskLogEmitter extends EventEmitter {
  readonly taskId: string;

  constructor(taskId: string) {
    super();
    this.taskId = taskId;
  }

  log(type: TaskLogEvent["type"], message: string): void {
    const event: TaskLogEvent = {
      taskId: this.taskId,
      type,
      message,
      timestamp: new Date().toISOString(),
    };
    this.emit("log", event);
    // Also print to server console
    const prefix = { step: "📋", info: "💡", success: "✅", warn: "⚠️", error: "❌", done: "🏁" }[type];
    console.log(`  ${prefix} [${this.taskId}] ${message}`);
  }

  done(summary?: string): void {
    this.log("done", summary || "Task processing complete");
    this.emit("done");
  }
}

/** Create a new log emitter for a task */
export function createTaskLogger(taskId: string): TaskLogEmitter {
  return new TaskLogEmitter(taskId);
}
