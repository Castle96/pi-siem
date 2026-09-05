import { useMemo } from "react";

export default function AlertFeed({ alerts = [] }) {
  const items = useMemo(() => alerts, [alerts]);

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        fontSize: "0.75rem",
        lineHeight: 1.6,
        color: "var(--iron-text)",
      }}
    >
      {items.length === 0 && (
        <div style={{ color: "var(--iron-dim)" }}>Waiting for alerts...</div>
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
            key={a.id || a.text}
            style={{
              borderBottom: "1px solid rgba(0,229,255,0.08)",
              padding: "0.4rem 0",
              display: "flex",
              gap: "0.5rem",
              alignItems: "flex-start",
            }}
          >
            <span
              style={{
                color,
                textShadow: `0 0 6px ${color}`,
                fontFamily: "Share Tech Mono, monospace",
                minWidth: 48,
              }}
            >
              {(a.severity || "INFO").toUpperCase()}
            </span>
            <span>{a.text}</span>
          </div>
        );
      })}
    </div>
  );
}
