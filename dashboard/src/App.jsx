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

import SystemMonitor from "./pages/SystemMonitor";
import ServiceDiscovery from "./pages/ServiceDiscovery";
import ClusterView from "./pages/ClusterView";

const NAV_ITEMS = [
  { id: "system", label: "SYS MON", color: "#00e5ff", hover: "rgba(0,229,255,0.15)" },
  { id: "services", label: "SVCS", color: "#00ff9d", hover: "rgba(0,255,157,0.15)" },
  { id: "cluster", label: "CLUSTER", color: "#ffae00", hover: "rgba(255,174,0,0.15)" },
];

export default function App() {
  const { nodes, metrics, alerts, agents, voiceEvents, voiceState, voiceAction, voiceStale, storage, sync, wsStatus } = useSiemData();
  const [clock, setClock] = useState(new Date());
  const headerRef = useRef(null);
  const [activePage, setActivePage] = useState(null);
  const [unackedCount, setUnackedCount] = useState(0);
  const [anomalies, setAnomalies] = useState([]);
  const lastVoiceActionRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll unacked alert count
  useEffect(() => {
    const fetchUnacked = () => {
      fetch("/api/alerts/unacked_count")
        .then(r => r.json())
        .then(d => setUnackedCount(d.unacked || 0))
        .catch(() => {});
    };
    fetchUnacked();
    const id = setInterval(fetchUnacked, 5000);
    return () => clearInterval(id);
  }, []);

  // Poll anomalies
  useEffect(() => {
    const fetchAnomalies = () => {
      fetch("/api/anomalies")
        .then(r => r.json())
        .then(d => setAnomalies(d.anomalies || []))
        .catch(() => {});
    };
    fetchAnomalies();
    const id = setInterval(fetchAnomalies, 10000);
    return () => clearInterval(id);
  }, []);

  // Optional voice-driven navigation: "open system monitor" etc.
  useEffect(() => {
    if (!voiceAction) return;
    if (lastVoiceActionRef.current === voiceAction.id) return;
    lastVoiceActionRef.current = voiceAction.id;
    const act = voiceAction.action || {};
    if (act.open) {
      const byId = { system: "system", services: "services", cluster: "cluster" };
      setActivePage(byId[act.open] || null);
    } else if (act.open === null) {
      setActivePage(null);
    }
  }, [voiceAction]);

  useLayoutEffect(() => {
    const cards = document.querySelectorAll(".card-enter");
    cards.forEach((card, i) => {
      card.style.animationDelay = `${i * 60}ms`;
      card.classList.add("card-enter");
    });
  }, []);

  const openPage = (page) => setActivePage(page);
  const closePage = () => setActivePage(null);

  // Close page overlays with the ESC key
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") closePage();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="dashboard-grid">
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
          paddingBottom: "0.35rem",
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
          <span className={`cursor-blink ${wsStatus === "LIVE" ? "" : "spinner"}`}>
            WS: {wsStatus}
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

      {/* Footer with unacked alerts + WS status */}
      <footer
        style={{
          gridArea: "footer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid rgba(0,229,255,0.2)",
          paddingTop: "0.25rem",
          fontFamily: "Share Tech Mono, monospace",
          fontSize: "0.6rem",
          color: "var(--iron-dim)",
          letterSpacing: "0.05em",
        }}
      >
        <span>D.I.V.A // SIEM</span>
        <span id="unacked-badge" style={{ color: unackedCount > 0 ? "#ff2a6d" : "#00ff9d", textShadow: unackedCount > 0 ? "0 0 6px #ff2a6d" : "none" }}>
          UNACKED: {unackedCount}
        </span>
        <span style={{ color: anomalies.length > 0 ? "#ffae00" : "var(--iron-dim)", textShadow: anomalies.length > 0 ? "0 0 6px #ffae00" : "none" }}>
          ANOMALIES: {anomalies.length}
        </span>
        <span>WS: {wsStatus}</span>
      </footer>

      {/* Navigation bar */}
      <nav
        style={{
          gridArea: "nav",
          display: "flex",
          gap: "0.4rem",
          padding: "0.35rem 0.4rem",
          background: "rgba(5,7,10,0.5)",
          border: "1px solid rgba(0,229,255,0.1)",
          borderRadius: 3,
          animation: "slideInBottom 0.5s ease-out",
        }}
      >
        {NAV_ITEMS.map(item => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => openPage(item.id)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                padding: "0.35rem 0.6rem",
                background: isActive ? item.hover : "transparent",
                border: `1px solid ${isActive ? item.color + "66" : "rgba(0,229,255,0.1)"}`,
                borderRadius: 3,
                fontFamily: "Share Tech Mono, monospace",
                fontSize: "0.7rem",
                color: isActive ? item.color : "var(--iron-dim)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                textShadow: isActive ? `0 0 6px ${item.color}` : "none",
                letterSpacing: "0.05em",
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = "rgba(0,229,255,0.06)";
                  e.currentTarget.style.borderColor = "rgba(0,229,255,0.3)";
                  e.currentTarget.style.color = "var(--iron-text)";
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "rgba(0,229,255,0.1)";
                  e.currentTarget.style.color = "var(--iron-dim)";
                }
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? item.color : "var(--iron-dim)", boxShadow: isActive ? `0 0 4px ${item.color}` : "none" }} />
              {item.label}
            </button>
          );
        })}

        {/* Cluster quick scan inline */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.25rem 0.5rem", background: "rgba(255,174,0,0.05)", border: "1px solid rgba(255,174,0,0.15)", borderRadius: 3 }}>
          <span className="spinner" style={{ width: 6, height: 6, borderColor: "#ffae00", borderTopColor: "#ffae00" }} />
          <span style={{ color: "#ffae00", fontSize: "0.65rem", textShadow: "0 0 4px rgba(255,174,0,0.5)" }}>
            CLUSTER: {nodes.filter(n => n.online).length}/{nodes.length}
          </span>
        </div>
      </nav>

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
          <div style={{ height: 200, minHeight: 160 }}>
            <VoicePanel events={voiceEvents} stale={voiceStale} headerVoiceState={voiceState} />
          </div>
        </CyberCard>
      </div>

      <div className="global-scanlines" />

      {/* Page overlay */}
      {activePage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            zIndex: 10000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "fadeIn 0.25s ease-out",
          }}
          onClick={closePage}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 44,
              background: "rgba(5,7,10,0.95)",
              borderBottom: "1px solid rgba(0,229,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 1rem",
              zIndex: 10,
              backdropFilter: "blur(8px)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--iron-cyan)", boxShadow: "0 0 8px rgba(0,229,255,0.7)" }} />
              <span className="header-glitch glitch-text" style={{ color: "var(--iron-cyan)", fontSize: "0.9rem", textShadow: "0 0 10px rgba(0,229,255,0.5)", letterSpacing: "0.12em" }}>
                {activePage === "system" && "SYSTEM MONITOR"}
                {activePage === "services" && "SERVICE DISCOVERY"}
                {activePage === "cluster" && "CLUSTER VIEW"}
              </span>
            </div>
            <button
              onClick={closePage}
              style={{
                background: "transparent",
                border: "1px solid rgba(0,229,255,0.3)",
                color: "var(--iron-cyan)",
                padding: "0.35rem 1rem",
                fontFamily: "Share Tech Mono, monospace",
                fontSize: "0.7rem",
                cursor: "pointer",
                borderRadius: 2,
                letterSpacing: "0.05em",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(0,229,255,0.12)";
                e.currentTarget.style.borderColor = "rgba(0,229,255,0.6)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "rgba(0,229,255,0.3)";
              }}
            >
              CLOSE [ESC]
            </button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0.6rem", paddingTop: 52 }} onClick={e => e.stopPropagation()}>
            {activePage === "system" && <SystemMonitor />}
            {activePage === "services" && <ServiceDiscovery />}
            {activePage === "cluster" && <ClusterView />}
          </div>
        </div>
      )}
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
