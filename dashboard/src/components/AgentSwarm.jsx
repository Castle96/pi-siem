import { useEffect, useRef, useState } from "react";

const STATE_COLORS = {
  pending: "#ffae00",
  running: "#00e5ff",
  success: "#00ff9d",
  failed: "#ff2a6d",
  blocked: "#ff4d4d",
  cancelled: "#4a6070",
};

export default function AgentSwarm({ agents = [] }) {
  const canvasRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);

  // Hit test helper
  const hitTest = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const mx = (clientX - rect.left) * dpr;
    const my = (clientY - rect.top) * dpr;

    const nodes = agents.map((a, i) => ({
      id: a.id,
      name: a.name,
      state: a.state,
      backend: a.backend,
      worktree: a.worktree,
      parent_id: a.parent_id,
      x: a.x ?? 0.1 + (i % 6) * 0.15,
      y: a.y ?? 0.1 + Math.floor(i / 6) * 0.2,
    }));

    for (const n of nodes) {
      const nx = n.x * canvas.clientWidth * dpr;
      const ny = n.y * canvas.clientHeight * dpr;
      const nr = (14 + (n.id % 5) * 2) * dpr;
      if (Math.hypot(mx - nx, my - ny) < nr + 6 * dpr) {
        return n.id;
      }
    }
    return null;
  }, [agents]);

  const handleClick = useCallback((e) => {
    const id = hitTest(e.clientX, e.clientY);
    setSelected(id);
  }, [hitTest]);

  const handleMouseMove = useCallback((e) => {
    const id = hitTest(e.clientX, e.clientY);
    setHovered(id);
  }, [hitTest]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;

    // Build adjacency and layout state
    const nodes = agents.map((a, i) => ({
      id: a.id,
      name: a.name,
      state: a.state,
      backend: a.backend,
      worktree: a.worktree,
      parent_id: a.parent_id,
      x: a.x ?? 0.1 + (i % 6) * 0.15,
      y: a.y ?? 0.1 + Math.floor(i / 6) * 0.2,
      vx: 0,
      vy: 0,
    }));

    const edges = [];
    for (const a of agents) {
      if (a.parent_id) {
        const parent = nodes.find((n) => n.id === a.parent_id);
        const child = nodes.find((n) => n.id === a.id);
        if (parent && child) edges.push({ source: parent, target: child });
      }
    }

    const draw = (t) => {
      const dpr = window.devicePixelRatio || 1;
      const w = (canvas.width = canvas.clientWidth * dpr);
      const h = (canvas.height = canvas.clientHeight * dpr);
      ctx.clearRect(0, 0, w, h);

      // grid
      ctx.strokeStyle = "rgba(0,229,255,0.05)";
      ctx.lineWidth = 1;
      const gridSize = 30 * dpr;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // edges
      for (const edge of edges) {
        ctx.beginPath();
        ctx.moveTo(edge.source.x * w, edge.source.y * h);
        ctx.lineTo(edge.target.x * w, edge.target.y * h);
        ctx.strokeStyle = "rgba(0,229,255,0.18)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // nodes
      for (const n of nodes) {
        const pulse =
          n.state === "running"
            ? Math.sin(t * 0.003 + n.id) * 0.5 + 0.5
            : 0;
        const x = n.x * w;
        const y = n.y * h;
        const r = (14 + (n.id % 5) * 2) * dpr * (1 + pulse * 0.25);
        const color = STATE_COLORS[n.state] || STATE_COLORS.pending;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12 + pulse * 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        // ring
        ctx.beginPath();
        ctx.arc(x, y, r + 4 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.35 + pulse * 0.3;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // label
        ctx.font = `${11 * dpr}px "JetBrains Mono", monospace`;
        ctx.fillStyle = "#e0f7fa";
        ctx.textAlign = "center";
        ctx.fillText(n.name, x, y + r + 16 * dpr);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [agents]);

  const selectedAgent = agents.find((a) => a.id === selected);

  return (
    <div style={{ position: "relative", height: "100%", minHeight: 320 }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        style={{ width: "100%", height: "100%", display: "block", cursor: hovered ? "pointer" : "crosshair" }}
      />
      {selectedAgent && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 220,
            background: "rgba(5,7,10,0.92)",
            border: "1px solid rgba(0,229,255,0.25)",
            padding: "0.75rem",
            fontSize: "0.75rem",
            lineHeight: 1.6,
            boxShadow: "0 0 18px rgba(0,229,255,0.25)",
          }}
        >
          <div
            style={{
              color: STATE_COLORS[selectedAgent.state] || "#ffae00",
              fontFamily: "Share Tech Mono, monospace",
              marginBottom: 4,
            }}
          >
            {selectedAgent.name.toUpperCase()}
          </div>
          <div>state: {selectedAgent.state}</div>
          <div>backend: {selectedAgent.backend || "—"}</div>
          <div>worktree: {selectedAgent.worktree || "—"}</div>
          <div>parent: {selectedAgent.parent_id ?? "—"}</div>
          <div>
            started:{" "}
            {selectedAgent.started_at
              ? new Date(selectedAgent.started_at).toLocaleTimeString()
              : "—"}
          </div>
          <div>
            finished:{" "}
            {selectedAgent.finished_at
              ? new Date(selectedAgent.finished_at).toLocaleTimeString()
              : "—"}
          </div>
          <button
            onClick={() => setSelected(null)}
            style={{
              marginTop: 6,
              background: "transparent",
              color: "var(--iron-cyan)",
              border: "1px solid rgba(0,229,255,0.4)",
              cursor: "pointer",
              fontFamily: "Share Tech Mono, monospace",
            }}
          >
            CLOSE
          </button>
        </div>
      )}
    </div>
  );
}
