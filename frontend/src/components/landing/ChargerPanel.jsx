import { motion, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * The charging-point display: what a driver sees on the unit mid-session —
 * battery percentage, elapsed time, power draw, energy delivered and the range
 * that adds up to.
 *
 * The numbers here are an illustration for the marketing page (badged "Example
 * session"), not a live feed. The real equivalent is the booking ticket at
 * /app/bookings/:id, which renders actual session data from the API.
 */
export default function ChargerPanel({ className = '', compact = false }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const [pct, setPct] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Ramp the percentage, then hold — reads as a session in progress.
  useEffect(() => {
    if (!inView) return undefined;
    const target = 78;
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const t = Math.min((now - start) / 1800, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setPct(Math.round(eased * target));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView]);

  useEffect(() => {
    if (!inView) return undefined;
    const id = setInterval(() => setElapsed((e) => (e + 1) % 3600), 1000);
    return () => clearInterval(id);
  }, [inView]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const R = 48;
  const circumference = 2 * Math.PI * R;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40, rotateX: 18 }}
      animate={inView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformPerspective: 1400 }}
      className={`relative overflow-hidden rounded-[26px] border border-line bg-ink-900 p-5 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)] ${className}`}
    >
      {/* Screen glow */}
      <div className="pointer-events-none absolute -left-10 -top-16 size-48 rounded-full bg-amber-400/12 blur-3xl" />

      <div className="relative flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500">EV Charging</span>
        {/* Illustrative, not real telemetry — say so rather than implying a
            live feed on a marketing page. */}
        <span className="rounded-full border border-line px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-neutral-500">
          Example session
        </span>
      </div>

      <div className="relative mt-5 flex items-center gap-4">
        {/* Battery ring */}
        <div className="relative grid size-[112px] shrink-0 place-items-center">
          <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
            <motion.circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke="url(#chargeGrad)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={inView ? { strokeDashoffset: circumference * (1 - 0.78) } : {}}
              transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
            />
            <defs>
              <linearGradient id="chargeGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fcc97b" />
                <stop offset="100%" stopColor="#e5941c" />
              </linearGradient>
            </defs>
          </svg>
          <div className="text-center">
            <div className="font-display text-[30px] font-bold leading-none text-bone">
              {pct}
              <span className="text-lg text-amber-300">%</span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-neutral-500">{mm}:{ss}</div>
          </div>
        </div>

        {/* Session stats */}
        <div className="min-w-0 flex-1 space-y-2.5">
          {[
            ['Charging power', '98 kW'],
            ['Energy delivered', '36.5 kWh'],
            ['Range added', '142 km'],
          ].map(([k, v], i) => (
            <motion.div
              key={k}
              initial={{ opacity: 0, x: 16 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.4 + i * 0.12, duration: 0.5 }}
              className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0"
            >
              <span className="text-[10px] uppercase leading-tight tracking-wider text-neutral-500">{k}</span>
              <span className="shrink-0 text-sm font-semibold text-bone">{v}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {!compact && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.9 }}
          className="relative mt-5 flex items-end gap-1"
        >
          {/* Power draw sparkline */}
          {[38, 52, 44, 68, 74, 61, 83, 92, 78, 86, 70, 64].map((h, i) => (
            <motion.span
              key={i}
              className="flex-1 rounded-sm bg-gradient-to-t from-amber-600/40 to-amber-400"
              initial={{ height: 2 }}
              animate={inView ? { height: h * 0.45 } : {}}
              transition={{ delay: 0.9 + i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
