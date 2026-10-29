// Efectos: sonidos sintetizados con Web Audio (sin archivos) y animaciones pequeñas.
// Todo respeta "reducir movimiento" del sistema y el interruptor de sonidos de Ajustes.

const SOUND_KEY = "fitcpu:sound";
let ctx = null;
let enabled = (() => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } })();

export const soundOn = () => enabled;
export function setSound(on) {
  enabled = !!on;
  try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch {}
}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
// iOS solo deja sonar audio después de un toque del usuario.
addEventListener("pointerdown", () => { if (enabled) ac(); }, { once: true, passive: true });

function tone({ f = 600, f2 = null, t = 0, d = 0.12, type = "sine", v = 0.12 }) {
  if (!enabled) return;
  const c = ac(); if (!c) return;
  const now = c.currentTime + t;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + d);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(v, now + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, now + d);
  o.connect(g).connect(c.destination);
  o.start(now); o.stop(now + d + 0.03);
}

export const sfx = {
  tap: () => tone({ f: 520, f2: 700, d: 0.06, v: 0.05 }),
  add: () => { tone({ f: 660, f2: 990, d: 0.09, v: 0.12 }); tone({ f: 1320, t: 0.07, d: 0.14, v: 0.07, type: "triangle" }); },
  check: () => { tone({ f: 1046, d: 0.12, v: 0.1, type: "triangle" }); tone({ f: 1318, t: 0.08, d: 0.2, v: 0.1, type: "triangle" }); },
  uncheck: () => tone({ f: 700, f2: 420, d: 0.12, v: 0.08 }),
  remove: () => tone({ f: 520, f2: 170, d: 0.2, v: 0.1, type: "triangle" }),
  water: () => { tone({ f: 1300, f2: 420, d: 0.13, v: 0.12 }); tone({ f: 900, f2: 300, t: 0.07, d: 0.11, v: 0.07 }); },
  save: () => { tone({ f: 880, d: 0.15, v: 0.09, type: "triangle" }); tone({ f: 1318, t: 0.1, d: 0.26, v: 0.07 }); },
  goal: () => [523, 659, 784, 1046].forEach((f, i) => tone({ f, t: i * 0.09, d: 0.3, v: 0.1, type: "triangle" })),
};

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Cuenta animada de un número a otro.
export function countUp(el, from, to, format, dur = 650) {
  if (!el) return;
  if (reducedMotion() || Math.abs(to - from) < 1) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = format(from + (to - from) * e);
    if (p < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Confeti breve desde un punto de la pantalla.
export function confetti(x, y) {
  if (reducedMotion()) return;
  const cv = document.createElement("canvas");
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:70";
  document.body.appendChild(cv);
  const g = cv.getContext("2d"); g.scale(dpr, dpr);
  const colors = ["#f5c542", "#5cc96a", "#f5f4ee", "#e8a33a"];
  const parts = Array.from({ length: 70 }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, s = 4 + Math.random() * 6;
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 3 + Math.random() * 4, c: colors[(Math.random() * colors.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 };
  });
  const t0 = performance.now();
  const frame = (now) => {
    const el = now - t0;
    g.clearRect(0, 0, innerWidth, innerHeight);
    parts.forEach((p) => {
      p.vy += 0.22; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      g.save(); g.globalAlpha = Math.max(0, 1 - el / 1400); g.translate(p.x, p.y); g.rotate(p.rot);
      g.fillStyle = p.c; g.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); g.restore();
    });
    if (el < 1400) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}
