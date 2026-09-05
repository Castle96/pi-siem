import { useEffect, useState } from "react";
import CyberCard from "../components/CyberCard";

const CLUSTER_NODES = [
  { hostname: "jarvis", role: "orchestrator", tailscale_ip: "100.77.187.108", lan_ip: "192.168.6.237" },
  { hostname: "ray", role: "worker", tailscale_ip: "100.87.90.103", lan_ip: "192.168.6.238" },
  { hostname: "fleet", role: "worker", tailscale_ip: "100.120.75.92", lan_ip: "192.168.6.236" },
];

const NODE_COLORS = {
  orchestrator: "#00e5ff",
  worker: "#ffae00",
};

export default function ClusterView() {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    fetch("/api/cluster/nodes")
      .then(r => r.json())
      .then(d => { setNodes(d.nodes || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="loading-spinner"><span className="spinner" /> Scanning cluster...</div>;
  if (error) return <div className="error-state">Error: {error}</div>;

  const onlineCount = nodes.filter(n => n.online).length;
  const totalCount = nodes.length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem", height: "100%", overflow: "auto" }}>
      {/* Cluster Overview */}
      <CyberCard title="CLUSTER OVERVIEW">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", height: "100%", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0.5rem", background: "rgba(0,229,255,0.05)", borderRadius: 3 }}>
            <span style={{ color: "var(--iron-dim)", fontSize: "0.65rem" }}>TOTAL NODES</span>
            <span style={{ color: "#00e5ff", textShadow: "0 0 6px rgba(0,229,255,0.5)", fontSize: "1rem", fontFamily: "Share Tech Mono, monospace" }}>{totalCount}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0.5rem", background: "rgba(0,255,157,0.03)", borderRadius: 3 }}>
            <span style={{ color: "var(--iron-dim)", fontSize: "0.65rem" }}>ONLINE</span>
            <span style={{ color: "#00ff9d", textShadow: "0 0 8px rgba(0,255,157,0.7)", fontSize: "1rem", fontFamily: "Share Tech Mono, monospace" }}>{onlineCount}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0.5rem", background: "rgba(255,42,109,0.03)", borderRadius: 3 }}>
            <span style={{ color: "var(--iron-dim)", fontSize: "0.65rem" }}>OFFLINE</span>
            <span style={{ color: "#ff2a6d", textShadow: "0 0 6px rgba(255,42,109,0.5)", fontSize: "1rem", fontFamily: "Share Tech Mono, monospace" }}>{totalCount - onlineCount}</span>
          </div>

          <div style={{ marginTop: "0.3rem", padding: "0.4rem", background: "rgba(255,174,0,0.05)", borderRadius: 3, border: "1px solid rgba(255,174,0,0.1)" }}>
            <div style={{ color: "#ffae00", fontSize: "0.65rem", marginBottom: "0.2rem", textShadow: "0 0 4px rgba(255,174,0,0.5)" }}>UPTIME BY NODE</div>
            {nodes.map(n => (
              <div key={n.hostname} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6rem", padding: "0.15rem 0", color: "var(--iron-dim)" }}>
                <span style={{ color: NODE_COLORS[n.role] || "#4a6070" }}>{n.hostname}</span>
                <span style={{ color: n.online ? "#00ff9d" : "#ff2a6d" }}>{n.online ? "UP" : "DOWN"}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "auto", paddingTop: "0.3rem", borderTop: "1px solid rgba(0,229,255,0.1)", fontSize: "0.6rem", color: "var(--iron-dim)" }}>
            Last scanned: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </CyberCard>

      {/* Node Details - Click to select */}
      <CyberCard title="NODE DETAILS" pulse={selectedNode !== null}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", height: "100%", overflow: "auto" }}>
          {nodes.map(n => (
            <div
              key={n.hostname}
              onClick={() => setSelectedNode(n.hostname)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.35rem 0.45rem",
                background: selectedNode === n.hostname
                  ? "rgba(0,229,255,0.1)"
                  : "rgba(0,229,255,0.02)",
                borderRadius: 3,
                border: `1px solid ${selectedNode === n.hostname ? "rgba(0,229,255,0.3)" : "rgba(0,229,255,0.05)"}`,
                cursor: "pointer",
                transition: "all 0.2s ease",
                borderLeft: `3px solid ${NODE_COLORS[n.role] || "#4a6070"}`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(0,229,255,0.06)";
                e.currentTarget.style.transform = "translateX(2px)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = selectedNode === n.hostname ? "rgba(0,229,255,0.1)" : "rgba(0,229,255,0.02)";
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: n.online ? NODE_COLORS[n.role] : "#4a6070", boxShadow: n.online ? `0 0 6px ${NODE_COLORS[n.role]}` : "none", flexShrink: 0 }} />
                <span style={{ color: NODE_COLORS[n.role] || "#4a6070", fontFamily: "Share Tech Mono, monospace", fontSize: "0.75rem" }}>{n.hostname}</span>
                <span style={{ color: "var(--iron-dim)", fontSize: "0.55rem" }}>({n.role})</span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span style={{ color: n.online ? "#00ff9d" : "#ff2a6d", textShadow: n.online ? "0 0 4px rgba(0,255,157,0.5)" : "0 0 4px rgba(255,42,109,0.5)", fontSize: "0.65rem" }}>
                  {n.online ? "ONLINE" : "OFFLINE"}
                </span>
                {n.lan_ip && (
                  <span style={{ color: "var(--iron-dim)", fontSize: "0.55rem", fontFamily: "Share Tech Mono, monospace" }}>
                    {n.lan_ip}
                  </span>
                )}
                {n.tailscale_ip && (
                  <span style={{ color: "var(--iron-dim)", fontSize: "0.55rem" }}>
                    TS:{n.tailscale_ip.split(".").slice(-2).join(".")}
                  </span>
                )}
              </div>
            </div>
          ))}

          {selectedNode && (
            <div style={{ marginTop: "0.3rem", padding: "0.4rem", background: "rgba(0,229,255,0.05)", borderRadius: 3, border: "1px solid rgba(0,229,255,0.15)" }}>
              <div style={{ color: "#00e5ff", fontSize: "0.7rem", marginBottom: "0.25rem", textShadow: "0 0 4px rgba(0,229,255,0.5)" }}>
                DETAIL: {selectedNode}
              </div>
              {nodes.find(n => n.hostname === selectedNode) && (n => (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.6rem", color: "var(--iron-dim)" }}>
                  {n.disk_usage?.length > 0 && (
                    <>
                      <div>DISK: {n.disk_usage[0]?.percent || 0}% used</div>
                    </>
                  )}
                  {n.memory_percent != null && (
                    <div>MEM: {n.memory_percent.toFixed(1)}%</div>
                  )}
                  {n.cpu_percent != null && (
                    <div>CPU: {n.cpu_percent.toFixed(1)}%</div>
                  )}
                  {n.services_count > 0 && (
                    <div>SVCS: {n.services_count} active</div>
                  )}
                  {n.listening_ports_count > 0 && (
                    <div>PORTS: {n.listening_ports_count} listening</div>
                  )}
                  <div>LAST CHECK: {n.last_checked?.substring(11, 19) || "unknown"} UTC</div>
                </div>
              ))(nodes.find(n => n.hostname === selectedNode))}
            </div>
          )}
        </div>
      </CyberCard>

      {/* Quick Scan Panel */}
      <CyberCard title="QUICK SCAN">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", height: "100%", overflow: "auto" }}>
          <div style={{ color: "var(--iron-dim)", fontSize: "0.65rem", marginBottom: "0.2rem" }}>NODE STATUS MATRIX</div>

          {/* Status grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {["jarvis", "ray", "fleet"].map(host => {
              const n = nodes.find(x => x.hostname === host);
              const online = n?.online ?? false;
              const color = NODE_COLORS[n?.role] || "#4a6070";
              return (
                <div key={host} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.25rem 0.35rem", background: online ? "rgba(0,255,157,0.03)" : "rgba(255,42,109,0.03)", borderRadius: 2, borderLeft: `2px solid ${online ? "#00ff9d" : "#ff2a6d"}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: online ? color : "#4a6070", boxShadow: online ? `0 0 4px ${color}` : "none" }} />
                    <span style={{ color: color, fontFamily: "Share Tech Mono, monospace", fontSize: "0.7rem" }}>{host}</span>
                  </div>
                  <span style={{ color: online ? "#00ff9d" : "#ff2a6d", fontSize: "0.6rem" }}>{online ? "UP" : "DOWN"}</span>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: "auto", padding: "0.3rem", background: "rgba(255,174,0,0.05)", borderRadius: 3 }}>
            <div style={{ color: "#ffae00", fontSize: "0.6rem", textAlign: "center", marginBottom: "0.15rem" }}>CLUSTER HEALTH</div>
            <div style={{ display: "flex", justifyContent: "center", gap: "0.3rem" }}>
              {Array.from({ length: 5 }, (_, i) => {
                const pct = (onlineCount / totalCount) * 100;
                const filled = i < Math.ceil(pct / 20);
                return (
                  <div key={i} style={{ width: 16, height: 8, background: filled ? "#00ff9d" : "rgba(0,255,157,0.15)", borderRadius: 1, boxShadow: filled ? "0 0 4px rgba(0,255,157,0.5)" : "none" }} />
                );
              })}
            </div>
            <div style={{ textAlign: "center", color: "#00ff9d", fontSize: "0.65rem", marginTop: "0.15rem" }}>
              {Math.round((onlineCount / totalCount) * 100)}% HEALTHY
            </div>
          </div>
        </div>
      </CyberCard>
    </div>
  );
}
