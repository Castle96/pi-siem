import { useState, useEffect } from "react";
import LoadingScreen from "../components/LoadingScreen";

const CLUSTER_NODES = [
  { hostname: "jarvis", role: "orchestrator", tailscale_ip: "100.77.187.108", lan_ip: "192.168.6.237" },
  { hostname: "ray", role: "worker", tailscale_ip: "100.87.90.103", lan_ip: "192.168.6.238" },
  { hostname: "fleet", role: "worker", tailscale_ip: "100.120.75.92", lan_ip: "192.168.6.236" },
];

const ROLE_COLORS = {
  orchestrator: "#00e5ff",
  worker: "#ffae00",
};

export default function ClusterView() {
  const [nodes, setNodes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/cluster/nodes")
      .then(r => r.json())
      .then(d => { setNodes(d.nodes || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) {
    return <LoadingScreen label="SCANNING CLUSTER NODES" color="#ffae00" />;
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "0.5rem" }}>
        <div style={{ color: "#ff2a6d", fontFamily: "Share Tech Mono, monospace", fontSize: "0.85rem" }}>CLUSTER SCAN FAILED</div>
        <div style={{ color: "var(--iron-dim)", fontSize: "0.7rem" }}>{error}</div>
      </div>
    );
  }

  const onlineCount = nodes?.filter(n => n.online).length || 0;
  const totalCount = nodes?.length || 0;
  const healthPct = totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 0;
  const lastScan = nodes?.reduce((latest, n) => {
    const t = n.last_checked;
    return t && (!latest || new Date(t) > new Date(latest)) ? t : latest;
  }, null);
  const fmtScan = (ts) =>
    ts ? new Date(ts).toISOString().replace("T", " ").substring(0, 19) + " UTC" : "NEVER";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", height: "100%", overflow: "hidden" }}>
      {/* Left: Node list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "0.3rem", borderBottom: "1px solid rgba(255,174,0,0.12)" }}>
          <div style={{ color: "#ffae00", fontFamily: "Share Tech Mono, monospace", fontSize: "0.8rem", letterSpacing: "0.1em", textShadow: "0 0 6px rgba(255,174,0,0.5)" }}>CLUSTER NODES</div>
          <div style={{ color: "var(--iron-dim)", fontSize: "0.65rem", fontFamily: "Share Tech Mono, monospace" }}>{totalCount} total</div>
        </div>

        {/* Health indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.4rem", background: healthPct >= 66 ? "rgba(0,255,157,0.04)" : healthPct >= 33 ? "rgba(255,174,0,0.06)" : "rgba(255,42,109,0.06)", borderRadius: 2, border: `1px solid ${healthPct >= 66 ? "rgba(0,255,157,0.2)" : healthPct >= 33 ? "rgba(255,174,0,0.2)" : "rgba(255,42,109,0.2)"}` }}>
          <div style={{ display: "flex", gap: "0.2rem" }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ width: 12, height: 6, borderRadius: 1, background: i <= Math.ceil(healthPct / 20) ? (healthPct >= 66 ? "#00ff9d" : healthPct >= 33 ? "#ffae00" : "#ff2a6d") : "rgba(0,0,0,0.3)", boxShadow: i <= Math.ceil(healthPct / 20) ? `0 0 3px ${healthPct >= 66 ? "#00ff9d" : healthPct >= 33 ? "#ffae00" : "#ff2a6d"}66` : "none" }} />
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ color: healthPct >= 66 ? "#00ff9d" : healthPct >= 33 ? "#ffae00" : "#ff2a6d", fontFamily: "Share Tech Mono, monospace", fontSize: "0.7rem", textShadow: `0 0 4px ${healthPct >= 66 ? "#00ff9d" : healthPct >= 33 ? "#ffae00" : "#ff2a6d"}` }}>
            {healthPct}% HEALTHY
          </div>
        </div>

        {/* Node cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", overflow: "auto", flex: 1 }}>
          {nodes?.map(n => {
            const online = n.online;
            const color = ROLE_COLORS[n.role] || "#4a6070";
            return (
              <div
                key={n.hostname}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.15rem",
                  padding: "0.35rem 0.45rem",
                  background: online ? "rgba(0,255,157,0.03)" : "rgba(255,42,109,0.04)",
                  borderRadius: 3,
                  border: `1px solid ${online ? "rgba(0,255,157,0.12)" : "rgba(255,42,109,0.12)"}`,
                  borderLeft: `3px solid ${color}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: online ? color : "#4a6070", boxShadow: online ? `0 0 4px ${color}` : "none", flexShrink: 0 }} />
                    <span style={{ color, fontFamily: "Share Tech Mono, monospace", fontSize: "0.75rem", fontWeight: "bold" }}>{n.hostname}</span>
                    <span style={{ color: "var(--iron-dim)", fontSize: "0.55rem" }}>({n.role})</span>
                  </div>
                  <span style={{ color: online ? "#00ff9d" : "#ff2a6d", fontSize: "0.6rem", fontFamily: "Share Tech Mono, monospace", textShadow: `0 0 4px ${online ? "#00ff9d" : "#ff2a6d"}`, padding: "0.05rem 0.3rem", borderRadius: 2, background: online ? "rgba(0,255,157,0.08)" : "rgba(255,42,109,0.08)" }}>
                    {online ? "ONLINE" : "OFFLINE"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", fontSize: "0.55rem", color: "var(--iron-dim)", flexWrap: "wrap", marginTop: "0.05rem" }}>
                  {n.lan_ip && <span>LAN: {n.lan_ip}</span>}
                  {n.tailscale_ip && <span>TS: {n.tailscale_ip}</span>}
                  {n.cpu_percent != null && <span>CPU: {n.cpu_percent.toFixed(1)}%</span>}
                  {n.memory_percent != null && <span>MEM: {n.memory_percent.toFixed(1)}%</span>}
                  {n.services_count != null && <span>SVCS: {n.services_count}</span>}
                  {n.listening_ports_count != null && <span>PORTS: {n.listening_ports_count}</span>}
                </div>
                {n.disk_usage?.length > 0 && (
                  <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.1rem" }}>
                    {n.disk_usage.map((d, j) => (
                      <div key={j} style={{ flex: 1, fontSize: "0.5rem", color: d.percent > 85 ? "#ff2a6d" : "var(--iron-dim)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
                          <span>{d.mountpoint || "/"}</span>
                          <span style={{ color: d.percent > 85 ? "#ff2a6d" : "#00e5ff" }}>{d.percent.toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 2, background: "rgba(0,229,255,0.08)", borderRadius: 1, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(d.percent, 100)}%`, background: d.percent > 85 ? "#ff2a6d" : "#00e5ff", transition: "width 0.3s ease" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {n.error && (
                  <div style={{ color: "#ff2a6d", fontSize: "0.5rem", marginTop: "0.1rem" }}>{n.error.substring(0, 40)}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Quick stats + topology info */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", overflow: "auto" }}>
        {/* Summary cards */}
        {[
          { label: "TOTAL NODES", value: totalCount, color: "#00e5ff" },
          { label: "ONLINE", value: onlineCount, color: "#00ff9d" },
          { label: "OFFLINE", value: totalCount - onlineCount, color: totalCount - onlineCount > 0 ? "#ff2a6d" : "#00ff9d" },
          { label: "WORKERS", value: nodes?.filter(n => n.role === "worker").length || 0, color: "#ffae00" },
          { label: "ORCHESTRATOR", value: nodes?.filter(n => n.role === "orchestrator").length || 0, color: "#00e5ff" },
        ].map(stat => (
          <div key={stat.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.35rem 0.5rem", background: "rgba(0,229,255,0.02)", borderRadius: 3, border: "1px solid rgba(0,229,255,0.08)" }}>
            <span style={{ color: "var(--iron-dim)", fontSize: "0.65rem" }}>{stat.label}</span>
            <span style={{ color: stat.color, fontFamily: "Share Tech Mono, monospace", fontSize: "0.9rem", textShadow: `0 0 6px ${stat.color}` }}>{stat.value}</span>
          </div>
        ))}

        {/* Role breakdown */}
        <div style={{ padding: "0.4rem", background: "rgba(255,174,0,0.04)", border: "1px solid rgba(255,174,0,0.12)", borderRadius: 3, marginTop: "0.2rem" }}>
          <div style={{ color: "#ffae00", fontSize: "0.65rem", marginBottom: "0.2rem", fontFamily: "Share Tech Mono, monospace" }}>NODE DETAILS</div>
          {nodes?.map(n => {
            const color = ROLE_COLORS[n.role] || "#4a6070";
            return (
              <div key={n.hostname} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.2rem 0", borderBottom: n.hostname !== (nodes?.[nodes.length - 1]?.hostname) ? "1px solid rgba(0,229,255,0.05)" : "none", fontSize: "0.6rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span style={{ color, fontFamily: "Share Tech Mono, monospace", fontSize: "0.65rem" }}>{n.hostname}</span>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", color: "var(--iron-dim)", fontSize: "0.55rem" }}>
                  {n.online ? <span style={{ color: "#00ff9d" }}>UP</span> : <span style={{ color: "#ff2a6d" }}>DN</span>}
                  {n.cpu_percent != null && <span>CPU {n.cpu_percent.toFixed(0)}%</span>}
                  {n.memory_percent != null && <span>MEM {n.memory_percent.toFixed(0)}%</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Role stats visualization */}
        <div style={{ padding: "0.4rem", background: "rgba(0,229,255,0.03)", border: "1px solid rgba(0,229,255,0.08)", borderRadius: 3 }}>
          <div style={{ color: "var(--iron-dim)", fontSize: "0.6rem", marginBottom: "0.2rem", fontFamily: "Share Tech Mono, monospace" }}>ROLE DISTRIBUTION</div>
          {nodes?.length > 0 && (
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "rgba(0,0,0,0.3)" }}>
              {[
                { role: "orchestrator", color: "#00e5ff", label: "ORC" },
                { role: "worker", color: "#ffae00", label: "WRK" },
              ].map(role => {
                const count = nodes?.filter(n => n.role === role.role).length || 0;
                const pct = nodes?.length > 0 ? (count / nodes.length) * 100 : 0;
                return (
                  <div key={role.role} style={{ width: `${pct}%`, background: role.color, boxShadow: `0 0 4px ${role.color}66`, minWidth: count > 0 ? "20px" : "0", position: "relative" }}>
                    {count > 0 && (
                      <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", color: "#fff", fontSize: "0.5rem", fontFamily: "Share Tech Mono, monospace", textShadow: `0 0 3px ${role.color}`, whiteSpace: "nowrap" }}>
                        {role.label}:{count}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {nodes?.length === 0 && (
            <div style={{ color: "var(--iron-dim)", fontSize: "0.6rem", textAlign: "center" }}>No nodes online</div>
          )}
        </div>

        {/* Scan status */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.25rem 0.4rem", background: "rgba(0,229,255,0.02)", borderRadius: 2, marginTop: "auto" }}>
          <div style={{ color: "var(--iron-dim)", fontSize: "0.55rem" }}>LAST SCAN</div>
          <div style={{ color: "#00e5ff", fontFamily: "Share Tech Mono, monospace", fontSize: "0.6rem" }}>
            {fmtScan(lastScan)}
          </div>
        </div>
      </div>
    </div>
  );
}
