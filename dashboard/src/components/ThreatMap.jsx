import { useEffect, useRef } from "react";

export default function ThreatMap({ events = [] }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let raf;

    const nodes = Array.from({ length: 24 }).map(() => ({
      x: Math.random(),
      y: Math.random(),
      r: 1.5 + Math.random() * 2.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.2,
      active: Math.random() < 0.18,
    }));

    const draw = (t) => {
      const dpr = window.devicePixelRatio || 1;
      const w = (canvas.width = canvas.clientWidth * dpr);
      const h = (canvas.height = canvas.clientHeight * dpr);
      ctx.clearRect(0, 0, w, h);

      // grid
      ctx.strokeStyle = "rgba(0,229,255,0.06)";
      ctx.lineWidth = 1;
      const gridSize = 40 * dpr;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // links
      ctx.strokeStyle = "rgba(0,229,255,0.12)";
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = (a.x - b.x) * w;
          const dy = (a.y - b.y) * h;
          if (Math.hypot(dx, dy) < 140 * dpr) {
            ctx.beginPath();
            ctx.moveTo(a.x * w, a.y * h);
            ctx.lineTo(b.x * w, b.y * h);
            ctx.stroke();
          }
        }
      }

      // nodes
      for (const n of nodes) {
        const pulse = Math.sin(t * 0.001 * n.speed + n.phase) * 0.5 + 0.5;
        const x = n.x * w;
        const y = n.y * h;
        const r = n.r * dpr * (1 + pulse * 0.4);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.active ? "#ff2a6d" : "rgba(0,229,255,0.85)";
        ctx.shadowColor = n.active ? "#ff2a6d" : "#00e5ff";
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;

        if (n.active) {
          ctx.beginPath();
          ctx.arc(x, y, r + 6 * dpr * pulse, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255,42,109,0.45)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
