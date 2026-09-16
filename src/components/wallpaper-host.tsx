"use client";

import { useEffect, useRef } from "react";
import { useAppStore, type WallpaperType } from "@/lib/store";

export const LIVE_WALLPAPERS = [
  { id: "aurora", name: "Aurora Waves", desc: "Flowing ambient gradient waves" },
  { id: "starfield", name: "Cosmic Starfield", desc: "Drifting particle stars in deep space" },
  { id: "matrix", name: "Matrix Code", desc: "Cyber digital rain stream" },
  { id: "bokeh", name: "Glowing Bokeh", desc: "Floating ambient light orbs" },
];

export const STATIC_WALLPAPERS = [
  { id: "deep-space", name: "Deep Space", bg: "radial-gradient(ellipse at top left, #1e1b4b, #0f172a, #020617)" },
  { id: "cosmic-dust", name: "Cosmic Dust", bg: "radial-gradient(ellipse at bottom right, #451a03, #1c1917, #09090b)" },
  { id: "northern-lights", name: "Northern Lights", bg: "radial-gradient(ellipse at top, #022c22, #0f172a, #020617)" },
  { id: "sunset-glow", name: "Sunset Twilight", bg: "radial-gradient(ellipse at top right, #31103f, #180e29, #090611)" },
  { id: "cyber-grid", name: "Cyber Neon", bg: "radial-gradient(circle at center, #17072b, #080313, #020108)" },
  { id: "sand-dunes", name: "Sandstone Night", bg: "radial-gradient(ellipse at bottom left, #291e17, #140f0c, #070504)" },
];

export function WallpaperHost() {
  const wallpaperType = useAppStore((s) => s.wallpaperType);
  const wallpaperId = useAppStore((s) => s.wallpaperId);
  const wallpaperOpacity = useAppStore((s) => s.wallpaperOpacity);
  const wallpaperBlur = useAppStore((s) => s.wallpaperBlur);
  const reducedMotion = useAppStore((s) => s.reducedMotion);

  if (wallpaperType === "none") return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden transition-opacity duration-700"
      style={{
        opacity: wallpaperOpacity,
        filter: wallpaperBlur > 0 ? `blur(${wallpaperBlur}px)` : undefined,
      }}
    >
      {wallpaperType === "live" && (
        <LiveCanvas preset={wallpaperId} reducedMotion={reducedMotion} />
      )}
      {wallpaperType === "static" && (
        <StaticWallpaper preset={wallpaperId} />
      )}
      {wallpaperType === "custom" && (
        <CustomWallpaper url={wallpaperId} />
      )}
    </div>
  );
}

function StaticWallpaper({ preset }: { preset: string }) {
  const item = STATIC_WALLPAPERS.find((w) => w.id === preset) ?? STATIC_WALLPAPERS[0];
  return (
    <div
      className="h-full w-full bg-cover bg-center transition-all duration-700"
      style={{ background: item.bg }}
    />
  );
}

function CustomWallpaper({ url }: { url: string }) {
  if (!url) return <div className="h-full w-full bg-bg" />;

  const isVideo = url.endsWith(".mp4") || url.endsWith(".webm");
  if (isVideo) {
    return (
      <video
        src={url}
        autoPlay
        loop
        muted
        playsInline
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div
      className="h-full w-full bg-cover bg-center transition-all duration-700"
      style={{ backgroundImage: `url(${url})` }}
    />
  );
}

function LiveCanvas({ preset, reducedMotion }: { preset: string; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Preset 1: Aurora Waves
    const waves = [
      { y: 0.3, length: 0.005, amplitude: 90, speed: 0.008, color: "rgba(99, 102, 241, 0.35)" },
      { y: 0.5, length: 0.008, amplitude: 120, speed: 0.005, color: "rgba(168, 85, 247, 0.3)" },
      { y: 0.7, length: 0.004, amplitude: 70, speed: 0.01, color: "rgba(236, 72, 153, 0.25)" },
    ];

    // Preset 2: Starfield Particles
    const numStars = reducedMotion ? 40 : 120;
    const stars = Array.from({ length: numStars }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2 + 0.5,
      speed: Math.random() * 0.4 + 0.1,
      opacity: Math.random() * 0.8 + 0.2,
    }));

    // Preset 3: Matrix Code Rain
    const fontSize = 14;
    const columns = Math.floor(width / fontSize);
    const drops = Array.from({ length: columns }, () => Math.floor(Math.random() * -50));
    const chars = "01010101XYZOPENSTUDYAMK789";

    // Preset 4: Glowing Bokeh Orbs
    const numOrbs = reducedMotion ? 8 : 18;
    const orbs = Array.from({ length: numOrbs }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 120 + 40,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      hue: Math.floor(Math.random() * 360),
    }));

    let step = 0;

    const render = () => {
      step++;
      ctx.clearRect(0, 0, width, height);

      if (preset === "starfield") {
        ctx.fillStyle = "#030712";
        ctx.fillRect(0, 0, width, height);

        for (const star of stars) {
          if (!reducedMotion) {
            star.y -= star.speed;
            if (star.y < 0) {
              star.y = height;
              star.x = Math.random() * width;
            }
          }
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
          ctx.fill();
        }
      } else if (preset === "matrix") {
        ctx.fillStyle = "rgba(2, 6, 23, 0.15)";
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = "#10b981";
        ctx.font = `${fontSize}px monospace`;

        for (let i = 0; i < drops.length; i++) {
          const text = chars[Math.floor(Math.random() * chars.length)];
          const x = i * fontSize;
          const y = drops[i] * fontSize;

          ctx.fillText(text, x, y);

          if (y > height && Math.random() > 0.975) {
            drops[i] = 0;
          }
          if (!reducedMotion) drops[i]++;
        }
      } else if (preset === "bokeh") {
        ctx.fillStyle = "#070a12";
        ctx.fillRect(0, 0, width, height);

        for (const orb of orbs) {
          if (!reducedMotion) {
            orb.x += orb.vx;
            orb.y += orb.vy;
            if (orb.x < -orb.radius) orb.x = width + orb.radius;
            if (orb.x > width + orb.radius) orb.x = -orb.radius;
            if (orb.y < -orb.radius) orb.y = height + orb.radius;
            if (orb.y > height + orb.radius) orb.y = -orb.radius;
          }

          const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius);
          grad.addColorStop(0, `hsla(${orb.hue}, 80%, 65%, 0.3)`);
          grad.addColorStop(1, `hsla(${orb.hue}, 80%, 65%, 0)`);

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Default: Aurora Waves
        ctx.fillStyle = "#070b14";
        ctx.fillRect(0, 0, width, height);

        for (const wave of waves) {
          ctx.beginPath();
          ctx.moveTo(0, height * wave.y);

          for (let x = 0; x < width; x += 10) {
            const angle = x * wave.length + step * (reducedMotion ? 0.001 : wave.speed);
            const y = Math.sin(angle) * wave.amplitude + height * wave.y;
            ctx.lineTo(x, y);
          }

          ctx.lineTo(width, height);
          ctx.lineTo(0, height);
          ctx.closePath();

          ctx.fillStyle = wave.color;
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [preset, reducedMotion]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}
