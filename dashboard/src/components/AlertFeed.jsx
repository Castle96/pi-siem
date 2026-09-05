export default function AlertFeed({ alerts = [] }) {
  const defaults = [
    { id: 1, severity: "high", text: "Brute-force pattern detected on 10.0.0.5" },
    { id: 2, severity: "medium", text: "Unusual outbound traffic on port 4444" },
    { id: 3, severity: "low", text: "Failed login spike from subnet 192.168.6.0/24" },
    { id: 4, severity: "high", text: "Potential data exfil via DNS tunnel" },
  ];

  const items = alerts.length > 0 ? alerts : defaults;

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
              {a.severity.toUpperCase()}
            </span>
            <span>{a.text}</span>
          </div>
        );
      })}
    </div>
  );
}
