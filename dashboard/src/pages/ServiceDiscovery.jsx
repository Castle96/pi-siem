import { useEffect, useState } from "react";
import CyberCard from "../components/CyberCard";

export default function ServiceDiscovery() {
  const [services, setServices] = useState(null);
  const [ports, setPorts] = useState(null);
  const [inactive, setInactive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/services").then(r => r.json()),
      fetch("/api/ports").then(r => r.json()),
      fetch("/api/inactive-services").then(r => r.json()),
    ]).then(([svc, prt, inactiveData]) => {
      setServices(svc);
      setPorts(prt);
      setInactive(inactiveData);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="loading-spinner"><span className="spinner" /> Discovering services...</div>;
  if (error) return <div className="error-state">Error: {error}</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem", height: "100%", overflow: "auto" }}>
      {/* Active Services */}
      <CyberCard title="ACTIVE SERVICES">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", height: "100%", overflow: "auto" }}>
          {services?.services?.length > 0 ? (
            services.services.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.3rem 0.4rem", background: "rgba(0,255,157,0.03)", borderRadius: 2, borderLeft: "2px solid #00ff9d", fontSize: "0.65rem" }}>
                <span style={{ color: "#00ff9d", textShadow: "0 0 4px rgba(0,255,157,0.5)", fontFamily: "Share Tech Mono, monospace" }}>●</span>
                <div style={{ flex: 1, marginLeft: "0.3rem" }}>
                  <div style={{ color: "#00ff9d", fontSize: "0.7rem" }}>{s.name}</div>
                  <div style={{ color: "var(--iron-dim)", fontSize: "0.55rem" }}>{s.description || s.sub_state || ""}</div>
                </div>
                <span style={{ color: "var(--iron-dim)", fontSize: "0.55rem", fontFamily: "Share Tech Mono, monospace" }}>{s.sub_state}</span>
              </div>
            ))
          ) : (
            <div style={{ color: "var(--iron-dim)", fontSize: "0.7rem", padding: "0.5rem", textAlign: "center" }}>No active services</div>
          )}
          <div style={{ marginTop: "auto", paddingTop: "0.3rem", borderTop: "1px solid rgba(0,229,255,0.1)", fontSize: "0.6rem", color: "var(--iron-dim)" }}>
            {services?.total || 0} total · {services?.active || 0} active · {services?.inactive || 0} inactive
          </div>
        </div>
      </CyberCard>

      {/* Listening Ports */}
      <CyberCard title="LISTENING PORTS">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", height: "100%", overflow: "auto" }}>
          {ports?.ports?.length > 0 ? (
            ports.ports.slice(0, 25).map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.2rem 0.3rem", background: "rgba(0,229,255,0.02)", borderRadius: 2, fontSize: "0.65rem" }}>
                <span style={{ color: p.protocol === "tcp" ? "#00e5ff" : "#ffae00", fontFamily: "Share Tech Mono, monospace", fontSize: "0.6rem" }}>{p.protocol.toUpperCase()}</span>
                <span style={{ color: "var(--iron-text)", fontFamily: "Share Tech Mono, monospace", fontSize: "0.7rem" }}>{p.local_addr}</span>
                <span style={{ color: "var(--iron-dim)", fontSize: "0.55rem", textAlign: "right", maxWidth: 80 }}>{p.process || `pid:${p.pid}` || "—"}</span>
              </div>
            ))
          ) : (
            <div style={{ color: "var(--iron-dim)", fontSize: "0.7rem", padding: "0.5rem", textAlign: "center" }}>No listening ports</div>
          )}
          {ports?.ports && ports.ports.length > 25 && (
            <div style={{ color: "var(--iron-dim)", fontSize: "0.6rem", textAlign: "center" }}>+{ports.ports.length - 25} more</div>
          )}
        </div>
      </CyberCard>

      {/* Status Summary */}
      <CyberCard title="DISCOVERY STATUS">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", height: "100%", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0.4rem", background: "rgba(0,229,255,0.05)", borderRadius: 3 }}>
            <span style={{ color: "var(--iron-dim)", fontSize: "0.65rem" }}>CRITICAL</span>
            <span style={{ color: "#ff2a6d", textShadow: "0 0 6px rgba(255,42,109,0.5)", fontSize: "0.8rem" }}>{services?.critical || 0}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0.4rem", background: "rgba(0,255,157,0.03)", borderRadius: 3 }}>
            <span style={{ color: "var(--iron-dim)", fontSize: "0.65rem" }}>RUNNING</span>
            <span style={{ color: "#00ff9d", textShadow: "0 0 6px rgba(0,255,157,0.5)", fontSize: "0.8rem" }}>{services?.active || 0}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0.4rem", background: "rgba(255,42,109,0.03)", borderRadius: 3 }}>
            <span style={{ color: "var(--iron-dim)", fontSize: "0.65rem" }}>INACTIVE</span>
            <span style={{ color: "#ffae00", textShadow: "0 0 6px rgba(255,174,0,0.5)", fontSize: "0.8rem" }}>{services?.inactive || 0}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0.4rem", background: "rgba(0,229,255,0.05)", borderRadius: 3 }}>
            <span style={{ color: "var(--iron-dim)", fontSize: "0.65rem" }}>TOTAL</span>
            <span style={{ color: "#00e5ff", textShadow: "0 0 6px rgba(0,229,255,0.5)", fontSize: "0.8rem" }}>{services?.total || 0}</span>
          </div>

          <div style={{ marginTop: "0.3rem", padding: "0.3rem", background: "rgba(255,42,109,0.05)", borderRadius: 3, border: "1px solid rgba(255,42,109,0.1)" }}>
            <div style={{ color: "#ff2a6d", fontSize: "0.7rem", marginBottom: "0.2rem", textShadow: "0 0 4px rgba(255,42,109,0.5)" }}>INACTIVE/FAMED SERVICES</div>
            {inactive?.services?.length > 0 ? (
              inactive.services.slice(0, 8).map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6rem", color: "var(--iron-dim)", padding: "0.15rem 0" }}>
                  <span>{s.name}</span>
                  <span style={{ color: s.active_state === "failed" ? "#ff2a6d" : "#ffae00" }}>{s.active_state}</span>
                </div>
              ))
            ) : (
              <div style={{ color: "#00ff9d", fontSize: "0.65rem" }}>All services healthy</div>
            )}
          </div>
        </div>
      </CyberCard>
    </div>
  );
}
