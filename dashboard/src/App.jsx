import { useState, useEffect } from "react";
import CyberCard from "./components/CyberCard";
import ThreatMap from "./components/ThreatMap";
import MetricsRail from "./components/MetricsRail";
import AlertFeed from "./components/AlertFeed";
import AgentSwarm from "./components/AgentSwarm";
import VoicePanel from "./components/voice/VoicePanel";
import CircularHUD from "./components/CircularHUD";
import DiagnosticPanel from "./components/DiagnosticPanel";
import StoragePanel from "./components/StoragePanel";
import PowerStatusPanel from "./components/PowerStatusPanel";
import DigitalClock from "./components/DigitalClock";
import { useSiemData } from "./hooks/useSiemData";

export default function App() {
  const { nodes, metrics, alerts, agents, voiceEvents, voiceState } = useSiemData();
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = clock.toISOString().replace("T", " ").replace("Z", " UTC");

  return (
    <div
      style={{
        padding: "0.75rem",
        height: "100vh",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gridTemplateColumns: "1fr 1.2fr 1fr",
        gridTemplateAreas: `
          "header header header"
          "diag center storage"
          "diag center feed"
          "power power voice"
        `,
        gap: "0.75rem",
        background: "radial-gradient(ellipse at center, #0a0e17 0%, #05070a 70%)",
      }}
    >
      {/* Header */}
      <header
        style={{
          gridArea: "header",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(0,229,255,0.15)",
          paddingBottom: "0.5rem",
          fontFamily: "Share Tech Mono, monospace",
          letterSpacing: "0.1em",
        }}
      >
        <div
          style={{
            color: "var(--iron-cyan)",
            textShadow: "0 0 10px rgba(0,229,255,0.6)",
            fontSize: "1.1rem",
          }}
        >
          J.A.R.V.I.S. // SIEM
        </div>
        <div
          style={{
            color: "var(--iron-dim)",
            fontSize: "0.75rem",
            display: "flex",
            gap: "1.25rem",
            alignItems: "center",
          }}
        >
          <DigitalClock />
          <span>WS: {nodes.length > 0 || agents.length > 0 ? "LIVE" : "CONNECTING"}</span>
          <span>THREAT: {threatLevel(nodes)}</span>
          <span>AGENTS: {agents.length}</span>
          <span
            style={{
              color:
                voiceState === "listening"
                  ? "#ffae00"
                  : voiceState === "speaking"
                  ? "#00ff9d"
                  : voiceState === "thinking"
                  ? "#00e5ff"
                  : undefined,
              textShadow:
                voiceState !== "idle"
                  ? `0 0 10px ${
                      voiceState === "listening"
                        ? "#ffae00"
                        : voiceState === "speaking"
                        ? "#00ff9d"
                        : "#00e5ff"
                    }`
                  : undefined,
            }}
          >
            VOICE: {voiceState.toUpperCase()}
          </span>
        </div>
      </header>

      {/* Left: Diagnostics */}
      <div style={{ gridArea: "diag", minHeight: 0 }}>
        <CyberCard title="SYSTEM DIAGNOSTICS">
          <div style={{ height: "100%", minHeight: 320 }}>
            <DiagnosticPanel metrics={metrics} alerts={alerts} />
          </div>
        </CyberCard>
      </div>

      {/* Center: HUD + Threat */}
      <div style={{ gridArea: "center", display: "grid", gap: "0.75rem", minHeight: 0 }}>
        <CyberCard title="FLIGHT // NAVIGATION">
          <div style={{ height: 280, minHeight: 240 }}>
            <CircularHUD agents={agents} metrics={metrics} />
          </div>
        </CyberCard>
        <CyberCard title="THREAT TOPOLOGY">
          <div style={{ height: "100%", minHeight: 240 }}>
            <ThreatMap events={nodes} />
          </div>
        </CyberCard>
      </div>

      {/* Right: Storage + Feed */}
      <div style={{ gridArea: "storage", display: "grid", gap: "0.75rem", minHeight: 0 }}>
        <CyberCard title="USB STORAGE INFO">
          <div style={{ height: 220 }}>
            <StoragePanel />
          </div>
        </CyberCard>
        <CyberCard title="INCIDENT FEED" status="magenta">
          <div style={{ height: "100%", minHeight: 180 }}>
            <AlertFeed alerts={alerts} />
          </div>
        </CyberCard>
      </div>

      {/* Bottom: Power + Voice */}
      <div style={{ gridArea: "feed", display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "0.75rem", minHeight: 0 }}>
        <CyberCard title="POWER & STATUS">
          <div style={{ height: 160 }}>
            <PowerStatusPanel />
          </div>
        </CyberCard>
        <CyberCard
          title={voiceState !== "idle" ? "VOICE INTERFACE // ACTIVE" : "VOICE INTERFACE"}
          status={voiceState === "speaking" ? "magenta" : "cyan"}
        >
          <div style={{ height: 160 }}>
            <VoicePanel events={voiceEvents} />
          </div>
        </CyberCard>
      </div>

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
