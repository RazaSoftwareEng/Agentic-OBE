'use client';

import { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';

const TOTAL_MS = 3400;

/**
 * One-time "doors opening" welcome shown right after sign-in.
 * Sequence: medallion + greeting rise in → a line of light appears at the seam →
 * the two panelled doors swing open in 3D while the blurred dashboard comes into focus.
 * Click / Esc skips it; reduced-motion users get a very short fade.
 */
export function WelcomeGate({ name, university }: { name: string; university: string }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    document.cookie = 'obe_welcome=; Max-Age=0; path=/'; // play once
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setShow(false), reduced ? 500 : TOTAL_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShow(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!show) return null;
  const firstName = name.replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, '').split(/\s+/)[0];

  return (
    <div
      className="welcome-overlay fixed inset-0 z-[100] cursor-pointer overflow-hidden [perspective:2200px]"
      onClick={() => setShow(false)}
      role="presentation"
      aria-label="Welcome animation — click to skip"
    >
      {/* the dashboard behind starts blurred and comes into focus as the doors open */}
      <div className="welcome-focus absolute inset-0 backdrop-blur-md" />
      {/* soft light spilling through the opening */}
      <div className="welcome-glow pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_45%_70%_at_50%_50%,rgba(255,236,179,0.55),rgba(129,140,248,0.18)_45%,transparent_75%)]" />

      <Door side="left" />
      <Door side="right" />

      {/* line of light at the seam, just before the doors part */}
      <div className="welcome-seam pointer-events-none absolute inset-y-0 left-1/2 z-10 w-[3px] -translate-x-1/2 bg-gradient-to-b from-transparent via-amber-100 to-transparent shadow-[0_0_24px_6px_rgba(253,230,138,0.65)]" />

      {/* greeting */}
      <div className="welcome-title pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
        <div className="flex flex-col items-center rounded-[2rem] bg-indigo-950/85 px-8 py-10 text-center text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-white/10 backdrop-blur-xl sm:px-14">
        <div className="relative">
          <div className="absolute inset-0 -m-6 rounded-full bg-amber-300/25 blur-2xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 shadow-[0_18px_45px_-10px_rgba(0,0,0,0.6),inset_0_2px_6px_rgba(255,255,255,0.6)] ring-[6px] ring-white/10">
            <GraduationCap className="h-11 w-11 text-indigo-950" strokeWidth={2.2} />
          </div>
        </div>
        <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.4em] text-amber-200/90">{university}</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight [text-shadow:0_6px_30px_rgba(0,0,0,0.45)] sm:text-6xl">
          Welcome, <span className="bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">{firstName}</span>
        </h1>
        <p className="mt-3 text-sm text-indigo-100/80 sm:text-base">Opening your OBE workspace…</p>
        </div>
      </div>

      <p className="welcome-title pointer-events-none absolute inset-x-0 bottom-6 z-20 text-center text-xs text-white/45">Click or press Esc to skip</p>
    </div>
  );
}

function Door({ side }: { side: 'left' | 'right' }) {
  const left = side === 'left';
  return (
    <div
      className={`welcome-door ${left ? 'welcome-door-left left-0' : 'welcome-door-right right-0'} absolute inset-y-0 w-1/2 [backface-visibility:hidden] [will-change:transform]`}
      style={{
        transformOrigin: left ? 'left center' : 'right center',
        boxShadow: left ? '18px 0 50px -10px rgba(0,0,0,0.55)' : '-18px 0 50px -10px rgba(0,0,0,0.55)',
      }}
    >
      {/* door body */}
      <div className={`absolute inset-0 ${left ? 'bg-gradient-to-br' : 'bg-gradient-to-bl'} from-indigo-950 via-indigo-900 to-slate-950`} />
      {/* soft vertical sheen */}
      <div className={`absolute inset-0 ${left ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-white/[0.07] via-transparent to-black/20`} />

      {/* raised panel moulding */}
      <div className="absolute inset-[7%_12%] flex flex-col gap-[4%]">
        <div className="flex-[3] rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent shadow-[inset_0_2px_0_rgba(255,255,255,0.06),inset_0_-12px_24px_rgba(0,0,0,0.35),0_10px_30px_-12px_rgba(0,0,0,0.6)]" />
        <div className="flex-[2] rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent shadow-[inset_0_2px_0_rgba(255,255,255,0.06),inset_0_-12px_24px_rgba(0,0,0,0.35),0_10px_30px_-12px_rgba(0,0,0,0.6)]" />
      </div>

      {/* gold trim along the meeting edge */}
      <div className={`absolute inset-y-0 ${left ? 'right-0' : 'left-0'} w-1.5 bg-gradient-to-b from-amber-200/70 via-amber-400/80 to-amber-200/70`} />

      {/* handle */}
      <div
        className={`absolute top-[74%] h-20 w-3 -translate-y-1/2 rounded-full bg-gradient-to-b from-amber-200 via-amber-400 to-amber-700 shadow-[0_6px_14px_rgba(0,0,0,0.55)] ${left ? 'right-[6%]' : 'left-[6%]'}`}
      />

      {/* shading that deepens as the door swings away */}
      <div className="welcome-shade absolute inset-0 bg-black opacity-0" />
    </div>
  );
}
