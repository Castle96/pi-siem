import { useEffect, useRef, useState } from "react";

export default function DiagnosticPanel({ metrics = [], alerts = [] }) {
  const cpu = metrics.length > 0 ? metrics[metrics.length - 1] : 0;
  const mem = metrics.length > 1 ? metrics[metrics.length - 2] : 0;
  const net = Math.abs(Math.sin(Date.now() / 10000)) * 100;

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
        SYSTEM DIAGNOSTICS
      </div>

      {/* Semi-circular gauge */}
      <div style={{ position: "relative", height: 120 }}>
        <svg viewBox="0 0 200 120" style={{ width: "100%", height: "100%" }}>
          <path
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none"
            stroke="rgba(0,229,255,0.15)"
            strokeWidth="8"
          />
          <path
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth="8"
            strokeDasharray={`${(cpu / 100) * 251} 251`}
          />
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00e5ff" />
              <stop offset="100%" stopColor="#00ff9d" />
            </linearGradient>
          </defs>
          <text x="100" y="95" textAnchor="middle" fill="#e0f7fa" fontSize="24" fontWeight="bold">
            {Math.round(cpu)}%
          </text>
          <text x="100" y="110" textAnchor="middle" fill="var(--iron-dim)" fontSize="10">
            CPU LOAD
          </text>
        </svg>
      </div>

      {/* Vertical bar graph */}
      <div style={{ display: "flex", gap: "0.4rem", height: 80, alignItems: "flex-end" }}>
        {[65, 78, 45, 88, 52, 70].map((v, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${v}%`,
              background: `linear-gradient(to top, rgba(0,229,255,0.3), rgba(0,229,255,0.8))`,
              borderTop: `2px solid #00e5ff`,
              boxShadow: "0 0 8px rgba(0,229,255,0.3)",
            }}
          />
        ))}
      </div>

      {/* Status rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "auto" }}>
        <StatusRow label="AUXILIARY FAN" value="NORMAL" color="#00ff9d" />
        <StatusRow label="CPU FAN" value={`${Math.round(1200 + cpu * 20)} RPM`} color="#00e5ff" />
        <StatusRow label="UPLINK" value={`${net.toFixed(1)} Mb/s`} color="#00e5ff" />
        <StatusRow label="DOWNLINK" value={`${(net * 0.7).toFixed(1)} Mb/s`} color="#ffae00" />
      </div>

      <style>{`
        @keyframes dashPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function StatusRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "var(--iron-dim)", fontSize: "0.65rem", letterSpacing: "0.1em" }}>{label}</span>
      <span style={{ color, textShadow: `0 0 6px ${color}`, fontSize: "0.7rem", animation: "dashPulse 2s ease-in-out infinite" }}>
        {value}
      </span>
    </div>
  );
}
