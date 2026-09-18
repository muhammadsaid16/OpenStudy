"use client";

import type { CSSProperties } from "react";

/**
 * 21st.dev-style cursor-follow spotlight. Spread onto any element that has
 * the `.spotlight-card` class (see globals.css): mousemove writes --sx/--sy,
 * and a radial accent glow tracks the pointer via pure CSS.
 */
export function spotlightProps() {
  return {
    onMouseMove: (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--sx", `${e.clientX - r.left}px`);
      el.style.setProperty("--sy", `${e.clientY - r.top}px`);
    },
  };
}

/**
 * Magnetic hover — element leans toward the cursor while it's over it,
 * springs back on leave (21st.dev / Aceternity pattern). Pure transform,
 * zero layout impact. Honors reduced motion at runtime.
 */
export function magneticHandlers(strength = 0.25) {
  return {
    onMouseMove: (e: React.MouseEvent<HTMLElement>) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.transition = "transform 80ms linear";
      el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget as HTMLElement;
      el.style.transition = "transform 350ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "translate(0px, 0px)";
    },
  };
}

export type SpotlightStyle = CSSProperties;

/**
 * 3D tilt — card rotates toward the cursor (max ~6°) with perspective,
 * springs flat on leave. Spread onto any block element. Reduced-motion
 * checked at runtime; transform-only so zero layout impact.
 */
export function tiltHandlers(max = 6) {
  return {
    onMouseMove: (e: React.MouseEvent<HTMLElement>) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5; // -0.5..0.5
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transition = "transform 100ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = `perspective(800px) rotateX(${-py * max}deg) rotateY(${px * max}deg) translateY(-4px) translateZ(8px)`;
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget as HTMLElement;
      el.style.transition = "transform 350ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0px) translateZ(0px)";
    },
  };
}

/**
 * Combined 3D tilt + spotlight handler for unified interactive cards.
 */
export function cardHoverHandlers(maxTilt = 6) {
  return {
    onMouseMove: (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--sx", `${e.clientX - r.left}px`);
      el.style.setProperty("--sy", `${e.clientY - r.top}px`);
      
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transition = "transform 100ms cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transform = `perspective(800px) rotateX(${-py * maxTilt}deg) rotateY(${px * maxTilt}deg) translateY(-4px) translateZ(8px)`;
      }
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget as HTMLElement;
      el.style.transition = "transform 350ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0px) translateZ(0px)";
    },
  };
}


