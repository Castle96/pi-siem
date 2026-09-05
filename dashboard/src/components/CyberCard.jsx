export default function CyberCard({ title, children, status = "cyan", pulse = false }) {
  const glow =
    status === "magenta" ? "var(--iron-glow-magenta)" : "var(--iron-glow-cyan)";
  const borderClass = pulse ? "alert-pulse" : "";
  const borderStyle = status === "magenta" ? {
    border: "1px solid rgba(255, 42, 109, 0.2)",
    boxShadow: glow + ", 0 0 20px rgba(255, 42, 109, 0.15)",
    animation: pulse ? "alertPulse 2s ease-in-out infinite" : "borderPulseMagenta 3s ease-in-out infinite",
  } : {
    border: "1px solid rgba(0, 229, 255, 0.2)",
    boxShadow: glow,
    animation: "borderPulse 3s ease-in-out infinite",
  };

  return (
    <div
      className={`card-enter ${title ? "" : ""}`}
      style={{
        position: "relative",
        ...borderStyle,
        background: "rgba(5,7,10,0.92)",
        padding: "0.85rem",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
        transition: "transform 0.2s ease, box-shadow 0.3s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `0 0 25px rgba(0,229,255,0.4), 0 4px 20px rgba(0,0,0,0.3)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = glow;
      }}
    >
      <Corner position="top-left" />
      <Corner position="top-right" />
      <Corner position="bottom-left" />
      <Corner position="bottom-right" />
      {title && (
        <h3
          className="glitch-text"
          style={{
            margin: "0 0 0.5rem 0",
            fontFamily: "Share Tech Mono, monospace",
            color: "var(--iron-cyan)",
            textShadow: "0 0 8px rgba(0,229,255,0.6)",
            letterSpacing: "0.08em",
            fontSize: "0.8rem",
            flexShrink: 0,
            cursor: "default",
          }}
        >
          {title}
        </h3>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function Corner({ position }) {
  const variants = {
    "top-left": { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 },
    "top-right": { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 },
    "bottom-left": { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 },
    "bottom-right": { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 },
  };

  return (
    <div
      className="corner-pulse"
      style={{
        position: "absolute",
        width: 10,
        height: 10,
        borderColor: "var(--iron-cyan)",
        borderStyle: "solid",
        pointerEvents: "none",
        zIndex: 2,
        ...variants[position],
        animation: "cornerPulse 3s ease-in-out infinite",
      }}
    />
  );
}
