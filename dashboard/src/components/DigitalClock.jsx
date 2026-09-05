import { useState, useEffect } from "react";

export default function DigitalClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hours = String(time.getHours()).padStart(2, "0");
  const minutes = String(time.getMinutes()).padStart(2, "0");

  return (
    <div
      style={{
        fontFamily: "Share Tech Mono, monospace",
        color: "#e0f7fa",
        textShadow: "0 0 20px rgba(0,229,255,0.8), 0 0 40px rgba(0,229,255,0.4)",
        textAlign: "center",
        lineHeight: 1,
      }}
    >
      <div style={{ fontSize: "3rem", letterSpacing: "0.1em" }}>
        {hours}:{minutes}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: "0.6rem",
          color: "var(--iron-cyan)",
          letterSpacing: "0.3em",
        }}
      >
        JARVIS ACTIVE
      </div>
    </div>
  );
}
