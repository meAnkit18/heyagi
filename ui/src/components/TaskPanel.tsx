import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:3001";

/**
 * Lightweight markdown → HTML converter for TASK_CONTEXT.md
 * Handles: headings, bold, italic, tables, lists, checkboxes, emoji
 */
function mdToHtml(md: string): string {
  const lines = md.split("\n");
  let html = "";
  let inTable = false;
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Table rows
    if (line.trim().startsWith("|")) {
      // Skip separator rows
      if (/^\|[\s\-:|]+\|$/.test(line.trim())) continue;

      if (!inTable) {
        html += '<table class="task-table">';
        inTable = true;
      }

      // Check if this is a header row (next line is separator)
      const nextLine = lines[i + 1]?.trim() || "";
      const isHeader = /^\|[\s\-:|]+\|$/.test(nextLine);

      const cells = line
        .split("|")
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
        .map((c) => c.trim());

      const tag = isHeader ? "th" : "td";
      html += "<tr>";
      cells.forEach((cell) => {
        html += `<${tag}>${inlineFormat(cell)}</${tag}>`;
      });
      html += "</tr>";
      continue;
    } else if (inTable) {
      html += "</table>";
      inTable = false;
    }

    // Close list if we're not on a list item
    if (inList && !line.trim().startsWith("-") && !line.trim().startsWith("*") && !/^\d+\./.test(line.trim())) {
      html += "</ul>";
      inList = false;
    }

    // Headings
    if (line.startsWith("### ")) {
      html += `<h4 class="task-h4">${inlineFormat(line.slice(4))}</h4>`;
      continue;
    }
    if (line.startsWith("## ")) {
      html += `<h3 class="task-h3">${inlineFormat(line.slice(3))}</h3>`;
      continue;
    }
    if (line.startsWith("# ")) {
      html += `<h2 class="task-h2">${inlineFormat(line.slice(2))}</h2>`;
      continue;
    }

    // List items (bullet & numbered)
    const bulletMatch = line.match(/^(\s*)-\s+(.*)/);
    const numberedMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (bulletMatch || numberedMatch) {
      if (!inList) {
        html += '<ul class="task-list">';
        inList = true;
      }
      const content = bulletMatch ? bulletMatch[2] : numberedMatch![2];
      // Checkbox handling
      if (content.startsWith("[x] ")) {
        html += `<li class="task-li done">✅ ${inlineFormat(content.slice(4))}</li>`;
      } else if (content.startsWith("[/] ")) {
        html += `<li class="task-li active">🔄 ${inlineFormat(content.slice(4))}</li>`;
      } else if (content.startsWith("[ ] ")) {
        html += `<li class="task-li pending">⏳ ${inlineFormat(content.slice(4))}</li>`;
      } else {
        html += `<li class="task-li">${inlineFormat(content)}</li>`;
      }
      continue;
    }

    // Indented sub-items (e.g. "   - something")
    const subItemMatch = line.match(/^\s{2,}-\s+(.*)/);
    if (subItemMatch) {
      html += `<div class="task-sub-item">${inlineFormat(subItemMatch[1])}</div>`;
      continue;
    }

    // Emphasis line (italic placeholder text)
    if (line.trim().startsWith("*") && line.trim().endsWith("*") && !line.trim().startsWith("**")) {
      html += `<p class="task-note">${inlineFormat(line.trim())}</p>`;
      continue;
    }

    // Regular text
    if (line.trim()) {
      html += `<p class="task-p">${inlineFormat(line)}</p>`;
    }
  }

  if (inTable) html += "</table>";
  if (inList) html += "</ul>";

  return html;
}

/** Inline formatting: bold, italic, code */
function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="task-code">$1</code>');
}

export default function TaskPanel() {
  const [content, setContent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);

  const fetchContext = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/task/context`);
      const data = await res.json();
      setContent(data.exists ? data.content : null);
    } catch {
      // Server might not be running
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount + poll every 5s
  useEffect(() => {
    fetchContext();
    const interval = setInterval(fetchContext, 5000);
    return () => clearInterval(interval);
  }, [fetchContext]);

  if (!content) return null;

  return (
    <div className="task-panel">
      <div className="task-panel-header" onClick={() => setExpanded(!expanded)}>
        <div className="task-panel-title">
          <span className="task-panel-icon">📋</span>
          <span>Task Progress</span>
        </div>
        <div className="task-panel-actions">
          {loading && <span className="task-spinner" />}
          <button
            className="task-refresh-btn"
            onClick={(e) => { e.stopPropagation(); fetchContext(); }}
            title="Refresh"
          >
            ↻
          </button>
          <span className="task-chevron">{expanded ? "▾" : "▸"}</span>
        </div>
      </div>
      {expanded && (
        <div
          className="task-panel-body"
          dangerouslySetInnerHTML={{ __html: mdToHtml(content) }}
        />
      )}
    </div>
  );
}
