export default function AlertFeed({ alerts = [] }) {
  const items = alerts;

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
          </div>
        );
      })}
    </div>
  );
}
