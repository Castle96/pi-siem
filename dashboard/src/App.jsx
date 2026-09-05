import { useState, useEffect, useRef, useLayoutEffect } from "react";
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
import ProjectManagement from "./components/ProjectManagement";
import KanbanBoard from "./components/KanbanBoard";
import { useSiemData } from "./hooks/useSiemData";
import Particles from "./components/Particles";

export default function App() {
  const { nodes, metrics, alerts, agents, voiceEvents, voiceState, storage, sync } = useSiemData();
  const [clock, setClock] = useState(new Date());
  const headerRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = clock.toISOString().replace("T", " ").replace("Z", " UTC");

  useLayoutEffect(() => {
    const cards = document.querySelectorAll(".card-enter");
    cards.forEach((card, i) => {
      card.style.animationDelay = `${i * 60}ms`;
      card.classList.add("card-enter");
    });
  }, []);

  return (
    <div
      style={{
        padding: "0.6rem",
        height: "100vh",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gridTemplateColumns: "1fr 1.2fr 1fr",
        gridTemplateAreas: `
          "header header header"
          "diag center storage"
          "diag center feed"
          "power kanban voice"
        `,
        gap: "0.6rem",
        background: "transparent",
        position: "relative",
        zIndex: 2,
        border: "1px solid rgba(0,229,255,0.1)",
        borderRadius: 4,
      }}
    >
      {/* Ambient particles background */}
      <Particles />

      {/* Ambient pulse overlay */}
      <div id="pulse-overlay" />
      <div className="sine-sweep" />

      {/* Header */}
      <header
        ref={headerRef}
        style={{
          gridArea: "header",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(0,229,255,0.2)",
          paddingBottom: "0.4rem",
          fontFamily: "Share Tech Mono, monospace",
          letterSpacing: "0.1em",
          background: "rgba(5,7,10,0.7)",
          backdropFilter: "blur(6px)",
          animation: "slideInBottom 0.4s ease-out, borderPulse 2.5s ease-in-out infinite",
          borderImage: "linear-gradient(90deg, rgba(0,229,255,0.2), rgba(255,42,109,0.1), rgba(0,229,255,0.2)) 1",
        }}
      >
        <div
          className="header-glitch glitch-text"
          style={{
            color: "var(--iron-cyan)",
            textShadow: "0 0 12px rgba(0,229,255,0.7)",
            fontSize: "1.15rem",
            letterSpacing: "0.15em",
            cursor: "default",
          }}
        >
          D.I.V.A // SIEM
        </div>
        <div
          className="flicker"
          style={{
            color: "var(--iron-dim)",
            fontSize: "0.7rem",
            display: "flex",
            gap: "1.25rem",
            alignItems: "center",
          }}
        >
          <DigitalClock />
          <span className={`cursor-blink ${nodes.length > 0 || agents.length > 0 ? "" : "spinner"}`}>
            WS: {nodes.length > 0 || agents.length > 0 ? "LIVE" : "CONNECTING"}
          </span>
          <span style={{ color: "#00e5ff", textShadow: "0 0 6px #00e5ff" }}>
            THREAT: {threatLevel(nodes)}
          </span>
          <span style={{ color: "#00ff9d", textShadow: "0 0 6px #00ff9d" }}>
            AGENTS: {agents.length}
          </span>
          <span
            style={{
              color:
                voiceState === "listening"
                  ? "#ffae00"
                  : voiceState === "speaking"
                  ? "#00ff9d"
                  : voiceState === "thinking"
                  ? "#00e5ff"
                  : "var(--iron-dim)",
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
              transition: "color 0.3s ease, text-shadow 0.3s ease",
            }}
          >
            VOICE: {voiceState.toUpperCase()}
          </span>
        </div>
      </header>

      {/* Left: Diagnostics */}
      <div style={{ gridArea: "diag", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <CyberCard title="SYSTEM DIAGNOSTICS">
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <DiagnosticPanel metrics={metrics} alerts={alerts} />
          </div>
        </CyberCard>
      </div>

      {/* Center: HUD + Threat */}
      <div style={{ gridArea: "center", display: "grid", gap: "0.6rem", minHeight: 0 }}>
        <CyberCard title="FLIGHT // NAVIGATION">
          <div style={{ height: 260, minHeight: 220 }}>
            <CircularHUD agents={agents} metrics={metrics} />
          </div>
        </CyberCard>
        <CyberCard title="THREAT TOPOLOGY" pulse={alerts.length > 0}>
          <div style={{ height: "100%", minHeight: 220 }}>
            <ThreatMap events={nodes} />
          </div>
        </CyberCard>
      </div>

      {/* Right: Storage + Feed */}
      <div style={{ gridArea: "storage", display: "grid", gap: "0.6rem", minHeight: 0 }}>
        <CyberCard title="CLUSTER STORAGE">
          <div style={{ height: 200, minHeight: 180 }}>
            <StoragePanel />
          </div>
        </CyberCard>
        <CyberCard title="INCIDENT FEED" status="magenta" pulse={alerts.some(a => a.severity === "high")}>
          <div style={{ height: "100%", minHeight: 160, overflow: "hidden" }}>
            <AlertFeed alerts={alerts} />
          </div>
        </CyberCard>
      </div>

      {/* Bottom: Power + Kanban + Voice */}
      <div style={{ gridArea: "power", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", minHeight: 0 }}>
        <CyberCard title="POWER & STATUS">
          <div style={{ height: 140, minHeight: 120 }}>
            <PowerStatusPanel />
          </div>
        </CyberCard>
        <CyberCard title="PROJECT MANAGEMENT">
          <div style={{ height: 140, minHeight: 120 }}>
            <ProjectManagement />
          </div>
        </CyberCard>
      </div>

      <div style={{ gridArea: "kanban", minHeight: 0 }}>
        <CyberCard title="KANBAN BOARD">
          <div style={{ height: 140, minHeight: 120 }}>
            <KanbanBoard />
          </div>
        </CyberCard>
      </div>

      <div style={{ gridArea: "voice", minHeight: 0 }}>
        <CyberCard
          title={voiceState !== "idle" ? "VOICE INTERFACE // ACTIVE" : "VOICE INTERFACE"}
          status={voiceState === "speaking" ? "magenta" : "cyan"}
          pulse={voiceState !== "idle"}
        >
          <div style={{ height: 140, minHeight: 120 }}>
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
