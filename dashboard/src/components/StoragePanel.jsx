import { useEffect, useRef, useState } from "react";

export default function StoragePanel() {
  const [drives, setDrives] = useState([
    { letter: "E:", usage: 92, color: "#00e5ff" },
    { letter: "F:", usage: 45, color: "#00ff9d" },
    { letter: "G:", usage: 78, color: "#ffae00" },
  ]);

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
        USB STORAGE INFO
      </div>

      {/* Drive icon */}
      <div
        style={{
          width: 48,
          height: 56,
          border: "2px solid var(--iron-cyan)",
          borderRadius: 4,
          margin: "0 auto 0.5rem",
          boxShadow: "0 0 12px rgba(0,229,255,0.4)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 8,
            right: 8,
            height: 6,
            background: "rgba(0,229,255,0.3)",
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "2px solid var(--iron-cyan)",
            boxShadow: "inset 0 0 8px rgba(0,229,255,0.5)",
          }}
        />
      </div>

      {/* Drive bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.5rem" }}>
        {drives.map((drive) => (
          <div key={drive.letter}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "var(--iron-dim)", fontSize: "0.7rem" }}>({drive.letter})</span>
              <span style={{ color: drive.color, textShadow: `0 0 6px ${drive.color}`, fontSize: "0.7rem" }}>
                {drive.usage}%
              </span>
            </div>
            <div
              style={{
                height: 8,
                background: "rgba(0,229,255,0.1)",
                border: "1px solid rgba(0,229,255,0.3)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${drive.usage}%`,
                  background: `linear-gradient(90deg, ${drive.color}44, ${drive.color})`,
                  boxShadow: `0 0 10px ${drive.color}66`,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "auto", color: "var(--iron-dim)", fontSize: "0.65rem", letterSpacing: "0.1em" }}>
        545 GB AVAILABLE
      </div>
    </div>
  );
}
