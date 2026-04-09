import { useState, useRef, useEffect, useCallback } from "react";
import TaskPanel from "./components/TaskPanel";
import StreamingLogs from "./components/StreamingLogs";
import "./components/TaskPanel.css";

type Msg = { role: "user" | "assistant"; content: string };
type ActiveTask = { taskId: string; taskSummary: string } | null;

const API = "http://localhost:3001";

let taskCounter = 0;

function App() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState<ActiveTask>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTask]);

  const handleTaskDone = useCallback(() => {
    // Keep the stream visible for a moment then clear
    setTimeout(() => setActiveTask(null), 3000);
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    // Optimistically add user message
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);

      // If CEO detected a task, auto-trigger streaming task processing
      if (data.intent === "task" && data.taskSummary) {
        taskCounter++;
        const taskId = `task-${Date.now()}-${taskCounter}`;
        setActiveTask({ taskId, taskSummary: data.taskSummary });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "[error] Could not reach server" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>HeyAGI</h2>

      {/* Task context panel — shows TASK_CONTEXT.md when a task exists */}
      <TaskPanel />

      <div
        style={{
          border: "1px solid #ccc",
          height: 600,
          overflowY: "auto",
          padding: 8,
        }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 6 }}>
            <strong>{m.role === "user" ? "You" : "Bot"}:</strong> {m.content}
          </div>
        ))}

        {/* Streaming task logs — appears inline in the chat when a task is being processed */}
        {activeTask && (
          <StreamingLogs
            taskId={activeTask.taskId}
            taskSummary={activeTask.taskSummary}
            onDone={handleTaskDone}
          />
        )}

        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", marginTop: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message..."
          style={{ flex: 1, height: 50 }}
          disabled={loading}
        />
        <button onClick={send} disabled={loading}>
          Send
        </button>
      </div>
    </div>
  );
}

export default App;
