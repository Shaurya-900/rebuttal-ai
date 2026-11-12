"use client";
// First-visit intro: hold the Rebuttal card, drop it into the reader and swipe it across to enter. Let go anywhere
// else and gravity takes it. Shown once per browser (localStorage); Skip, Enter on the card, or Esc get straight in.
// The card is CSS 3D (perspective + tilt from drag velocity), not a 3D library: a credit card is rigid anyway.
import { useCallback, useEffect, useRef, useState } from "react";

export const INTRO_KEY = "rebuttal-entered";

// Stage units, origin at the centre of the screen (scaled down on small screens).
const CW = 300, CH = 190; // card
const RW = 440, RH = 150, SLOT = 70; // reader width, height, y of its top edge (the slot)
const HOME = { x: 0, y: -150 };
const DEPTH = 105; // how far the card's bottom edge can sink into the slot
const SWIPE = 150; // sideways travel inside the slot that counts as a swipe
const G = 2600; // gravity, units/s²

type Mode = "idle" | "drag" | "fall" | "done";
const clamp = (v: number, a: number) => Math.max(-a, Math.min(a, v));

export default function Intro() {
  const [show, setShow] = useState(true); // the server renders it; CSS hides it unless <html data-intro> (set before paint)
  const [lcd, setLcd] = useState("READY");
  const [leaving, setLeaving] = useState(false);
  const [scale, setScale] = useState(1);
  const card = useRef<HTMLDivElement>(null);
  const s = useRef({ x: HOME.x, y: HOME.y, vx: 0, vy: 0, rot: 0, vr: 0, mode: "idle" as Mode, front: false,
    grabX: 0, grabY: 0, lastT: 0, lastX: 0, lastY: 0, in: false, x0: 0, scale: 1, opacity: 1 });

  const finish = useCallback(() => {
    try { localStorage.setItem(INTRO_KEY, "1"); } catch {}
    delete document.documentElement.dataset.intro;
    setShow(false);
  }, []);

  const approve = useCallback(() => {
    const st = s.current;
    if (st.mode === "done") return;
    st.mode = "done";
    setLcd("READING");
    setTimeout(() => setLcd("APPROVED"), 450);
    setTimeout(() => setLeaving(true), 1100);
    setTimeout(finish, 1700);
  }, [finish]);

  useEffect(() => {
    let stored = false;
    try { stored = !!localStorage.getItem(INTRO_KEY); } catch {}
    if (stored) { delete document.documentElement.dataset.intro; setShow(false); return; }
    document.documentElement.dataset.intro = "1";
    const st = s.current;
    const fit = () => { st.scale = Math.min(1, (window.innerWidth - 32) / (RW + 40), (window.innerHeight - 40) / 640); setScale(st.scale); };
    fit();
    window.addEventListener("resize", fit);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", esc);

    let raf = 0, prev = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (st.mode === "fall") {
        st.vy += G * dt; st.x += st.vx * dt; st.y += st.vy * dt; st.rot += st.vr * dt;
        if (st.y > window.innerHeight / 2 / st.scale + CH) { // off screen: a fresh card drops back in
          Object.assign(st, { ...HOME, vx: 0, vy: 0, rot: 0, vr: 0, mode: "idle", front: false, opacity: 0 });
          setLcd("TRY AGAIN");
        }
      } else if (st.mode === "idle") { // ease home, settle tilt
        st.x += (HOME.x - st.x) * Math.min(1, dt * 10); st.y += (HOME.y - st.y) * Math.min(1, dt * 10);
        st.vx *= 0.85; st.vy *= 0.85; st.rot *= 0.85;
      } else if (st.mode === "done") { // drawn into the reader
        st.y += 220 * dt; st.vx *= 0.8; st.vy *= 0.8; st.rot *= 0.8; st.opacity = Math.max(0, st.opacity - dt * 1.4);
      }
      if (st.mode !== "done" && st.opacity < 1) st.opacity = Math.min(1, st.opacity + dt * 3);
      const el = card.current;
      if (el) {
        // In the slot the card sits nearly flat and everything below the slot line is hidden inside the reader.
        const slotted = !st.front && (st.in || st.mode === "done");
        const k = slotted ? 0.25 : 1;
        const rz = st.mode === "fall" ? st.rot : clamp(st.vx * 0.012, 14) * k;
        const rx = clamp(-st.vy * 0.02, 28) * k, ry = clamp(st.vx * 0.025, 28) * k;
        el.style.transform = `translate(-50%,-50%) translate(${st.x}px,${st.y}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
        const below = st.y + CH / 2 - SLOT;
        el.style.clipPath = slotted && below > 0 ? `inset(0 0 ${Math.min(CH, below)}px 0)` : "";
        el.style.opacity = String(st.opacity);
        el.style.zIndex = st.front ? "3" : "1";
        el.style.setProperty("--ry", String(ry));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", fit); window.removeEventListener("keydown", esc); };
  }, [finish]);

  const toStage = (e: React.PointerEvent) => {
    const k = s.current.scale;
    return { x: (e.clientX - window.innerWidth / 2) / k, y: (e.clientY - window.innerHeight / 2) / k };
  };

  function down(e: React.PointerEvent) {
    const st = s.current;
    if (st.mode === "done") return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    const p = toStage(e);
    Object.assign(st, { mode: "drag", front: false, grabX: p.x - st.x, grabY: p.y - st.y, lastT: e.timeStamp, lastX: p.x, lastY: p.y, vx: 0, vy: 0, in: false });
    setLcd("INSERT CARD");
  }

  function move(e: React.PointerEvent) {
    const st = s.current;
    if (st.mode !== "drag") return;
    const p = toStage(e);
    const dt = Math.max(1, e.timeStamp - st.lastT) / 1000;
    st.vx = st.vx * 0.6 + ((p.x - st.lastX) / dt) * 0.4;
    st.vy = st.vy * 0.6 + ((p.y - st.lastY) / dt) * 0.4;
    st.lastT = e.timeStamp; st.lastX = p.x; st.lastY = p.y;
    let x = p.x - st.grabX, y = p.y - st.grabY;
    const overReader = Math.abs(x) < RW / 2 - 10;
    if (overReader && y + CH / 2 > SLOT + 12) { // in the slot: it slides along it, and can't go deeper than the reader
      y = Math.min(y, SLOT + DEPTH - CH / 2);
      if (!st.in) { st.in = true; st.x0 = x; }
      const prog = Math.min(1, Math.abs(x - st.x0) / SWIPE);
      setLcd(prog > 0.08 ? "█".repeat(Math.round(prog * 8)).padEnd(8, "░") : "SWIPE ⇄");
      if (prog >= 1) { st.x = x; st.y = y; approve(); return; }
    } else if (st.in) {
      st.in = false;
      setLcd("INSERT CARD");
    }
    st.x = x; st.y = y;
  }

  function up() {
    const st = s.current;
    if (st.mode !== "drag") return;
    st.mode = "fall";
    st.front = true;
    if (st.in) { st.vy = -900; st.vx = (Math.random() - 0.5) * 300; setLcd("SWIPE ACROSS"); } // the reader spits it back out
    st.vr = st.vx * 0.15 + (Math.random() - 0.5) * 120;
    st.in = false;
  }

  if (!show) return null;
  return (
    <div className={`intro-veil fixed inset-0 z-50 touch-none select-none overflow-hidden bg-paper transition-opacity duration-500 ${leaving ? "opacity-0" : ""}`}
      role="dialog" aria-modal="true" aria-label="Welcome to Rebuttal">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_24rem_at_50%_20%,color-mix(in_oklch,var(--brand-to)_14%,transparent),transparent_70%)]" />
      <div className="absolute left-1/2 top-1/2" style={{ perspective: "1100px" }}>
        <div className="relative" style={{ transform: `scale(${scale})` }}>
          {/* the card */}
          <div ref={card} tabIndex={0} role="button" aria-label="Rebuttal card. Drag it into the reader and swipe it across, or press Enter."
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); approve(); } }}
            className="absolute left-0 top-0 cursor-grab touch-none rounded-[18px] active:cursor-grabbing"
            style={{ width: CW, height: CH, transform: `translate(-50%,-50%) translate(${HOME.x}px,${HOME.y}px)`, transformStyle: "preserve-3d" }}>
            <CardFace />
          </div>
          {/* the reader */}
          <div aria-hidden className="absolute z-[2] rounded-2xl border border-rule bg-gradient-to-b from-white to-[#e7eaf0] shadow-[0_24px_48px_-20px_rgba(16,24,40,0.35),inset_0_1px_0_#fff]"
            style={{ width: RW, height: RH, left: -RW / 2, top: SLOT }}>
            <div className="absolute inset-x-6 -top-1 h-2.5 rounded-full bg-gradient-to-b from-[#1b2230] to-[#3a4252] shadow-[inset_0_2px_3px_rgba(0,0,0,0.6)]" />
            <div className="absolute inset-x-5 top-6 flex justify-between">
              {[0, 1].map((i) => <div key={i} className="flex gap-1">{Array.from({ length: 9 }, (_, j) => <span key={j} className="h-3 w-0.5 rounded bg-[#c3c8d2]" />)}</div>)}
            </div>
            <div className="absolute left-1/2 top-[58px] flex h-14 w-56 -translate-x-1/2 items-center justify-center rounded-lg bg-[#0d1117] shadow-[inset_0_2px_6px_rgba(0,0,0,0.8)]">
              <span className={`font-mono text-lg tracking-[0.2em] ${lcd === "APPROVED" ? "text-[#4ade80] [text-shadow:0_0_10px_#4ade80]" : lcd === "TRY AGAIN" || lcd === "SWIPE ACROSS" ? "text-[#fbbf24] [text-shadow:0_0_10px_#fbbf24]" : "text-[#7dd3fc] [text-shadow:0_0_10px_#38bdf8]"}`}>{lcd}</span>
            </div>
            <span className={`absolute right-7 top-[78px] size-3 rounded-full ${lcd === "APPROVED" ? "bg-[#4ade80] shadow-[0_0_10px_#4ade80]" : "animate-pulse bg-act shadow-[0_0_8px_var(--act)]"}`} />
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.3em] text-faint">Dispute desk · reader</span>
          </div>
        </div>
      </div>
      <p className="absolute inset-x-4 bottom-[12vh] text-center text-base text-graphite">
        Hold the card, drop it into the reader and <span className="font-semibold text-ink">swipe it across</span> to enter.
      </p>
      <button type="button" onClick={finish} className="absolute bottom-6 right-6 rounded-lg px-3 py-2 text-sm text-graphite hover:bg-sunk hover:text-ink">Skip</button>
    </div>
  );
}

function CardFace() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[18px] text-white shadow-[0_30px_60px_-24px_rgba(16,24,40,0.55),inset_0_1px_0_rgba(255,255,255,0.18)]"
      style={{ background: "radial-gradient(120% 90% at 100% 0%, color-mix(in oklch, var(--brand-to) 70%, transparent), transparent 55%), linear-gradient(135deg, oklch(0.32 0.12 264), oklch(0.17 0.04 265))" }}>
      {/* sheen that slides as the card tilts */}
      <div className="pointer-events-none absolute inset-0 opacity-60 mix-blend-soft-light"
        style={{ background: "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.7) 45%, transparent 60%)", backgroundSize: "250% 100%", backgroundPosition: "calc(50% + var(--ry, 0) * 3%) 0" }} />
      <div className="relative flex h-full flex-col justify-between p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-brand-from to-brand-to text-sm font-bold shadow">R</span>
            <span className="text-[15px] font-semibold tracking-tight">Rebuttal AI</span>
          </div>
          <span className="text-[9px] font-semibold uppercase tracking-[0.25em] text-white/60">Dispute desk</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="relative h-8 w-11 rounded-md bg-gradient-to-br from-[#f3dc9a] via-[#c9a54e] to-[#f0d58a] shadow-inner">
            <span className="absolute inset-x-0 top-1/2 h-px bg-black/25" />
            <span className="absolute inset-y-0 left-1/3 w-px bg-black/25" />
            <span className="absolute inset-y-0 left-2/3 w-px bg-black/25" />
          </span>
          <svg viewBox="0 0 24 24" className="size-5 text-white/70" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M8 8.5a5 5 0 0 1 0 7M11.5 6a8.5 8.5 0 0 1 0 12M15 3.5a12 12 0 0 1 0 17" />
          </svg>
        </div>
        <p className="whitespace-nowrap font-mono text-[17px] tracking-[0.12em] [text-shadow:0_1px_1px_rgba(0,0,0,0.4)]">2026 1112 0000 0010</p>
        <div className="flex items-end justify-between text-[10px] uppercase">
          <div><span className="block text-[8px] tracking-widest text-white/55">Cardholder</span><span className="font-semibold tracking-wider">Hackathon judge</span></div>
          <div><span className="block text-[8px] tracking-widest text-white/55">Valid thru</span><span className="font-mono tracking-wider">12/26</span></div>
          <span className="text-[8px] tracking-widest text-white/55">Synthetic</span>
        </div>
      </div>
    </div>
  );
}
