import { useState, useEffect } from "react";
import CyberCard from "./components/CyberCard";
import ThreatMap from "./components/ThreatMap";
import MetricsRail from "./components/MetricsRail";
import AlertFeed from "./components/AlertFeed";

export default function App() {
  const [clock, setClock] = useState(new Date());
  const [threatLevel, setThreatLevel] = useState("LOW");
  const [nodeCount, setNodeCount] = useState("—");

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Replace with live tailnet / backend data later
  useEffect(() => {
    const levels = ["LOW", "ELEVATED", "HIGH", "CRITICAL"];
    const counts = ["12", "18", "23", "31"];
    let tick = 0;
    const id = setInterval(() => {
      tick = (tick + 1) % levels.length;
      setThreatLevel(levels[tick]);
      setNodeCount(counts[tick]);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const timeStr = clock.toISOString().replace("T", " ").replace("Z", " UTC");

  return (
    <div
      style={{
        padding: "1rem",
        height: "100vh",
        display: "grid",
        gridTemplateRows: "auto 1fr",
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
          <span>TAILNET: ACTIVE</span>
          <span>NODES: {nodeCount}</span>
          <span>CLK: {timeStr}</span>
          <span>THREAT: {threatLevel}</span>
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
            <ThreatMap />
          </div>
        </CyberCard>

        <div style={{ display: "grid", gap: "1rem" }}>
          <CyberCard title="INCIDENT FEED" status="magenta">
            <div style={{ height: 220 }}>
              <AlertFeed />
            </div>
          </CyberCard>
          <CyberCard title="METRICS">
            <div style={{ height: 160 }}>
              <MetricsRail />
            </div>
          </CyberCard>
        </div>
      </div>

      <div className="global-scanlines" />
    </div>
  );
}
