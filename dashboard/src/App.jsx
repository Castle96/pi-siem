import { useState, useEffect } from "react";
import CyberCard from "./components/CyberCard";
import ThreatMap from "./components/ThreatMap";
import MetricsRail from "./components/MetricsRail";
import AlertFeed from "./components/AlertFeed";
import AgentSwarm from "./components/AgentSwarm";
import { useSiemData } from "./hooks/useSiemData";

export default function App() {
  const { nodes, metrics, alerts, agents } = useSiemData();
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = clock.toISOString().replace("T", " ").replace("Z", " UTC");

  return (
    <div
      style={{
        padding: "1rem",
        height: "100vh",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: "1rem",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(0,229,255,0.15)",
          paddingBottom: "0.75rem",
          fontFamily: "Share Tech Mono, monospace",
          letterSpacing: "0.1em",
        }}
      >
        <div
          style={{
            color: "var(--iron-cyan)",
            textShadow: "0 0 10px rgba(0,229,255,0.6)",
          }}
        >
          J.A.R.V.I.S. // SIEM
        </div>
        <div
          style={{
            color: "var(--iron-dim)",
            fontSize: "0.8rem",
            display: "flex",
            gap: "1.5rem",
          }}
        >
          <span>WS: {nodes.length > 0 || agents.length > 0 ? "LIVE" : "CONNECTING"}</span>
          <span>CLK: {timeStr}</span>
          <span>THREAT: {threatLevel(nodes)}</span>
          <span>AGENTS: {agents.length}</span>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "1rem",
          minHeight: 0,
        }}
      >
        <CyberCard title="THREAT TOPOLOGY">
          <div style={{ height: "100%", minHeight: 320 }}>
            <ThreatMap events={nodes} />
          </div>
        </CyberCard>

        <div style={{ display: "grid", gap: "1rem" }}>
          <CyberCard title="INCIDENT FEED" status="magenta">
            <div style={{ height: 220 }}>
              <AlertFeed alerts={alerts} />
            </div>
          </CyberCard>
          <CyberCard title="METRICS">
            <div style={{ height: 160 }}>
              <MetricsRail metrics={metrics} />
            </div>
          </CyberCard>
        </div>
      </div>

      <CyberCard title="AGENT SWARM ORCHESTRATION">
        <div style={{ height: 260, minHeight: 220 }}>
          <AgentSwarm agents={agents} />
        </div>
      </CyberCard>

      <div className="global-scanlines" />
    </div>
  );
}

function threatLevel(nodes) {
  const active = nodes.filter((n) => n.active).length;
  if (active > 6) return "CRITICAL";
  if (active > 3) return "HIGH";
  if (active > 0) return "ELEVATED";
  return "LOW";
}
