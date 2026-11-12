"use client";
// First-visit intro on the home page: swipe the Rebuttal card through the reader to enter (3D scene in intro-scene.tsx,
// loaded only when the intro shows). Shown once per browser; "/?intro=1" replays it. Skip, Esc, or Enter on the card
// get straight in. Without WebGL it steps aside.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

export const INTRO_KEY = "rebuttal-entered";
const IntroScene = dynamic(() => import("./intro-scene"), { ssr: false });

function webgl() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

export default function Intro() {
  const [show, setShow] = useState(true); // server-rendered; CSS hides it unless <html data-intro> (set before paint)
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [auto, setAuto] = useState(0);

  const finish = useCallback(() => {
    try { localStorage.setItem(INTRO_KEY, "1"); } catch {}
    delete document.documentElement.dataset.intro;
    if (location.search.includes("intro=1")) history.replaceState(null, "", "/");
    setShow(false);
  }, []);
  const approved = useCallback(() => { setLeaving(true); setTimeout(finish, 600); }, [finish]);

  useEffect(() => {
    if (!document.documentElement.dataset.intro || !webgl()) { delete document.documentElement.dataset.intro; setShow(false); return; }
    setReady(true);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [finish]);

  if (!show) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome to Rebuttal"
      className={`intro-veil fixed inset-0 z-50 select-none bg-[#f8f6f3] transition-opacity duration-500 ${leaving ? "opacity-0" : ""}`}>
      <div className="absolute inset-0">{ready && <IntroScene auto={auto} onApproved={approved} />}</div>
      <button type="button" aria-label="Rebuttal card: drag it into the reader and swipe it along, or press Enter to swipe it for you."
        onClick={() => setAuto((n) => n + 1)} className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Swipe the card for me
      </button>
      <p className="intro-hint pointer-events-none absolute inset-x-4 bottom-[13vh] text-center text-base">Swipe the card to enter</p>
      <button type="button" onClick={finish} className="absolute bottom-6 right-6 rounded-lg px-3 py-2 text-sm text-graphite hover:text-ink">Skip</button>
    </div>
  );
}
