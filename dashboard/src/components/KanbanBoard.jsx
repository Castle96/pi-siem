import { useState } from "react";

const DEFAULT_COLUMNS = [
  {
    id: "todo",
    title: "TODO",
    color: "#4a6070",
    items: [
      { id: 1, text: "Wire real metrics DB", priority: "high" },
      { id: 2, text: "Add auth layer", priority: "medium" },
    ],
  },
  {
    id: "inprogress",
    title: "IN PROGRESS",
    color: "#00e5ff",
    items: [
      { id: 3, text: "HUD layout polish", priority: "high" },
      { id: 4, text: "Voice waveform", priority: "medium" },
    ],
  },
  {
    id: "review",
    title: "REVIEW",
    color: "#ffae00",
    items: [{ id: 5, text: "Playwright tests", priority: "low" }],
  },
  {
    id: "done",
    title: "DONE",
    color: "#00ff9d",
    items: [
      { id: 6, text: "React scaffold", priority: "high" },
      { id: 7, text: "WebSocket feed", priority: "high" },
    ],
  },
];

const PRIORITY_COLORS = {
  high: "#ff2a6d",
  medium: "#ffae00",
  low: "#00e5ff",
};

export default function KanbanBoard() {
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);

  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "0.5rem",
        fontSize: "0.65rem",
        overflow: "hidden",
      }}
    >
      {columns.map((col) => (
        <div
          key={col.id}
          style={{
            border: `1px solid ${col.color}33`,
            background: "rgba(0,229,255,0.02)",
            padding: "0.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <div
            style={{
              color: col.color,
              fontFamily: "Share Tech Mono, monospace",
              fontSize: "0.7rem",
              textShadow: `0 0 8px ${col.color}66`,
              letterSpacing: "0.1em",
              borderBottom: `1px solid ${col.color}33`,
              paddingBottom: "0.3rem",
              marginBottom: "0.2rem",
              flexShrink: 0,
            }}
          >
            {col.title} ({col.items.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", overflowY: "auto", flex: 1, minHeight: 0 }}>
            {col.items.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid rgba(0,229,255,0.1)",
                  background: "rgba(0,229,255,0.03)",
                  padding: "0.35rem",
                  wordBreak: "break-word",
                }}
              >
                <div style={{ marginBottom: 2 }}>{item.text}</div>
                <div
                  style={{
                    color: PRIORITY_COLORS[item.priority] || "#4a6070",
                    fontSize: "0.55rem",
                    fontFamily: "Share Tech Mono, monospace",
                    textShadow: `0 0 4px ${PRIORITY_COLORS[item.priority] || "#4a6070"}66`,
                  }}
                >
                  {item.priority.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
