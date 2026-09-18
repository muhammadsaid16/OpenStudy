"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppStore } from "@/lib/store";
import { db } from "@/lib/db";

export const LIVE_WALLPAPERS = [
  { id: "knowledge-flow", name: "Knowledge Flow", desc: "Ruvren connection lines — structure and flow" },
  { id: "aurora", name: "Aurora Waves", desc: "Flowing ambient gradient waves" },
  { id: "starfield", name: "Cosmic Starfield", desc: "Drifting particle stars in deep space" },
  { id: "matrix", name: "Matrix Code", desc: "Cyber digital rain stream" },
  { id: "bokeh", name: "Glowing Bokeh", desc: "Floating ambient light orbs" },
];

/**
 * Bundled backgrounds, served from /public/bgs by Next.js. Entirely local: no
 * network call, no API key, works offline, and nothing to rate-limit.
 *
 * The store persists the `id` (not the path), so a file can be renamed or
 * replaced without invalidating anyone's saved choice.
 */
export const STATIC_WALLPAPERS = [
  { id: "bg-01", name: "Background 01", src: "/bgs/bg-01.jpg" },
  { id: "bg-02", name: "Background 02", src: "/bgs/bg-02.jpg" },
  { id: "bg-03", name: "Background 03", src: "/bgs/bg-03.jpg" },
  { id: "bg-04", name: "Background 04", src: "/bgs/bg-04.jpg" },
  { id: "bg-05", name: "Background 05", src: "/bgs/bg-05.jpg" },
  { id: "bg-06", name: "Background 06", src: "/bgs/bg-06.jpg" },
  { id: "bg-07", name: "Background 07", src: "/bgs/bg-07.jpg" },
  { id: "bg-08", name: "Background 08", src: "/bgs/bg-08.jpg" },
  { id: "bg-09", name: "Background 09", src: "/bgs/bg-09.jpg" },
  { id: "bg-10", name: "Background 10", src: "/bgs/bg-10.jpg" },
  { id: "bg-11", name: "Background 11", src: "/bgs/bg-11.jpg" },
  { id: "bg-12", name: "Background 12", src: "/bgs/bg-12.jpg" },
  { id: "bg-13", name: "Background 13", src: "/bgs/bg-13.jpg" },
  { id: "bg-14", name: "Background 14", src: "/bgs/bg-14.jpg" },
  { id: "bg-15", name: "Background 15", src: "/bgs/bg-15.jpg" },
  { id: "bg-16", name: "Background 16", src: "/bgs/bg-16.jpg" },
  { id: "bg-17", name: "Background 17", src: "/bgs/bg-17.jpg" },
  { id: "bg-18", name: "Background 18", src: "/bgs/bg-18.jpg" },
  { id: "bg-19", name: "Background 19", src: "/bgs/bg-19.jpg" },
  { id: "bg-20", name: "Background 20", src: "/bgs/bg-20.jpg" },
  { id: "bg-21", name: "Background 21", src: "/bgs/bg-21.jpg" },
  { id: "bg-22", name: "Background 22", src: "/bgs/bg-22.jpg" },
  { id: "bg-23", name: "Background 23", src: "/bgs/bg-23.jpg" },
  { id: "bg-24", name: "Background 24", src: "/bgs/bg-24.jpg" },
  { id: "bg-25", name: "Background 25", src: "/bgs/bg-25.jpg" },
  { id: "bg-26", name: "Background 26", src: "/bgs/bg-26.jpg" },
  { id: "hello-kitty", name: "Hello Kitty", src: "/bgs/hello-kitty.jpg" },
  { id: "linviena", name: "Linviena", src: "/bgs/linviena.jpg" },
  { id: "saule", name: "Saule", src: "/bgs/saule.jpg" },
  { id: "fondo-de-pantalla", name: "Fondo de Pantalla", src: "/bgs/fondo-de-pantalla.jpg" },
  { id: "hd-4k", name: "HD 4K", src: "/bgs/hd-4k.jpg" },
  { id: "study", name: "Study", src: "/bgs/study.jpg" },
  { id: "study-lofi-sakura", name: "Lofi Sakura Bus Stop", src: "/bgs/study-lofi-sakura.jpg" },
  { id: "remind", name: "Remind", src: "/bgs/remind.jpg" },
  { id: "snoopy-journey", name: "Snoopy's Journey", src: "/bgs/snoopy-journey.jpg" },
  { id: "gumball-and-darwin", name: "Gumball & Darwin", src: "/bgs/gumball-and-darwin.jpg" },
  { id: "iris-cabin", name: "Iris Cabin", src: "/bgs/iris-cabin.jpg" },
  { id: "desktop-wallpaper", name: "Desktop", src: "/bgs/desktop-wallpaper.jpg" },
  { id: "laptop-wallpaper", name: "Laptop", src: "/bgs/laptop-wallpaper.jpg" },
  { id: "d-wallpaper", name: "D Wallpaper", src: "/bgs/d-wallpaper.jpg" },
  { id: "download-4", name: "Download 4", src: "/bgs/download-4.jpg" },
  { id: "made-to-fit-macbook", name: "Macbook Fit", src: "/bgs/made-to-fit-macbook.jpg" },
];

