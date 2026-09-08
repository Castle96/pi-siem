import { useEffect, useRef, useState } from "react";

const STATE_STYLES = {
  idle: { color: "#4a6070", label: "IDLE", glow: 0 },
  listening: { color: "#ffae00", label: "LISTENING", glow: 18 },
  thinking: { color: "#00e5ff", label: "THINKING", glow: 22 },
  speaking: { color: "#00ff9d", label: "SPEAKING", glow: 26 },
  error: { color: "#ff2a6d", label: "ERROR", glow: 20 },
};

export default function VoicePanel({ events = [], stale = false, headerVoiceState = "" }) {
  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const [active, setActive] = useState(false);
  const [currentState, setCurrentState] = useState("idle");
  const [waveHistory, setWaveHistory] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sending, setSending] = useState(false);
  const rafRef = useRef(null);

  // Track session transcripts: server emits state "intent" (user command) and
  // "reply" (Jarvis answer); the daemon logs "speaking" for mic replies.
  useEffect(() => {
    if (!events?.length) return;
    const latest = events[0];
    const state = latest.state || "idle";
    setCurrentState(state);
    setActive(state !== "idle");

    if (state === "listening" || state === "speaking" || state === "thinking") {
      setWaveHistory((prev) => {
        const next = [...prev, { t: Date.now(), state }];
        return next.slice(-40);
      });
    }

    if (state === "intent" || state === "reply" || state === "speaking") {
      const tag = state === "intent" ? "CMD" : "REPLY";
      const display =
        state === "intent" && latest.text?.includes(": ")
          ? latest.text.split(": ").slice(1).join(": ")
          : latest.text;
      if (!display) return;
      setSessions((prev) =>
        [{ ts: latest.ts, text: display, tag }, ...prev].slice(0, 6)
      );
    }
  }, [events]);

  // Forward the live header voice state into the panel canvas state when the
  // events feed hasn't advanced yet.
  useEffect(() => {
    if (headerVoiceState && headerVoiceState !== "idle") {
      setCurrentState(headerVoiceState);
      setActive(true);
    }
  }, [headerVoiceState]);

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

      if (active) {
        ctx.fillStyle =
          currentState === "listening"
            ? "rgba(255, 174, 0, 0.06)"
            : currentState === "speaking"
            ? "rgba(0, 255, 157, 0.06)"
            : currentState === "thinking"
            ? "rgba(0, 229, 255, 0.06)"
            : "rgba(74, 96, 112, 0.03)";
        ctx.fillRect(0, 0, w, h);
      }

      const isStale = stale && currentState === "idle";
      ctx.strokeStyle = isStale ? "#ff2a6d" : style.color;
      ctx.lineWidth = 2 * dpr;
      ctx.shadowColor = isStale ? "#ff2a6d" : style.color;
      ctx.shadowBlur = active ? (stale ? 6 : 12) * dpr : 0;
      ctx.beginPath();

      const now = Date.now();
      const lookback = 4000;
      const start = now - lookback;

      if (waveHistory.length === 0) {
        ctx.moveTo(0, mid);
        ctx.lineTo(w, mid);
      } else {
        const last = waveHistory[waveHistory.length - 1];
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
  }, [waveHistory, currentState, active, stale]);

  const style = stale && currentState === "idle"
    ? STATE_STYLES.error
    : STATE_STYLES[currentState] || STATE_STYLES.idle;

  const sendCommand = async () => {
    const text = inputRef.current?.value.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/voice/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: "console" }),
      });
      const data = await res.json();
      const reply = data.reply || text;
      setSessions((prev) => [
        { ts: new Date().toISOString(), text, tag: "CMD" },
        { ts: new Date().toISOString(), text: reply, tag: "REPLY" },
        ...prev,
      ].slice(0, 6));
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ position: "relative", height: "100%", minHeight: 200, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 14,
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
            {stale && currentState === "idle" ? "LINK DOWN" : style.label}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 6,
            left: 14,
            right: 14,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            fontSize: "0.62rem",
            color: "var(--iron-dim)",
            textAlign: "left",
            minWidth: 0,
          }}
        >
          {sessions.slice(0, 4).map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: "Share Tech Mono, monospace",
                  color: s.tag === "REPLY" ? "#00ff9d" : "#00e5ff",
                }}
              >
                {s.tag}
              </span>
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: s.tag === "REPLY" ? "var(--iron-text)" : "var(--iron-dim)",
                }}
              >
                {s.text}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            top: 10,
            right: 14,
            fontSize: "0.6rem",
            color: "var(--iron-dim)",
            textAlign: "right",
            fontFamily: "Share Tech Mono, monospace",
          }}
        >
          <div>{sessions[0]?.ts ? new Date(sessions[0].ts).toLocaleTimeString() : "—"}</div>
        </div>
      </div>

      {/* Voice console */}
      <form
        onSubmit={(e) => { e.preventDefault(); sendCommand(); }}
        style={{
          display: "flex",
          gap: 6,
          padding: "6px 10px",
          borderTop: "1px solid rgba(0,229,255,0.1)",
          background: "rgba(0,229,255,0.02)",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder='say: "status of ray", "open services", "scan all"...'
          style={{
            flex: 1,
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(0,229,255,0.2)",
            borderRadius: 2,
            padding: "4px 8px",
            fontFamily: "Share Tech Mono, monospace",
            fontSize: "0.62rem",
            color: "var(--iron-text)",
            outline: "none",
          }}
        />
        <button
          type="submit"
          style={{
            background: "rgba(0,229,255,0.1)",
            border: "1px solid rgba(0,229,255,0.3)",
            color: "#00e5ff",
            padding: "4px 10px",
            borderRadius: 2,
            fontFamily: "Share Tech Mono, monospace",
            fontSize: "0.62rem",
            cursor: "pointer",
          }}
        >
          SEND
        </button>
      </form>
    </div>
  );
}