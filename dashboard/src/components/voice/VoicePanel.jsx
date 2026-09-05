import { useEffect, useRef, useState } from "react";

const STATE_STYLES = {
  idle: { color: "#4a6070", label: "IDLE", glow: 0 },
  listening: { color: "#ffae00", label: "LISTENING", glow: 18 },
  thinking: { color: "#00e5ff", label: "THINKING", glow: 22 },
  speaking: { color: "#00ff9d", label: "SPEAKING", glow: 26 },
  error: { color: "#ff2a6d", label: "ERROR", glow: 20 },
};

export default function VoicePanel({ events = [] }) {
  const canvasRef = useRef(null);
  const [active, setActive] = useState(false);
  const [currentState, setCurrentState] = useState("idle");
  const [waveHistory, setWaveHistory] = useState([]);
  const rafRef = useRef(null);

  // Activate when events show listening/speaking
  useEffect(() => {
    const latest = events[0];
    if (!latest) return;
    const state = latest.state || "idle";
    setCurrentState(state);
    setActive(state !== "idle");

    if (state === "listening" || state === "speaking" || state === "thinking") {
      setWaveHistory((prev) => {
        const next = [...prev, { t: Date.now(), state }];
        return next.slice(-40);
      });
    }
  }, [events]);

  // Wave animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    const draw = () => {
      const w = (canvas.width = canvas.clientWidth * dpr);
      const h = (canvas.height = canvas.clientHeight * dpr);
      ctx.clearRect(0, 0, w, h);

      const style = STATE_STYLES[currentState] || STATE_STYLES.idle;
      const mid = h / 2;

      // Background glow when active
      if (active) {
        ctx.shadowColor = style.color;
        ctx.shadowBlur = style.glow * dpr;
        ctx.fillStyle = style.color.replace(")", ", 0.08)").replace("rgb", "rgba").replace("#", "rgba(");
        // Simple fallback for hex colors
        ctx.fillStyle =
          currentState === "listening"
            ? "rgba(255, 174, 0, 0.06)"
            : currentState === "speaking"
            ? "rgba(0, 255, 157, 0.06)"
            : currentState === "thinking"
            ? "rgba(0, 229, 255, 0.06)"
            : "rgba(74, 96, 112, 0.03)";
        ctx.fillRect(0, 0, w, h);
        ctx.shadowBlur = 0;
      }

      // Waveform
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 2 * dpr;
      ctx.shadowColor = style.color;
      ctx.shadowBlur = active ? 12 * dpr : 0;
      ctx.beginPath();

      const now = Date.now();
      const lookback = 4000; // ms
      const start = now - lookback;

      if (waveHistory.length === 0) {
        ctx.moveTo(0, mid);
        ctx.lineTo(w, mid);
      } else {
        const first = waveHistory[0];
        const last = waveHistory[waveHistory.length - 1];
        const timeSpan = Math.max(1, last.t - first.t);
        const xScale = w / lookback;

        ctx.moveTo(0, mid);
        for (let px = 0; px < w; px++) {
          const targetTime = start + px / xScale;
          const entry = waveHistory.find((e) => e.t >= targetTime) || last;
          const age = (now - entry.t) / 1000;
          const amp =
            entry.state === "speaking"
              ? 18 * Math.exp(-age * 1.8)
              : entry.state === "listening"
              ? 8 * Math.exp(-age * 1.4)
              : entry.state === "thinking"
              ? 4 * Math.sin(age * 3)
              : 0;
          const y = mid + (Math.sin(px * 0.06 + now * 0.004) * amp * dpr);
          ctx.lineTo(px, y);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [waveHistory, currentState, active]);

  const latest = events[0];
  const style = STATE_STYLES[currentState] || STATE_STYLES.idle;

  return (
    <div style={{ position: "relative", height: "100%", minHeight: 220 }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 16,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: style.color,
            boxShadow: active
              ? `0 0 ${style.glow}px ${style.color}, 0 0 ${style.glow * 2}px ${style.color}`
              : "none",
            transition: "all 0.3s ease",
          }}
        />
        <div
          style={{
            fontFamily: "Share Tech Mono, monospace",
            color: style.color,
            textShadow: active ? `0 0 10px ${style.color}` : "none",
            letterSpacing: "0.12em",
            fontSize: "0.85rem",
            transition: "all 0.3s ease",
          }}
        >
          {style.label}
        </div>
      </div>

      {latest && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            right: 16,
            fontSize: "0.7rem",
            color: "var(--iron-dim)",
            textAlign: "right",
            maxWidth: 260,
          }}
        >
          {latest.text && <div style={{ marginBottom: 4 }}>{latest.text}</div>}
          <div>
            {new Date(latest.ts).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}
