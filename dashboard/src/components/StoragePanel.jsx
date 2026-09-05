import { useEffect, useState } from "react";

export default function StoragePanel() {
  const [entries, setEntries] = useState([]);
  const [syncList, setSyncList] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/storage")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setEntries(data.storage || []);
        setSyncList(data.sync || []);
        setError(data.error || null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const item = entries[0];
  const total = item ? item.total : 0;
  const free = item ? item.free : 0;
  const used = item ? item.used : 0;
  const usePercent = item ? item.usePercent : 0;

  const fmt = (bytes) => {
    if (!bytes && bytes !== 0) return "—";
    const tb = bytes / 1024 ** 4;
    if (tb >= 1) return `${tb.toFixed(1)} TB`;
    const gb = bytes / 1024 ** 3;
    return `${gb.toFixed(0)} GB`;
  };

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
        CLUSTER STORAGE
      </div>

      {/* Drive icon */}
      <div
        style={{
          width: 48,
          height: 56,
          border: "2px solid var(--iron-cyan)",
          borderRadius: 4,
          margin: "0 auto 0.5rem",
          boxShadow: "0 0 12px rgba(0,229,255,0.4)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 8,
            right: 8,
            height: 6,
            background: "rgba(0,229,255,0.3)",
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "2px solid var(--iron-cyan)",
            boxShadow: "inset 0 0 8px rgba(0,229,255,0.5)",
          }}
        />
      </div>

      {/* Usage bar */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "var(--iron-dim)", fontSize: "0.7rem" }}>
              {item ? item.path : "/mnt/cluster"}
            </span>
            <span style={{ color: "#00e5ff", textShadow: "0 0 6px #00e5ff", fontSize: "0.7rem" }}>
              {usePercent.toFixed(1)}%
            </span>
          </div>
          <div
            style={{
              height: 8,
              background: "rgba(0,229,255,0.1)",
              border: "1px solid rgba(0,229,255,0.3)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(usePercent, 100)}%`,
                background: "linear-gradient(90deg, rgba(0,229,255,0.4), #00e5ff)",
                boxShadow: "0 0 10px rgba(0,229,255,0.6)",
                transition: "width 0.5s ease",
              }}
            />
          </div>
        </div>

        {/* Sync status */}
        {syncList.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.25rem" }}>
            <div style={{ color: "var(--iron-dim)", fontSize: "0.6rem", letterSpacing: "0.1em" }}>
              SYNC STATUS
            </div>
            {syncList.map((s) => {
              const host = s.host || "unknown";
              const ok = s.ok === true;
              const color = ok ? "#00ff9d" : "#ff2a6d";
              return (
                <div
                  key={host}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.6rem",
                    color,
                    textShadow: `0 0 4px ${color}`,
                  }}
                >
                  <span>{host}</span>
                  <span>{s.ts ? new Date(s.ts).toLocaleString() : "—"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: "auto",
          color: error ? "#ff2a6d" : "var(--iron-dim)",
          fontSize: "0.65rem",
          letterSpacing: "0.1em",
          textShadow: error ? "0 0 8px rgba(255,42,109,0.5)" : undefined,
        }}
      >
        {error ? `ERR: ${error}` : `${fmt(free)} AVAILABLE · ${fmt(total)} TOTAL`}
      </div>
    </div>
  );
}
