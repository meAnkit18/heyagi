import { useState, useRef, useEffect } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const API = "http://localhost:3001";

function App() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