/**
 * Fills the viewport with `children` turned clockwise by `deg`.
 *
 * A quarter-turned rectangle would normally leave its corners uncovered, so the
 * layer's dimensions are swapped before rotating (100vw x 100vh becomes
 * 100vh x 100vw). The rotated footprint is then exactly the viewport again, and
 * `background-size: cover` inside the pre-rotation box keeps the image
 * undistorted — it crops, as cover always does.
 */
function RotatedLayer({ deg, animate, children }: { deg: number; animate: boolean; children: ReactNode }) {
  const quarter = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  if (quarter === 0) return <div className="h-full w-full">{children}</div>;
  const swapped = quarter === 90 || quarter === 270;
  return (
    <div
      className="absolute left-1/2 top-1/2"
      style={{
        width: swapped ? "100vh" : "100vw",
        height: swapped ? "100vw" : "100vh",
        transform: `translate(-50%, -50%) rotate(${quarter}deg)`,
        transition: animate ? "transform 700ms ease" : undefined,
      }}
    >
      {children}
    </div>
  );
}

export function WallpaperHost() {
  const wallpaperType = useAppStore((s) => s.wallpaperType);
  const wallpaperId = useAppStore((s) => s.wallpaperId);
  const wallpaperOpacity = useAppStore((s) => s.wallpaperOpacity);
  const wallpaperBlur = useAppStore((s) => s.wallpaperBlur);
  const wallpaperRotation = useAppStore((s) => s.wallpaperRotation);
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
        <StaticWallpaper preset={wallpaperId} rotation={wallpaperRotation} animate={!reducedMotion} />
      )}
      {wallpaperType === "gradient" && (
        <GradientWallpaper rotation={wallpaperRotation} animate={!reducedMotion} />
      )}
      {wallpaperType === "custom" && (
        <CustomWallpaper url={wallpaperId} rotation={wallpaperRotation} animate={!reducedMotion} />
      )}
      {wallpaperType === "upload" && (
        <UploadedWallpaper id={wallpaperId} rotation={wallpaperRotation} animate={!reducedMotion} />
      )}
    </div>
  );
}

function GradientWallpaper({ rotation, animate }: { rotation: number; animate: boolean }) {
  const mode = useAppStore((s) => s.wallpaperGradientMode);
  const color1 = useAppStore((s) => s.wallpaperGradientColor1);
  const color2 = useAppStore((s) => s.wallpaperGradientColor2);
  const color3 = useAppStore((s) => s.wallpaperGradientColor3);
  const angle = useAppStore((s) => s.wallpaperGradientAngle);

  const stops = [color1, color3?.trim() ? color3 : null, color2].filter(Boolean).join(", ");
  let backgroundStyle = "";
  if (mode === "radial") {
    backgroundStyle = `radial-gradient(circle at center, ${stops})`;
  } else if (mode === "conic") {
    backgroundStyle = `conic-gradient(from ${angle}deg at 50% 50%, ${stops})`;
  } else {
    backgroundStyle = `linear-gradient(${angle}deg, ${stops})`;
  }

  return (
    <RotatedLayer deg={rotation} animate={animate}>
      <div
        className="h-full w-full transition-all duration-700"
        style={{ background: backgroundStyle }}
      />
      <ThemeScrim />
    </RotatedLayer>
  );
}


