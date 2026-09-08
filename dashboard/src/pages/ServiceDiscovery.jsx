import { useState, useEffect } from "react";
import LoadingScreen from "../components/LoadingScreen";

export default function ServiceDiscovery() {
  const [endpoints, setEndpoints] = useState([]);
  const [selected, setSelected] = useState("local");
  const [local, setLocal] = useState(null);
  const [remote, setRemote] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadLocal = () =>
    Promise.all([
      fetch("/api/services").then(r => r.json()),
      fetch("/api/ports").then(r => r.json()),
      fetch("/api/inactive-services").then(r => r.json()),
    ]).then(([svc, prt, inactiveData]) => setLocal({ services: svc, ports: prt, inactive: inactiveData }));

  useEffect(() => {
    Promise.all([
      loadLocal(),
      fetch("/api/endpoints").then(r => r.json()),
    ]).then(([, eps]) => {
      setEndpoints(eps.endpoints || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const pickHost = (ip) => {
    setSelected(ip);
    if (ip === "local") { loadLocal(); setRemote(null); return; }
    setRemote(null);
    fetch(`/api/endpoints/${encodeURIComponent(ip)}`)
      .then(r => r.json())
      .then(d => setRemote(d))
      .catch(() => {});
  };

  if (loading) {
    return <LoadingScreen label="DISCOVERING SERVICES" color="#00e5ff" />;
  }

  const isRemote = selected !== "local";
  const res = isRemote ? remote : local;
  const rOnline = isRemote ? res?.online : true;

  const services = isRemote
    ? (res?.services || [])
    : (local?.services?.services || []);
  const ports = isRemote
    ? (res?.ports || [])
    : (local?.ports?.ports || []);
  const total = isRemote ? services.length : (local?.services?.total || 0);
  const activeCount = isRemote
    ? services.filter(s => s.active_state === "active").length
    : (local?.services?.active || 0);
  const inactiveList = isRemote
    ? services.filter(s => s.active_state !== "active")
    : (local?.inactive?.services || []);

  const hostPills = [
    { ip: "local", label: "LOCAL HOST", color: "#00e5ff" },
    ...endpoints.map(e => ({
      ip: e.ip,
      label: e.hostname || e.label || e.ip,
      color: e.online ? (e.role === "orchestrator" ? "#00e5ff" : e.role === "worker" ? "#ffae00" : "#00ff9d") : "#ff2a6d",
    })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", height: "100%", overflow: "hidden" }}>
      {/* Host selector */}
      <div style={{ display: "flex", gap: "0.3rem", paddingBottom: "0.3rem", borderBottom: "1px solid rgba(0,229,255,0.12)", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "var(--iron-dim)", fontSize: "0.65rem", letterSpacing: "0.1em", marginRight: "0.2rem" }}>TARGET</span>
        {hostPills.map(h => (
          <button key={h.ip} onClick={() => pickHost(h.ip)}
            style={{
              padding: "0.25rem 0.55rem",
              borderRadius: 2,
              fontFamily: "Share Tech Mono, monospace",
              fontSize: "0.65rem",
              cursor: "pointer",
              background: selected === h.ip ? `${h.color}18` : "rgba(0,0,0,0.3)",
              border: `1px solid ${selected === h.ip ? h.color : "rgba(0,229,255,0.15)"}`,
              color: selected === h.ip ? h.color : "var(--iron-dim)",
              boxShadow: selected === h.ip ? `0 0 6px ${h.color}44` : "none",
            }}>
            {h.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", color: "var(--iron-dim)", fontSize: "0.6rem" }}>
          {isRemote ? (rOnline ? "LIVE VIA SWEEPER" : "OFFLINE") : "LOCAL /proc & SYSTEMD"}
        </span>
      </div>

      {isRemote && !res ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--iron-dim)", fontSize: "0.7rem" }}>Scanning endpoint...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem", flex: 1, overflow: "hidden" }}>
          {/* Active services */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "0.3rem", borderBottom: "1px solid rgba(0,255,157,0.12)" }}>
              <div style={{ color: "#00ff9d", fontFamily: "Share Tech Mono, monospace", fontSize: "0.8rem", letterSpacing: "0.1em", textShadow: "0 0 6px rgba(0,255,157,0.5)" }}>ACTIVE SERVICES</div>
              <div style={{ color: "var(--iron-dim)", fontSize: "0.65rem", fontFamily: "Share Tech Mono, monospace" }}>{activeCount} running</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", overflow: "auto", flex: 1 }}>
              {services.length > 0 ? (
                (isRemote ? services.filter(s => s.active_state === "active") : services).map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.25rem 0.4rem", background: "rgba(0,255,157,0.03)", borderRadius: 2, borderLeft: "2px solid #00ff9d", fontSize: "0.65rem" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ff9d", boxShadow: "0 0 4px rgba(0,255,157,0.5)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#00ff9d", fontFamily: "Share Tech Mono, monospace", fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name.replace(".service", "")}</div>
                      <div style={{ color: "var(--iron-dim)", fontSize: "0.55rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.description || s.sub_state || ""}</div>
                    </div>
                    <span style={{ color: "var(--iron-dim)", fontSize: "0.55rem", fontFamily: "Share Tech Mono, monospace", flexShrink: 0 }}>{s.sub_state}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--iron-dim)", fontSize: "0.7rem", textAlign: "center", padding: "0.5rem" }}>{rOnline ? "No active services" : "Host offline"}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.3rem", paddingTop: "0.2rem", borderTop: "1px solid rgba(0,229,255,0.1)" }}>
              <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.2rem 0.4rem", background: "rgba(0,229,255,0.04)", borderRadius: 2 }}>
                <span style={{ color: "var(--iron-dim)", fontSize: "0.6rem" }}>TOTAL</span>
                <span style={{ color: "#00e5ff", fontFamily: "Share Tech Mono, monospace", fontSize: "0.7rem" }}>{total}</span>
              </div>
              <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.2rem 0.4rem", background: "rgba(255,42,109,0.04)", borderRadius: 2 }}>
                <span style={{ color: "var(--iron-dim)", fontSize: "0.6rem" }}>DOWN</span>
                <span style={{ color: "#ff2a6d", fontFamily: "Share Tech Mono, monospace", fontSize: "0.7rem" }}>{inactiveList.length}</span>
              </div>
            </div>
          </div>

          {/* Listening ports */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "0.3rem", borderBottom: "1px solid rgba(0,229,255,0.12)" }}>
              <div style={{ color: "#00e5ff", fontFamily: "Share Tech Mono, monospace", fontSize: "0.8rem", letterSpacing: "0.1em", textShadow: "0 0 6px rgba(0,229,255,0.5)" }}>LISTENING PORTS</div>
              <div style={{ color: "var(--iron-dim)", fontSize: "0.65rem", fontFamily: "Share Tech Mono, monospace" }}>{ports.length} open</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", overflow: "auto", flex: 1 }}>
              {ports.length > 0 ? (
                ports.slice(0, 40).map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.2rem 0.35rem", background: "rgba(0,229,255,0.02)", borderRadius: 2, fontSize: "0.65rem" }}>
                    <span style={{ color: p.protocol === "tcp" ? "#00e5ff" : "#ffae00", fontFamily: "Share Tech Mono, monospace", fontSize: "0.6rem", width: 28, flexShrink: 0 }}>{p.protocol.toUpperCase()}</span>
                    <span style={{ color: "var(--iron-text)", fontFamily: "Share Tech Mono, monospace", fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.local_addr || `:${p.port}`}</span>
                    <span style={{ color: "var(--iron-dim)", fontSize: "0.55rem", flexShrink: 0 }}>{p.process || `pid:${p.pid}` || "—"}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--iron-dim)", fontSize: "0.7rem", textAlign: "center", padding: "0.5rem" }}>{rOnline ? "No listening ports" : "Host offline"}</div>
              )}
              {ports.length > 40 && (
                <div style={{ color: "var(--iron-dim)", fontSize: "0.6rem", textAlign: "center", padding: "0.3rem" }}>+{ports.length - 40} more</div>
              )}
            </div>
          </div>

          {/* Inactive/Failed services */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "0.3rem", borderBottom: "1px solid rgba(255,42,109,0.12)" }}>
              <div style={{ color: "#ff2a6d", fontFamily: "Share Tech Mono, monospace", fontSize: "0.8rem", letterSpacing: "0.1em", textShadow: "0 0 6px rgba(255,42,109,0.5)" }}>INACTIVE / FAILED</div>
              <div style={{ color: "var(--iron-dim)", fontSize: "0.65rem", fontFamily: "Share Tech Mono, monospace" }}>{inactiveList.length} issues</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", overflow: "auto", flex: 1 }}>
              {inactiveList.length > 0 ? (
                inactiveList.slice(0, 25).map((s, i) => {
                  const failed = s.active_state === "failed";
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.25rem 0.4rem", background: failed ? "rgba(255,42,109,0.06)" : "rgba(255,174,0,0.04)", borderRadius: 2, borderLeft: `2px solid ${failed ? "#ff2a6d" : "#ffae00"}`, fontSize: "0.65rem" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: failed ? "#ff2a6d" : "#ffae00", boxShadow: `0 0 4px ${failed ? "#ff2a6d" : "#ffae00"}`, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: failed ? "#ff2a6d" : "#ffae00", fontFamily: "Share Tech Mono, monospace", fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name.replace(".service", "")}</div>
                        <div style={{ color: "var(--iron-dim)", fontSize: "0.55rem" }}>{s.description || ""}</div>
                      </div>
                      <span style={{ color: failed ? "#ff2a6d" : "#ffae00", fontSize: "0.55rem", fontFamily: "Share Tech Mono, monospace", flexShrink: 0 }}>{s.active_state}</span>
                    </div>
                  );
                })
              ) : (
                <div style={{ color: "#00ff9d", fontSize: "0.7rem", textAlign: "center", padding: "0.5rem" }}>{rOnline ? "All services healthy" : "—"}</div>
              )}
              {inactiveList.length > 25 && (
                <div style={{ color: "var(--iron-dim)", fontSize: "0.6rem", textAlign: "center", padding: "0.3rem" }}>+{inactiveList.length - 25} more</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}