import { useEffect, useRef, useState } from "react";

const STATE_COLORS = {
  pending: "#ffae00",
  running: "#00e5ff",
  success: "#00ff9d",
  failed: "#ff2a6d",
  blocked: "#ff4d4d",
  cancelled: "#4a6070",
};

export default function CircularHUD({ agents = [], metrics = [] }) {
  const canvasRef = useRef(null);
  const [activeCount, setActiveCount] = useState(0);
  const [cpuValue, setCpuValue] = useState(0);

  useEffect(() => {
    const running = agents.filter((a) => a.state === "running").length;
    setActiveCount(running);
    if (metrics.length > 0) {
      setCpuValue(metrics[metrics.length - 1]);
    }
  }, [agents, metrics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    let angle = 0;

    const draw = (t) => {
      const dpr = window.devicePixelRatio || 1;
      const w = (canvas.width = canvas.clientWidth * dpr);
      const h = (canvas.height = canvas.clientHeight * dpr);
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) / 2 - 20 * dpr;

      ctx.clearRect(0, 0, w, h);

      // Outer rotating ring
      angle = (t * 0.0005) % (Math.PI * 2);
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, angle, angle + Math.PI * 1.5);
      ctx.strokeStyle = "rgba(0, 229, 255, 0.4)";
      ctx.lineWidth = 2 * dpr;
      ctx.shadowColor = "#00e5ff";
      ctx.shadowBlur = 10 * dpr;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Tick marks
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2 + angle * 0.2;
        const inner = maxR - 8 * dpr;
        const outer = maxR - (i % 3 === 0 ? 18 * dpr : 12 * dpr);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.strokeStyle = i % 3 === 0 ? "rgba(0,229,255,0.7)" : "rgba(0,229,255,0.25)";
        ctx.lineWidth = (i % 3 === 0 ? 2 : 1) * dpr;
        ctx.stroke();
      }

      // CPU arc gauge
      const cpuAngle = (cpuValue / 100) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR - 24 * dpr, -Math.PI / 2, -Math.PI / 2 + cpuAngle);
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 3 * dpr;
      ctx.shadowColor = "#00e5ff";
      ctx.shadowBlur = 12 * dpr;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Agent count arc (running agents)
      const agentArc = Math.min(1, activeCount / 8) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR - 40 * dpr, -Math.PI / 2, -Math.PI / 2 + agentArc);
      ctx.strokeStyle = "#00ff9d";
      ctx.lineWidth = 3 * dpr;
      ctx.shadowColor = "#00ff9d";
      ctx.shadowBlur = 12 * dpr;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Center crosshair
      const chSize = 12 * dpr;
      ctx.strokeStyle = "rgba(0,229,255,0.6)";
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx - chSize, cy);
      ctx.lineTo(cx + chSize, cy);
      ctx.moveTo(cx, cy - chSize);
      ctx.lineTo(cx, cy + chSize);
      ctx.stroke();

      // Center text
      ctx.font = `bold ${14 * dpr}px "Share Tech Mono", monospace`;
      ctx.fillStyle = "#e0f7fa";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#00e5ff";
      ctx.shadowBlur = 8 * dpr;
      ctx.fillText(`CPU ${Math.round(cpuValue)}%`, cx, cy - 8 * dpr);
      ctx.font = `${11 * dpr}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "#00ff9d";
      ctx.fillText(`AGENTS ${activeCount}`, cx, cy + 10 * dpr);
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [activeCount, cpuValue]);

  return (
    <div style={{ position: "relative", height: "100%", minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