/**
 * Theme-tinted scrim between a photo background and the UI. Mixing the active
 * theme's surface token over the image is what makes any photo — whatever its
 * palette — read as part of the app: the glass panels are built from the same
 * `--color-surface` token (see .glass in globals.css), so background and
 * panels share one tint. The mix strength also scales with the interface
 * opacity slider: the more transparent the UI, the more the background shows
 * through — and the more it is tinted toward the theme to stay readable.
 */
function ThemeScrim() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 transition-all duration-700"
      style={{
        background:
          "color-mix(in srgb, var(--color-surface) calc((1 - var(--ui-alpha, 1)) * 35% + 25%), transparent)",
      }}
    />
  );
}

function StaticWallpaper({ preset, rotation, animate }: { preset: string; rotation: number; animate: boolean }) {
  // A path/URL is still honoured so a choice saved from the removed API search
  // keeps working; anything else is looked up as a bundled background id.
  const isPath = preset.startsWith("http://") || preset.startsWith("https://") || preset.startsWith("/");
  const src = isPath
    ? preset
    : (STATIC_WALLPAPERS.find((w) => w.id === preset) ?? STATIC_WALLPAPERS[0]).src;
  return (
    <RotatedLayer deg={rotation} animate={animate}>
      <div
        className="h-full w-full bg-cover bg-center transition-all duration-700"
        style={{ backgroundImage: `url(${src})` }}
      />
      <ThemeScrim />
    </RotatedLayer>
  );
}

function CustomWallpaper({ url, rotation, animate }: { url: string; rotation: number; animate: boolean }) {
  if (!url) return <div className="h-full w-full bg-bg" />;

  const isVideo = url.endsWith(".mp4") || url.endsWith(".webm");
  if (isVideo) {
    return (
      <RotatedLayer deg={rotation} animate={animate}>
        <video
          src={url}
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      </RotatedLayer>
    );
  }

  return (
    <RotatedLayer deg={rotation} animate={animate}>
      <div
        className="h-full w-full bg-cover bg-center transition-all duration-700"
        style={{ backgroundImage: `url(${url})` }}
      />
      <ThemeScrim />
    </RotatedLayer>
  );
}

/**
 * A wallpaper the user uploaded from their device. The blob lives in the
 * `wallpapers` IndexedDB table; an object URL is created for rendering and
 * revoked when the id changes or the component unmounts, so gallery-sized
 * images don't leak memory. Falls back to nothing while loading or if the
 * record was deleted out from under a saved preference.
 */
