export default function CyberCard({ title, children, status = "cyan" }) {
  const glow =
    status === "magenta" ? "var(--iron-glow-magenta)" : "var(--iron-glow-cyan)";

  return (
    <div
      style={{
        position: "relative",
        border: "1px solid rgba(0,229,255,0.15)",
        background: "rgba(5,7,10,0.85)",
        padding: "1.25rem",
        boxShadow: glow,
      }}
    >
      <Corner position="top-left" />
      <Corner position="top-right" />
      <Corner position="bottom-left" />
      <Corner position="bottom-right" />
      {title && (
        <h3
          style={{
            margin: "0 0 0.75rem 0",
            fontFamily: "Share Tech Mono, monospace",
            color: "var(--iron-cyan)",
            textShadow: "0 0 8px rgba(0,229,255,0.6)",
            letterSpacing: "0.08em",
            fontSize: "0.95rem",
          }}
        >
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

function Corner({ position }) {
  const style = {
    position: "absolute",
    width: 10,
    height: 10,
    borderColor: "var(--iron-cyan)",
    borderStyle: "solid",
  };

  const variants = {
      "top-left": { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 },
      "top-right": { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 },
      "bottom-left": { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 },
      "bottom-right": { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 },
    };

  return <div style={{ ...style, ...variants[position] }} />;
}
