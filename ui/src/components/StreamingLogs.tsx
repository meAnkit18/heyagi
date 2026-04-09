import { useState, useEffect, useRef, useCallback } from "react";
import "./StreamingLogs.css";

const API = "http://localhost:3001";

interface LogEntry {
  type: "step" | "info" | "success" | "warn" | "error" | "done";
  message: string;
  timestamp: string;
  taskId?: string;
}

interface StreamingLogsProps {
  taskId: string;
  taskSummary: string;
  onDone?: () => void;
}

export default function StreamingLogs({ taskId, taskSummary, onDone }: StreamingLogsProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [streaming, setStreaming] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Connect to SSE
  useEffect(() => {
    const params = new URLSearchParams({ taskId, taskSummary });
    const eventSource = new EventSource(`${API}/task/stream?${params}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "close") {
          setStreaming(false);
          eventSource.close();
          onDone?.();
          return;
        }

        setLogs((prev) => [...prev, data as LogEntry]);
      } catch {
        // Ignore malformed events
      }
    };

    eventSource.onerror = () => {
      setStreaming(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [taskId, taskSummary, onDone]);

  const getIcon = (type: string) => {
    switch (type) {
      case "step":    return "📋";
      case "info":    return "💡";
      case "success": return "✅";
      case "warn":    return "⚠️";
      case "error":   return "❌";
      case "done":    return "🏁";
      default:        return "•";
    }
  };

  return (
    <div className="stream-panel">
      <div className="stream-header">
        <div className="stream-title">
          {streaming && <span className="stream-dot" />}
          <span>🔧 Processing: {taskSummary}</span>
        </div>
        {!streaming && <span className="stream-badge-done">Done</span>}
      </div>
      <div className="stream-body">
        {logs.map((log, i) => (
          <div key={i} className={`stream-line stream-${log.type}`}>
            <span className="stream-icon">{getIcon(log.type)}</span>
            <span className="stream-time">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span className="stream-msg">{log.message}</span>
          </div>
        ))}
        {streaming && (
          <div className="stream-line stream-waiting">
            <span className="stream-cursor" />
          </div>
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
