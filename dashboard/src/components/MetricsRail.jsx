import { useEffect, useRef, useState } from "react";

export default function MetricsRail({ metrics = [] }) {
  const canvasRef = useRef(null);
  const [history, setHistory] = useState(() => {
    if (metrics.length > 0) return metrics.slice(-60);
    return Array.from({ length: 60 }, () => 50);
  });
  const [liveCpu, setLiveCpu] = useState(null);
  const [liveMem, setLiveMem] = useState(null);

  // Fetch real metrics every 5s
  useEffect(() => {
    let cancelled = false;
    const fetchMetrics = () => {
      fetch('/api/metrics/realtime')
        .then(r => r.json())
        .then(d => {
          if (cancelled) return;
          setLiveCpu(d.cpu);
          setLiveMem(d.memory);
        })
        .catch(() => {});
    };
    fetchMetrics();
    const id = setInterval(fetchMetrics, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Merge real metrics with any existing history
  const effectiveHistory = liveCpu !== null
    ? [...history.slice(-59), liveCpu]
    : history;

  useEffect(() => {
    if (metrics.length > 0) {
      setHistory(metrics.slice(-60));
    }
  }, [metrics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = canvas.clientWidth * dpr);
    const h = (canvas.height = canvas.clientHeight * dpr);
    ctx.clearRect(0, 0, w, h);

    // grid lines
    ctx.strokeStyle = "rgba(0,229,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const data = effectiveHistory;
    if (data.length < 2) return;

    const step = w / (data.length - 1);

    // phosphor fill
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * step;
      const y = h - (v / 100) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(0,229,255,0.35)");
    grad.addColorStop(1, "rgba(0,229,255,0.02)");
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    history.forEach((v, i) => {
      const x = i * step;
      const y = h - (v / 100) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#00e5ff";
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [history]);

  return (
    <div style={{ height: "100%" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