function UploadedWallpaper({ id, rotation, animate }: { id: string; rotation: number; animate: boolean }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let objectUrl: string | null = null;
    let alive = true;
    db.wallpapers
      .get(id)
      .then((rec) => {
        if (!alive || !rec?.blob) return;
        objectUrl = URL.createObjectURL(rec.blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        /* record gone or storage unavailable — render nothing rather than break */
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (!url) return <div className="h-full w-full bg-bg" />;
  return (
    <RotatedLayer deg={rotation} animate={animate}>
      <div
        className="h-full w-full bg-cover bg-center transition-all duration-700"
        style={{ backgroundImage: `url(${url})` }}
      />
      <ThemeScrim />
    </RotatedLayer>
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
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const setupCanvas = () => {
      if (!canvas) return;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };
    setupCanvas();

    const handleResize = () => {
      setupCanvas();
    };
    window.addEventListener("resize", handleResize);
    const handleFlowResize = () => buildFlow();
    window.addEventListener("resize", handleFlowResize);

    // Preset 0: Knowledge Flow — the brand's connection pattern. Nodes linked
    // by right-angle circuit lines (Connection / Structure / Knowledge Flow);
    // a slow pulse travels the edges, dots breathe on their joints. This is
    // the Ruvren identity pattern from the brand sheet.
    interface FlowNode { x: number; y: number; r: number; phase: number; }
    interface FlowEdge { a: FlowNode; b: FlowNode; mid: number; speed: number; offset: number; }
    const nodeCount = reducedMotion ? 8 : 14;
    let flowNodes: FlowNode[] = [];
    let flowEdges: FlowEdge[] = [];
    const buildFlow = () => {
      flowNodes = Array.from({ length: nodeCount }, (_, i) => ({
        x: (0.08 + 0.84 * ((i * 0.618 + 0.13) % 1)) * width,
        y: (0.1 + 0.8 * (((i * 0.377) + Math.floor(i / 3) * 0.31) % 1)) * height,
        r: 2.5 + (i % 3),
        phase: Math.random() * Math.PI * 2,
      }));
      flowEdges = [];
      for (let i = 0; i < flowNodes.length; i++) {
        // Each node links to its 2 nearest neighbours — the circuit look.
        const others = flowNodes
          .filter((_, j) => j !== i)
          .map((n) => ({ n, d: Math.hypot(n.x - flowNodes[i].x, n.y - flowNodes[i].y) }))
          .sort((p, q) => p.d - q.d)
          .slice(0, 2);
        for (const { n } of others) {
          if (!flowEdges.some((e) => (e.a === n && e.b === flowNodes[i]))) {
            flowEdges.push({ a: flowNodes[i], b: n, mid: Math.random(), speed: 0.0015 + Math.random() * 0.002, offset: Math.random() });
          }
        }
      }
    };
    buildFlow();

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
    const chars = "01010101XYZRUVRENAMK789";

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

      if (preset === "knowledge-flow") {
        ctx.fillStyle = "#0B1220";
        ctx.fillRect(0, 0, width, height);

        // Right-angle circuit traces between linked nodes.
        for (const e of flowEdges) {
          const bendX = e.a.x + (e.b.x - e.a.x) * e.mid;
          // Outer subtle glow trace
          ctx.strokeStyle = "rgba(10, 132, 255, 0.08)";
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(e.a.x, e.a.y);
          ctx.lineTo(bendX, e.a.y);
          ctx.lineTo(bendX, e.b.y);
          ctx.lineTo(e.b.x, e.b.y);
          ctx.stroke();

          // Inner crisp trace
          ctx.strokeStyle = "rgba(10, 132, 255, 0.25)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(e.a.x, e.a.y);
          ctx.lineTo(bendX, e.a.y);
          ctx.lineTo(bendX, e.b.y);
          ctx.lineTo(e.b.x, e.b.y);
          ctx.stroke();

          // A slow pulse travelling along the trace (skipped for reduced motion):
          // parametrized over the horizontal-then-vertical path through the bend.
          if (!reducedMotion) {
            const t = (step * e.speed + e.offset) % 1;
            const total = Math.abs(bendX - e.a.x) + Math.abs(e.b.y - e.a.y) || 1;
            const dist = t * total;
            const hx = Math.abs(bendX - e.a.x);
            const pulse = dist <= hx
              ? { x: e.a.x + Math.sign(bendX - e.a.x) * dist, y: e.a.y }
              : { x: bendX, y: e.a.y + Math.sign(e.b.y - e.a.y) * (dist - hx) };
            
            ctx.fillStyle = "rgba(163, 208, 250, 0.95)";
            ctx.beginPath();
            ctx.arc(pulse.x, pulse.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Nodes breathe on their joints.
        for (const n of flowNodes) {
          const breathe = reducedMotion ? 1 : 1 + 0.25 * Math.sin(step * 0.01 + n.phase);
          // Soft outer ambient halo
          ctx.fillStyle = "rgba(10, 132, 255, 0.15)";
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * breathe * 2.2, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "rgba(10, 132, 255, 0.85)";
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * breathe, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "rgba(248, 250, 252, 0.85)";
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * breathe * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (preset === "starfield") {
        ctx.fillStyle = "#0B1220";
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
        ctx.fillStyle = "rgba(11, 18, 32, 0.18)";
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = "#4edea3";
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
        ctx.fillStyle = "#0B1220";
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
        ctx.fillStyle = "#0B1220";
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
      window.removeEventListener("resize", handleFlowResize);
    };
  }, [preset, reducedMotion]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}
