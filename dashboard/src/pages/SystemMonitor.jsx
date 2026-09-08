import { useState, useEffect, useRef } from "react";
import LoadingScreen from "../components/LoadingScreen";

const REFRESH_MS = 6000;

export default function SystemMonitor() {
  const [localData, setLocalData] = useState(null);
  const [endpoints, setEndpoints] = useState([]);
  const [history, setHistory] = useState({});
  const [lanHosts, setLanHosts] = useState(null);
  const [lanOpen, setLanOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState({});
  const [auto, setAuto] = useState(true);

  const loadEndpoints = () =>
    fetch("/api/endpoints")
      .then(r => r.json())
      .then(d => setEndpoints(d.endpoints || []))
      .catch(() => {});

  useEffect(() => {
    fetch("/api/system")
      .then(r => r.json())
      .then(d => { setLocalData(d); setLoading(false); })
      .catch(() => setLoading(false));
    loadEndpoints();
  }, []);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      loadEndpoints();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [auto]);

  const loadHistory = (ip) => {
    if (!ip) return;
    fetch(`/api/endpoints/${encodeURIComponent(ip)}/history?type=cpu_usage&limit=45`)
      .then(r => r.json())
      .then(d => setHistory(prev => ({
        ...prev,
        [ip]: (d.history || []).map(h => h.value).slice(-30),
      })))
      .catch(() => {});
  };

  const refreshLan = () => {
    fetch("/api/lan/scan", { method: "POST" })
      .then(r => r.json())
      .then(d => setLanHosts(d.hosts || []))
      .catch(() => {});
  };

  const addServer = (ip, label) => {
    fetch("/api/endpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", ip, label }),
    })
      .then(r => r.json())
      .then(d => {
        loadEndpoints();
        if (d.action === "added") scanEndpoint(ip);
      })
      .catch(() => {});
  };

  const removeServer = (ip) => {
    fetch("/api/endpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", ip }),
    }).then(() => {
      loadEndpoints();
      setHistory(prev => { const c = { ...prev }; delete c[ip]; return c; });
    }).catch(() => {});
  };

  const scanEndpoint = (ip) => {
    setScanning(s => ({ ...s, [ip]: true }));
    fetch(`/api/endpoints/${encodeURIComponent(ip)}/scan`, { method: "POST" })
      .then(r => r.json())
      .then(d => {
        if (d.endpoint) {
          setEndpoints(prev => prev.map(e => e.ip === ip ? { ...e, ...d.endpoint } : e));
        }
        setScanning(s => ({ ...s, [ip]: false }));
      })
      .catch(() => setScanning(s => ({ ...s, [ip]: false })));
  };

  const scanAll = () => {
    endpoints.forEach(e => scanEndpoint(e.ip));
  };

  const toggleLan = () => {
    const next = !lanOpen;
    setLanOpen(next);
    if (next && lanHosts === null) refreshLan();
  };

  const addFromLan = (h) => {
    addServer(h.ip, h.hostname || h.ip);
    setLanHosts(prev => (prev || []).filter(x => x.ip !== h.ip));
  };

  if (loading) {
    return <LoadingScreen label="INITIALIZING SYSTEM MONITOR" color="#00e5ff" />;
  }

  const fmtBytes = (b) => {
    if (!b && b !== 0) return "—";
    const gb = b / 1024 ** 3;
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${(b / 1024 ** 2).toFixed(0)} MB`;
  };

  const fmtUptime = (s) => {
    if (!s) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const bars = [
    { title: "CPU", value: Math.min(localData?.cpu?.percent ?? 0, 100), color: (localData?.cpu?.percent ?? 0) > 80 ? "#ff2a6d" : "#00e5ff", subtitle: `${localData?.cpu?.count || 0} cores · ${localData?.loadavg?.["1min"]?.toFixed(2) || "—"} load` },
    { title: "RAM", value: Math.min(localData?.memory?.percent ?? 0, 100), color: (localData?.memory?.percent ?? 0) > 85 ? "#ff2a6d" : "#00e5ff", subtitle: `${fmtBytes(localData?.memory?.used)} / ${fmtBytes(localData?.memory?.total)}` },
    { title: "DISK", value: Math.min(localData?.disks?.[0]?.percent ?? 0, 100), color: (localData?.disks?.[0]?.percent ?? 0) > 85 ? "#ff2a6d" : "#00e5ff", subtitle: localData?.disks?.[0]?.mountpoint || "/" },
    { title: "SWAP", value: Math.min(localData?.memory?.swap_percent ?? 0, 100), color: (localData?.memory?.swap_percent ?? 0) > 50 ? "#ffae00" : "#00ff9d", subtitle: localData?.memory?.swap_used ? `${fmtBytes(localData.memory.swap_used)} used` : "idle" },
  ];

  const Spark = ({ values, color = "#00e5ff" }) => {
    if (!values || values.length < 2) {
      return <div style={{ color: "var(--iron-dim)", fontSize: "0.55rem" }}>no history yet</div>;
    }
    const w = 96, h = 20;
    const max = Math.max(...values, 10);
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(" ");
    return (
      <svg width={w} height={h} style={{ display: "block" }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.2} style={{ filter: `drop-shadow(0 0 3px ${color}88)` }} />
      </svg>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: "0.6rem", height: "100%", overflow: "hidden" }}>
      {/* Local system bar */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "0.3rem", borderBottom: "1px solid rgba(0,229,255,0.12)" }}>
          <div>
            <div style={{ color: "var(--iron-cyan)", fontFamily: "Share Tech Mono, monospace", fontSize: "0.8rem", letterSpacing: "0.1em", marginBottom: "0.1rem" }}>LOCAL HOST</div>
            <div style={{ color: "var(--iron-dim)", fontSize: "0.65rem" }}>{localData?.timestamp?.replace("T", " ").substring(0, 19) || "—"} UTC</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "var(--iron-dim)", fontSize: "0.65rem" }}>UPTIME</div>
            <div style={{ color: "#00e5ff", fontFamily: "Share Tech Mono, monospace", fontSize: "0.75rem", textShadow: "0 0 6px rgba(0,229,255,0.5)" }}>{fmtUptime(localData?.uptime_seconds)}</div>
          </div>
        </div>
        {bars.map(bar => (
          <div key={bar.title} style={{ display: "flex", flexDirection: "column", gap: "0.15rem", padding: "0.3rem 0.4rem", background: "rgba(0,229,255,0.02)", borderRadius: 2, borderLeft: `2px solid ${bar.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--iron-dim)", fontSize: "0.65rem" }}>{bar.title}</span>
              <span style={{ color: bar.color, fontFamily: "Share Tech Mono, monospace", fontSize: "0.8rem", textShadow: `0 0 6px ${bar.color}` }}>{bar.value.toFixed(1)}%</span>
            </div>
            <div style={{ height: 5, background: "rgba(0,229,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(bar.value, 100)}%`, background: bar.color, boxShadow: `0 0 8px ${bar.color}66`, transition: "width 0.4s ease" }} />
            </div>
            <div style={{ color: "var(--iron-dim)", fontSize: "0.55rem" }}>{bar.subtitle}</div>
          </div>
        ))}
        {localData?.cpu?.per_cpu?.length > 0 && (
          <div style={{ display: "flex", gap: "0.2rem", padding: "0.2rem 0.4rem", background: "rgba(0,229,255,0.02)", borderRadius: 2, alignItems: "flex-end" }}>
            <span style={{ color: "var(--iron-dim)", fontSize: "0.55rem", width: 24, textAlign: "right" }}>CORES:</span>
            {localData.cpu.per_cpu.map((p, i) => (
              <div key={i} style={{ flex: 1, height: 24, background: "rgba(0,229,255,0.05)", borderRadius: 1, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${Math.min(p, 100)}%`, background: p > 80 ? "#ff2a6d" : "#00e5ff", transition: "height 0.4s ease" }} />
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "1px 2px", fontSize: "0.5rem", color: p > 80 ? "#ff2a6d" : "var(--iron-dim)", fontFamily: "Share Tech Mono, monospace" }}>{p.toFixed(0)}%</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ color: "var(--iron-dim)", fontSize: "0.55rem", marginTop: "auto", paddingTop: "0.3rem", borderTop: "1px solid rgba(0,229,255,0.08)" }}>
          MONITORING {endpoints.length} ENDPOINT{endpoints.length === 1 ? "" : "S"} VIA BACKGROUND SWEEPER
        </div>
      </div>

      {/* Remote endpoints panel */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", overflow: "hidden" }}>
        {/* Add server */}
        <div style={{ display: "flex", gap: "0.3rem", padding: "0.3rem 0.4rem", background: "rgba(255,174,0,0.04)", border: "1px solid rgba(255,174,0,0.12)", borderRadius: 2 }}>
          <input id="remote-ip-input" type="text" placeholder="192.168.x.x" style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,229,255,0.2)", borderRadius: 2, padding: "0.25rem 0.4rem", fontFamily: "Share Tech Mono, monospace", fontSize: "0.7rem", color: "var(--iron-text)", outline: "none" }} />
          <input id="remote-label-input" type="text" placeholder="label" style={{ width: 80, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,229,255,0.2)", borderRadius: 2, padding: "0.25rem 0.4rem", fontFamily: "Share Tech Mono, monospace", fontSize: "0.7rem", color: "var(--iron-text)", outline: "none" }} />
          <button
            onClick={() => {
              const ip = document.getElementById("remote-ip-input").value.trim();
              const label = document.getElementById("remote-label-input").value.trim() || ip;
              if (ip) { addServer(ip, label); document.getElementById("remote-ip-input").value = ""; document.getElementById("remote-label-input").value = ""; }
            }}
            style={{ background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.3)", color: "var(--iron-cyan)", padding: "0.25rem 0.5rem", borderRadius: 2, fontFamily: "Share Tech Mono, monospace", fontSize: "0.65rem", cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(0,229,255,0.2)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(0,229,255,0.12)"}
          >
            ADD
          </button>
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", gap: "0.3rem", padding: "0.25rem 0.4rem", alignItems: "center" }}>
          <button onClick={scanAll} disabled={endpoints.length === 0} style={{ background: endpoints.length === 0 ? "rgba(255,42,109,0.08)" : "rgba(0,255,157,0.08)", border: `1px solid ${endpoints.length === 0 ? "rgba(255,42,109,0.2)" : "rgba(0,255,157,0.2)"}`, color: endpoints.length === 0 ? "#ff2a6d" : "#00ff9d", padding: "0.25rem 0.5rem", borderRadius: 2, fontFamily: "Share Tech Mono, monospace", fontSize: "0.65rem", cursor: endpoints.length === 0 ? "not-allowed" : "pointer", opacity: endpoints.length === 0 ? 0.5 : 1 }}>
            SCAN ALL ({endpoints.length})
          </button>
          <button onClick={toggleLan} style={{ background: lanOpen ? "rgba(0,229,255,0.12)" : "rgba(0,0,0,0.3)", border: `1px solid ${lanOpen ? "rgba(0,229,255,0.4)" : "rgba(0,229,255,0.15)"}`, color: lanOpen ? "#00e5ff" : "var(--iron-dim)", padding: "0.25rem 0.5rem", borderRadius: 2, fontFamily: "Share Tech Mono, monospace", fontSize: "0.65rem", cursor: "pointer" }}>
            NEW HOSTS
          </button>
          <button onClick={() => setAuto(a => !a)} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,229,255,0.15)", color: auto ? "#00ff9d" : "var(--iron-dim)", padding: "0.25rem 0.5rem", borderRadius: 2, fontFamily: "Share Tech Mono, monospace", fontSize: "0.65rem", cursor: "pointer" }}>
            AUTO {auto ? "ON" : "OFF"}
          </button>
        </div>

        {/* NEW HOSTS lane */}
        {lanOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0.3rem 0.4rem", background: "rgba(255,174,0,0.04)", border: "1px solid rgba(255,174,0,0.12)", borderRadius: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#ffae00", fontFamily: "Share Tech Mono, monospace", fontSize: "0.65rem", letterSpacing: "0.1em" }}>NEW HOSTS ON LAN</span>
              <button onClick={refreshLan} style={{ background: "transparent", border: "none", color: "#00e5ff", fontSize: "0.6rem", cursor: "pointer", fontFamily: "Share Tech Mono, monospace" }}>RESCAN</button>
            </div>
            {lanHosts === null ? (
              <div style={{ color: "var(--iron-dim)", fontSize: "0.6rem" }}>Sweeping subnet...</div>
            ) : lanHosts.length === 0 ? (
              <div style={{ color: "var(--iron-dim)", fontSize: "0.6rem" }}>No new hosts found</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", maxHeight: 150, overflow: "auto" }}>
                {lanHosts.map((h, i) => {
                  const tracked = endpoints.some(e => e.ip === h.ip);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.2rem 0.3rem", background: "rgba(0,229,255,0.03)", borderRadius: 2, fontSize: "0.6rem" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: h.reachable ? "#00ff9d" : "#4a6070", flexShrink: 0 }} />
                      <span style={{ color: h.reachable ? "#00ff9d" : "var(--iron-dim)", fontFamily: "Share Tech Mono, monospace" }}>{h.hostname || h.ip}</span>
                      <span style={{ color: "var(--iron-dim)" }}>{h.ip}{h.mac ? ` · ${h.mac}` : ""}{h.latency_ms != null ? ` · ${h.latency_ms}ms` : ""}</span>
                      {!tracked && (
                        <button onClick={() => addFromLan(h)} style={{ marginLeft: "auto", background: "rgba(0,255,157,0.08)", border: "1px solid rgba(0,255,157,0.25)", color: "#00ff9d", padding: "0.1rem 0.35rem", borderRadius: 2, fontFamily: "Share Tech Mono, monospace", fontSize: "0.6rem", cursor: "pointer" }}>
                          MONITOR
                        </button>
                      )}
                      {tracked && <span style={{ marginLeft: "auto", color: "#4a6070" }}>TRACKED</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Endpoint cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", overflow: "auto", flex: 1 }}>
          {endpoints.length === 0 && (
            <div style={{ color: "var(--iron-dim)", fontSize: "0.6rem", textAlign: "center", padding: "0.8rem" }}>
              No monitored endpoints. Add an IP above or promote a host from NEW HOSTS.
            </div>
          )}
          {endpoints.map((r) => {
            const online = r.online;
            const color = r.role === "orchestrator" ? "#00e5ff" : r.role === "worker" ? "#ffae00" : "#00ff9d";
            const temp = r.thermal?.temp_c != null ? r.thermal.temp_c : null;
            const tempColor = temp != null ? (temp >= 70 ? "#ff2a6d" : temp >= 55 ? "#ffae00" : "#00e5ff") : "#00e5ff";
            const throttledNow = r.thermal?.flags?.includes("throttling now") || r.thermal?.flags?.includes("under-voltage");
            return (
              <div key={r.ip} style={{ padding: "0.35rem 0.45rem", background: online ? "rgba(0,255,157,0.04)" : "rgba(255,42,109,0.04)", borderRadius: 2, border: `1px solid ${online ? `rgba(0,255,157,0.14)` : "rgba(255,42,109,0.14)"}`, borderLeft: `3px solid ${online ? color : "#ff2a6d"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.15rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: online ? color : "#ff2a6d", boxShadow: online ? `0 0 4px ${color}` : "0 0 4px #ff2a6d", flexShrink: 0 }} />
                    <span style={{ color: online ? color : "#ff2a6d", fontFamily: "Share Tech Mono, monospace", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.hostname || r.label || r.ip}</span>
                    <span style={{ color: "var(--iron-dim)", fontSize: "0.6rem" }}>{r.ip}{r.role !== "custom" ? ` · ${r.role.toUpperCase()}` : ""}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexShrink: 0 }}>
                    <button onClick={() => scanEndpoint(r.ip)} disabled={scanning[r.ip]} style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.25)", color: "#00e5ff", padding: "0.1rem 0.35rem", borderRadius: 2, fontFamily: "Share Tech Mono, monospace", fontSize: "0.6rem", cursor: "pointer" }}>
                      {scanning[r.ip] ? "..." : "SCAN"}
                    </button>
                    <button onClick={() => removeServer(r.ip)} style={{ background: "transparent", border: "none", color: "var(--iron-dim)", cursor: "pointer", fontSize: "0.6rem", padding: "0.1rem 0.2rem" }}
                      onMouseEnter={e => e.currentTarget.style.color = "#ff2a6d"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--iron-dim)"}>
                      ×
                    </button>
                  </div>
                </div>

                {/* Metrics row */}
                <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.6rem", color: "var(--iron-dim)", flexWrap: "wrap" }}>
                  <span>CPU: <b style={{ color: (r.cpu ?? 0) > 80 ? "#ff2a6d" : "#00e5ff" }}>{online ? `${(r.cpu ?? 0).toFixed(1)}%` : "—"}</b></span>
                  <span>MEM: <b style={{ color: (r.memory ?? 0) > 85 ? "#ff2a6d" : "#00ff9d" }}>{online ? `${(r.memory ?? 0).toFixed(1)}%` : "—"}</b></span>
                  <span>DISK: <b style={{ color: (r.disk ?? 0) > 85 ? "#ff2a6d" : "#00e5ff" }}>{online ? `${(r.disk ?? 0).toFixed(0)}%` : "—"}</b></span>
                  {online && temp != null && (
                    <span>TEMP: <b style={{ color: tempColor }}>{temp}°C</b></span>
                  )}
                  {online && throttledNow && (
                    <span style={{ color: "#ffae00" }}>THROTTLED</span>
                  )}
                  <span>{r.latency_ms != null ? `LAT ${r.latency_ms}ms` : ""}</span>
                  <span>{online ? `PORTS ${r.ports_count} · SVCS ${r.services_count} · UP ${fmtUptime(r.uptime_seconds)}` : "OFFLINE"}</span>
                  {r.error && <span style={{ color: "#ff2a6d" }}>ERR: {r.error.substring(0, 28)}</span>}
                </div>

                {/* CPU history sparkline */}
                {online && r.ip && !history[r.ip] ? (
                  <button onClick={() => loadHistory(r.ip)} style={{ marginTop: "0.15rem", background: "none", border: "none", color: "#00e5ff", fontSize: "0.55rem", cursor: "pointer", padding: 0, fontFamily: "Share Tech Mono, monospace" }}>LOAD CPU HISTORY</button>
                ) : online ? (
                  <div style={{ marginTop: "0.15rem" }}>
                    <Spark values={history[r.ip]} />
                  </div>
                ) : null}

                {/* Inline listening ports */}
                {online && r.ports?.length > 0 && (
                  <div style={{ display: "flex", gap: "0.2rem", flexWrap: "wrap", marginTop: "0.15rem" }}>
                    {r.ports.slice(0, 16).map((p, j) => (
                      <span key={j} style={{ fontSize: "0.52rem", fontFamily: "Share Tech Mono, monospace", padding: "0.05rem 0.25rem", borderRadius: 2, background: p.protocol === "tcp" ? "rgba(0,229,255,0.07)" : "rgba(255,174,0,0.07)", border: "1px solid rgba(0,229,255,0.12)", color: p.protocol === "tcp" ? "#00e5ff" : "#ffae00" }}>
                        {p.protocol.toUpperCase()}:{p.port}
                      </span>
                    ))}
                    {r.ports.length > 16 && <span style={{ fontSize: "0.52rem", color: "var(--iron-dim)" }}>+{r.ports.length - 16}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}