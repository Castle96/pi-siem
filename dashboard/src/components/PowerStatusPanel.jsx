import { useState, useEffect } from "react";

export default function PowerStatusPanel() {
  const [battery, setBattery] = useState(31);
  const [capacity] = useState(100);

  useEffect(() => {
    const id = setInterval(() => {
      setBattery((prev) => (prev >= 100 ? 0 : prev + 1));
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        fontFamily: "Share Tech Mono, monospace",
        fontSize: "0.75rem",
        color: "var(--iron-text)",
      }}
    >
      <div style={{ color: "var(--iron-cyan)", letterSpacing: "0.15em", marginBottom: 4 }}>
        POWER & STATUS
      </div>

      {/* Battery block */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            flex: 1,
            border: "1px solid rgba(0,229,255,0.3)",
            padding: "0.75rem",
            background: "rgba(0,229,255,0.05)",
            boxShadow: "0 0 12px rgba(0,229,255,0.15)",
          }}
        >
          <div style={{ color: "var(--iron-dim)", fontSize: "0.6rem", marginBottom: 4 }}>CHARGE</div>
          <div style={{ fontSize: "1.5rem", color: "#00e5ff", textShadow: "0 0 10px rgba(0,229,255,0.6)", lineHeight: 1 }}>
            {battery}%
          </div>
        </div>
        <div
          style={{
            flex: 1,
            border: "1px solid rgba(0,229,255,0.3)",
            padding: "0.75rem",
            background: "rgba(0,229,255,0.05)",
            boxShadow: "0 0 12px rgba(0,229,255,0.15)",
          }}
        >
          <div style={{ color: "var(--iron-dim)", fontSize: "0.6rem", marginBottom: 4 }}>CAPACITY</div>
          <div style={{ fontSize: "1.5rem", color: "#e0f7fa", textShadow: "0 0 10px rgba(224,247,250,0.4)", lineHeight: 1 }}>
            {capacity}%
          </div>
        </div>
      </div>

      {/* Disk status circular gauge */}
      <div style={{ position: "relative", height: 100, marginTop: "0.5rem" }}>
        <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="rgba(0,229,255,0.1)"
            strokeWidth="6"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#00e5ff"
            strokeWidth="6"
            strokeDasharray={`${(battery / 100) * 251} 251`}
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 6px #00e5ff)" }}
          />
          <text x="50" y="45" textAnchor="middle" fill="#e0f7fa" fontSize="16" fontWeight="bold">
            {battery}%
          </text>
          <text x="50" y="60" textAnchor="middle" fill="var(--iron-dim)" fontSize="8">
            DSK STATUS
          </text>
        </svg>
      </div>

      {/* Status ticks */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", fontSize: "0.6rem", color: "var(--iron-dim)" }}>
        <span>01</span>
        <span>02</span>
        <span>03</span>
        <span>04</span>
        <span>05</span>
      </div>
    </div>
  );
}
