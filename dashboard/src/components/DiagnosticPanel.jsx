import { useEffect, useState } from "react";

const POLL_MS = 3000;

export default function DiagnosticPanel({ metrics = [] }) {
  const [realtime, setRealtime] = useState(null);
  const [net, setNet] = useState({ up: null, down: null });

  useEffect(() => {
    let cancelled = false;
    let prevBytes = null;

    const fetchAll = () => {
      // Live CPU/memory/load snapshot
      fetch("/api/metrics/realtime")
        .then(r => r.json())
        .then(d => {
          if (!cancelled) setRealtime(d);
        })
        .catch(() => {});

      // Network throughput derived from interface byte counters
      fetch("/api/system")
        .then(r => r.json())
        .then(d => {
          if (cancelled) return;
          const ifaces = d.network?.interfaces || {};
          const bytes = Object.values(ifaces).reduce(
            (acc, i) => ({
              up: acc.up + (i.bytes_sent || 0),
              down: acc.down + (i.bytes_recv || 0),
            }),
            { up: 0, down: 0 }
          );
          if (prevBytes) {
            const dt = POLL_MS / 1000;
            const up = ((bytes.up - prevBytes.up) * 8) / dt / 1e6;
            const down = ((bytes.down - prevBytes.down) * 8) / dt / 1e6;
            setNet({ up: Math.max(0, up), down: Math.max(0, down) });
          }
          prevBytes = bytes;
        })
        .catch(() => {});
    };

    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const cpu = Math.round(realtime?.cpu ?? metrics[metrics.length - 1] ?? 0);
  const mem = Math.round(realtime?.memory ?? metrics[metrics.length - 2] ?? 0);
  // Real recent CPU history (falls back to a flat live value)
  const history = metrics.length >= 6 ? metrics.slice(-6) : Array(6).fill(cpu);
  const loadavg = realtime?.loadavg
    ? `${realtime.loadavg["1min"]?.toFixed(1)} / ${realtime.loadavg["5min"]?.toFixed(1)} / ${realtime.loadavg["15min"]?.toFixed(1)}`
    : "—";
  const uptime = fmtUptime(realtime?.uptime) || "—";

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
            {cpu}%
          </text>
          <text x="100" y="110" textAnchor="middle" fill="var(--iron-dim)" fontSize="10">
            CPU LOAD
          </text>
        </svg>
      </div>

      {/* Vertical bar graph: last 6 real CPU readings */}
      <div style={{ display: "flex", gap: "0.4rem", height: 80, alignItems: "flex-end" }}>
        {history.map((v, i) => {
          const pct = Math.max(2, Math.min(100, v));
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${pct}%`,
                background: `linear-gradient(to top, rgba(0,229,255,0.3), rgba(0,229,255,0.8))`,
                borderTop: `2px solid #00e5ff`,
                boxShadow: "0 0 8px rgba(0,229,255,0.3)",
                transition: "height 0.4s ease",
              }}
            />
          );
        })}
      </div>

      {/* Real status rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "auto" }}>
        <StatusRow label="MEMORY" value={`${mem}%`} color={mem > 85 ? "#ff2a6d" : "#00e5ff"} />
        <StatusRow label="LOAD AVG" value={loadavg} color="#00e5ff" />
        <StatusRow label="UPTIME" value={uptime} color="#00e5ff" />
        <StatusRow label="UPLINK" value={net.up != null ? `${net.up.toFixed(2)} Mb/s` : "—"} color="#00e5ff" />
        <StatusRow label="DOWNLINK" value={net.down != null ? `${net.down.toFixed(2)} Mb/s` : "—"} color="#ffae00" />
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

function fmtUptime(s) {
  if (typeof s !== "number" || !isFinite(s) || s <= 0) return null;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(s % 60)}s`;
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