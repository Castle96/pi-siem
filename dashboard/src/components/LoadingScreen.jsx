export default function LoadingScreen({ label = "LOADING", color = "#00e5ff" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "1rem" }}>
      <div style={{ width: 48, height: 48, border: `2px solid ${color}33`, borderTopColor: color, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: "var(--iron-dim)", fontFamily: "Share Tech Mono, monospace", fontSize: "0.85rem", letterSpacing: "0.1em" }}>{label}</div>
    </div>
  );
}