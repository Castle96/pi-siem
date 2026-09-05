import { useEffect, useState } from "react";
import CyberCard from "../components/CyberCard";

export default function SystemMonitor() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/system")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="loading-spinner"><span className="spinner" /> Loading system data...</div>;
  if (error) return <div className="error-state">Error: {error}</div>;
  if (!data) return null;

  const fmtBytes = (b) => {
    if (!b) return "—";
    const gb = b / 1024**3;
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = b / 1024**2;
    return `${mb.toFixed(0)} MB`;
  };

  const fmtUptime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return `${h}h ${m}m ${sec}s`;
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", height: "100%", overflow: "auto" }}>
      {/* CPU Panel */}
      <CyberCard title="CPU STATUS">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", height: "100%", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--iron-dim)", fontSize: "0.7rem" }}>UTILIZATION</span>
            <span style={{ color: data.cpu?.percent > 80 ? "#ff2a6d" : "#00e5ff", textShadow: `0 0 8px ${data.cpu?.percent > 80 ? "#ff2a6d" : "#00e5ff"}`, fontSize: "1.2rem", fontFamily: "Share Tech Mono, monospace" }}>
              {data.cpu?.percent?.toFixed(1) || "—"}%
            </span>
          </div>
          <div style={{ height: 8, background: "rgba(0,229,255,0.1)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(data.cpu?.percent || 0, 100)}%`, background: `linear-gradient(90deg, #00e5ff, #00ff9d)`, boxShadow: "0 0 10px rgba(0,229,255,0.5)", transition: "width 0.5s ease" }} />
          </div>
          {data.cpu?.per_cpu?.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.3rem", marginTop: "0.3rem" }}>
              {data.cpu.per_cpu.map((p, i) => (
                <div key={i} style={{ textAlign: "center", fontSize: "0.6rem" }}>
                  <span style={{ color: "var(--iron-dim)" }}>CORE {i}</span>
                  <div style={{ height: 4, background: "rgba(0,229,255,0.1)", borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
                    <div style={{ height: "100%", width: `${p}%`, background: p > 80 ? "#ff2a6d" : "#00e5ff", transition: "width 0.3s ease" }} />
                  </div>
                  <span style={{ color: p > 80 ? "#ff2a6d" : "var(--iron-cyan)", fontSize: "0.55rem" }}>{p.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: "auto", paddingTop: "0.3rem", borderTop: "1px solid rgba(0,229,255,0.1)", fontSize: "0.6rem", color: "var(--iron-dim)" }}>
            <div>CORES: {data.cpu?.count || "—"}</div>
            <div>FREQ: {data.cpu?.frequency ? `${data.cpu.frequency} MHz` : "—"}</div>
            <div>LOAD: {data.loadavg?.["1min"]?.toFixed(2) || "—"} / {data.loadavg?.["5min"]?.toFixed(2) || "—"} / {data.loadavg?.["15min"]?.toFixed(2) || "—"}</div>
          </div>
        </div>
      </CyberCard>

      {/* Memory Panel */}
      <CyberCard title="MEMORY STATUS">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", height: "100%", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--iron-dim)", fontSize: "0.7rem" }}>RAM USAGE</span>
            <span style={{ color: data.memory?.percent > 85 ? "#ff2a6d" : "#00e5ff", textShadow: `0 0 8px ${data.memory?.percent > 85 ? "#ff2a6d" : "#00e5ff"}`, fontSize: "1.2rem", fontFamily: "Share Tech Mono, monospace" }}>
              {data.memory?.percent?.toFixed(1) || "—"}%
            </span>
          </div>
          <div style={{ height: 8, background: "rgba(0,229,255,0.1)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(data.memory?.percent || 0, 100)}%`, background: `linear-gradient(90deg, #00e5ff, #00ff9d)`, boxShadow: "0 0 10px rgba(0,229,255,0.5)", transition: "width 0.5s ease" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem", fontSize: "0.65rem" }}>
            <div style={{ color: "var(--iron-dim)" }}>TOTAL: {fmtBytes(data.memory?.total)}</div>
            <div style={{ color: "#00ff9d" }}>FREE: {fmtBytes(data.memory?.free)}</div>
            <div style={{ color: "var(--iron-dim)" }}>USED: {fmtBytes(data.memory?.used)}</div>
            <div style={{ color: "var(--iron-cyan)" }}>AVAIL: {fmtBytes(data.memory?.available)}</div>
          </div>
          {data.memory?.swap_total > 0 && (
            <div style={{ marginTop: "0.2rem", paddingTop: "0.2rem", borderTop: "1px solid rgba(0,229,255,0.1)", fontSize: "0.6rem", color: "var(--iron-dim)" }}>
              <div>SWAP TOTAL: {fmtBytes(data.memory?.swap_total)}</div>
              <div style={{ color: data.memory?.swap_percent > 50 ? "#ff2a6d" : "var(--iron-cyan)" }}>SWAP USED: {fmtBytes(data.memory?.swap_used)} ({data.memory?.swap_percent?.toFixed(1) || 0}%)</div>
            </div>
          )}
        </div>
      </CyberCard>

      {/* Disk Panel */}
      <CyberCard title="DISK STATUS">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", height: "100%", overflow: "auto" }}>
          {data.disks?.length > 0 ? (
            data.disks.map((d, i) => (
              <div key={i} style={{ padding: "0.3rem", background: "rgba(0,229,255,0.03)", borderRadius: 3, border: "1px solid rgba(0,229,255,0.1)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", marginBottom: 2 }}>
                  <span style={{ color: "var(--iron-dim)" }}>{d.mountpoint}</span>
                  <span style={{ color: d.percent > 85 ? "#ff2a6d" : d.percent > 70 ? "#ffae00" : "#00e5ff", textShadow: `0 0 4px ${d.percent > 85 ? "#ff2a6d" : "#00e5ff"}` }}>{d.percent}%</span>
                </div>
                <div style={{ height: 6, background: "rgba(0,229,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(d.percent, 100)}%`, background: d.percent > 85 ? "#ff2a6d" : d.percent > 70 ? "#ffae00" : "#00e5ff", transition: "width 0.5s ease" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.55rem", color: "var(--iron-dim)", marginTop: 2 }}>
                  <span>{fmtBytes(d.used)} / {fmtBytes(d.total)}</span>
                  <span>{fmtBytes(d.free)} free</span>
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: "var(--iron-dim)", fontSize: "0.7rem", padding: "0.5rem" }}>No disks found</div>
          )}
        </div>
      </CyberCard>

      {/* Network Panel */}
      <CyberCard title="NETWORK STATS">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", height: "100%", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem" }}>
            <span style={{ color: "var(--iron-dim)" }}>SENT</span>
            <span style={{ color: "#00e5ff" }}>{fmtBytes(data.network?.bytes_sent || 0)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem" }}>
            <span style={{ color: "var(--iron-dim)" }}>RECV</span>
            <span style={{ color: "#00ff9d" }}>{fmtBytes(data.network?.bytes_recv || 0)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem" }}>
            <span style={{ color: "var(--iron-dim)" }}>PACKETS SENT</span>
            <span style={{ color: "#00e5ff" }}>{data.network?.packets_sent || 0}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem" }}>
            <span style={{ color: "var(--iron-dim)" }}>PACKETS RECV</span>
            <span style={{ color: "#00ff9d" }}>{data.network?.packets_recv || 0}</span>
          </div>
          {data.network?.interfaces && Object.keys(data.network.interfaces).length > 0 && (
            <div style={{ marginTop: "0.2rem", paddingTop: "0.2rem", borderTop: "1px solid rgba(0,229,255,0.1)", fontSize: "0.6rem" }}>
              {Object.entries(data.network.interfaces).slice(0, 3).map(([iface, stats]) => (
                <div key={iface} style={{ display: "flex", justifyContent: "space-between", color: "var(--iron-dim)" }}>
                  <span>{iface}</span>
                  <span style={{ color: "#00e5ff" }}>{fmtBytes(stats.bytes_sent)} ↑ / {fmtBytes(stats.bytes_recv)} ↓</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CyberCard>

      {/* Processes Panel */}
      <CyberCard title="TOP PROCESSES">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", height: "100%", overflow: "auto" }}>
          {data.processes?.length > 0 ? (
            data.processes.map((p, i) => (
              <div key={p.pid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.25rem 0.35rem", background: "rgba(0,229,255,0.02)", borderRadius: 2, border: "1px solid rgba(0,229,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ color: "var(--iron-dim)", fontSize: "0.55rem", minWidth: 18 }}>{i + 1}</span>
                  <span style={{ color: "#00e5ff", fontSize: "0.7rem", textOverflow: "ellipsis", overflow: "hidden", maxWidth: 120, whiteSpace: "nowrap" }}>{p.name}</span>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.6rem" }}>
                  <span style={{ color: p.cpu > 50 ? "#ff2a6d" : "var(--iron-cyan)" }}>{p.cpu.toFixed(1)}%</span>
                  <span style={{ color: "var(--iron-dim)" }}>{p.memory_mb.toFixed(0)}MB</span>
                  <span style={{ color: p.status === "running" ? "#00ff9d" : "var(--iron-dim)", fontSize: "0.55rem" }}>{p.status}</span>
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: "var(--iron-dim)", fontSize: "0.7rem" }}>No processes</div>
          )}
        </div>
      </CyberCard>

      {/* Quick Stats */}
      <CyberCard title="SYSTEM SNAPSHOT">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.7rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--iron-dim)" }}>UPTIME</span>
            <span style={{ color: "#00e5ff" }}>{fmtUptime(data.uptime_seconds || 0)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--iron-dim)" }}>TIMESTAMP</span>
            <span style={{ color: "#00ff9d", fontSize: "0.6rem" }}>{data.timestamp?.replace("T", " ").substring(0, 19) || "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--iron-dim)" }}>LOAD 1MIN</span>
            <span style={{ color: data.loadavg?.["1min"] > 4 ? "#ff2a6d" : "#00e5ff" }}>{data.loadavg?.["1min"]?.toFixed(2) || "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--iron-dim)" }}>LOAD 5MIN</span>
            <span style={{ color: data.loadavg?.["5min"] > 4 ? "#ff2a6d" : "#00e5ff" }}>{data.loadavg?.["5min"]?.toFixed(2) || "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--iron-dim)" }}>LOAD 15MIN</span>
            <span style={{ color: data.loadavg?.["15min"] > 4 ? "#ff2a6d" : "#00e5ff" }}>{data.loadavg?.["15min"]?.toFixed(2) || "—"}</span>
          </div>
        </div>
      </CyberCard>
    </div>
  );
}
