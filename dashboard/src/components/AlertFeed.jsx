import { useState } from "react";

export default function AlertFeed({ alerts = [] }) {
  const [acked, setAcked] = useState(new Set());

  const handleAck = (id) => {
    fetch(`/api/alerts/${id}/ack`, { method: "POST" })
      .then(() => setAcked(prev => new Set(prev).add(id)))
      .catch(() => {});
  };

  const items = alerts.filter(a => !acked.has(a.id));

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        fontSize: "0.7rem",
        lineHeight: 1.5,
        color: "var(--iron-text)",
        paddingRight: 4,
      }}
    >
      {items.length === 0 && (
        <div style={{ color: "var(--iron-dim)" }}>No active alerts</div>
      )}
      {items.map((a) => {
        const color =
          a.severity === "high"
            ? "var(--iron-magenta)"
            : a.severity === "medium"
            ? "var(--iron-amber)"
            : "var(--iron-cyan)";
        return (
          <div
            key={a.id}
            style={{
              borderBottom: "1px solid rgba(0,229,255,0.06)",
              padding: "0.35rem 0",
              display: "flex",
              gap: "0.5rem",
              alignItems: "flex-start",
              wordBreak: "break-word",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                color,
                textShadow: `0 0 6px ${color}`,
                fontFamily: "Share Tech Mono, monospace",
                minWidth: 44,
                flexShrink: 0,
                fontSize: "0.65rem",
              }}
            >
              {(a.severity || "INFO").toUpperCase()}
            </span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{a.text}</span>
            <button
              onClick={() => handleAck(a.id)}
              style={{
                background: "transparent",
                border: "1px solid rgba(0,229,255,0.2)",
                color: "var(--iron-dim)",
                fontSize: "0.55rem",
                padding: "0.1rem 0.35rem",
                cursor: "pointer",
                fontFamily: "Share Tech Mono, monospace",
                borderRadius: 2,
                flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,229,255,0.5)"; e.currentTarget.style.color = "var(--iron-cyan)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,229,255,0.2)"; e.currentTarget.style.color = "var(--iron-dim)"; }}
            >
              ACK
            </button>
          </div>
        );
      })}
    </div>
  );
}
