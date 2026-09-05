import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 60;

export default function Particles() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let particles = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const rand = (min, max) => Math.random() * (max - min) + min;

    const spawn = () => {
      const colors = ["#00e5ff", "#ff2a6d", "#00ff9d", "#ffae00", "#b300ff"];
      return {
        x: rand(0, canvas.width),
        y: rand(-50, 0),
        vx: rand(-0.8, -0.2),
        vy: rand(0.8, 2.5),
        size: rand(1, 3.5),
        color: colors[Math.floor(rand(0, colors.length))],
        life: rand(400, 900),
        born: performance.now(),
        glow: rand(5, 15),
      };
    };

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(spawn());
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        const age = performance.now() - p.born;
        const alpha = Math.min(1, age / 150) * (1 - age / p.life);
        if (alpha <= 0) {
          Object.assign(p, spawn());
          p.born = performance.now();
          continue;
        }
        p.x += p.vx;
        p.y += p.vy;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = p.glow;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="particles-canvas" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1 }} />;
}
