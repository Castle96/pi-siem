import { useState } from "react";

const DEFAULT_PROJECTS = [
  { id: 1, name: "Pleiades Core", status: "active", progress: 72, backend: "rust" },
  { id: 2, name: "SIEM Dashboard", status: "active", progress: 88, backend: "react" },
  { id: 3, name: "Voice Pipeline", status: "review", progress: 45, backend: "python" },
  { id: 4, name: "Agent Fleet", status: "blocked", progress: 30, backend: "rust" },
];

export default function ProjectManagement() {
  const [projects, setProjects] = useState(DEFAULT_PROJECTS);

  const statusColor = (s) => {
    if (s === "active") return "#00e5ff";
    if (s === "review") return "#ffae00";
    if (s === "blocked") return "#ff2a6d";
    return "#4a6070";
  };

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        fontSize: "0.7rem",
      }}
    >
      {projects.map((p) => (
        <div
          key={p.id}
          style={{
            border: "1px solid rgba(0,229,255,0.12)",
            background: "rgba(0,229,255,0.03)",
            padding: "0.5rem",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#e0f7fa", fontFamily: "Share Tech Mono, monospace", fontSize: "0.75rem" }}>
              {p.name}
            </span>
            <span
              style={{
                color: statusColor(p.status),
                textShadow: `0 0 6px ${statusColor(p.status)}`,
                fontSize: "0.6rem",
                fontFamily: "Share Tech Mono, monospace",
              }}
            >
              {p.status.toUpperCase()}
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: "rgba(0,229,255,0.1)",
              border: "1px solid rgba(0,229,255,0.2)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${p.progress}%`,
                background: `linear-gradient(90deg, ${statusColor(p.status)}44, ${statusColor(p.status)})`,
                boxShadow: `0 0 8px ${statusColor(p.status)}66`,
                transition: "width 0.5s ease",
              }}
            />
          </div>
          <div style={{ color: "var(--iron-dim)", fontSize: "0.6rem", textAlign: "right" }}>
            {p.progress}% · {p.backend}
          </div>
        </div>
      ))}
    </div>
  );
}
