import { motion } from 'framer-motion';
import { useState } from 'react';

/**
 * The annotated product shot from the design: pulsing hotspots over a photo,
 * each with a leader line and a label that draws itself in on scroll.
 * Hovering (or focusing) a dot highlights its callout.
 */
const EASE = [0.22, 1, 0.36, 1];

export default function Hotspots({ image, points, className = '' }) {
  const [active, setActive] = useState(null);

  return (
    <div className={`relative ${className}`}>
      <motion.div
        initial={{ clipPath: 'inset(0% 0% 100% 0%)' }}
        whileInView={{ clipPath: 'inset(0% 0% 0% 0%)' }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 1.1, ease: EASE }}
        className="overflow-hidden rounded-[28px]"
      >
        <motion.img
          src={image}
          alt="EV charging station"
          initial={{ scale: 1.2 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 1.6, ease: EASE }}
          className="h-full w-full object-cover"
        />
      </motion.div>

      {/* Callouts */}
      {points.map((p, i) => {
        const isActive = active === i;
        const flip = p.x > 50; // label sits to the left when the dot is right-of-centre
        return (
          <div
            key={p.label}
            className="absolute"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            {/* Dot */}
            <motion.button
              type="button"
              aria-label={p.label}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              initial={{ scale: 0, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 + i * 0.12, type: 'spring', stiffness: 300, damping: 18 }}
              className="relative -ml-2 -mt-2 grid size-4 cursor-pointer place-items-center"
            >
              <span
                className={`absolute inset-0 rounded-full transition-all duration-300 ${
                  isActive ? 'bg-amber-400/50 scale-[2.2]' : 'bg-amber-400/25 scale-150'
                }`}
              />
              <span className="absolute inset-0 animate-ping-slow rounded-full bg-amber-400/40" />
              <span
                className={`relative size-2.5 rounded-full border-2 border-ink-950 transition-colors duration-300 ${
                  isActive ? 'bg-amber-300' : 'bg-amber-400'
                }`}
              />
            </motion.button>

            {/* Leader line + label */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.7 + i * 0.12, duration: 0.5 }}
              className={`absolute top-0 flex items-center gap-2 ${flip ? 'right-3 flex-row-reverse' : 'left-3'}`}
            >
              <motion.span
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.7 + i * 0.12, duration: 0.5, ease: EASE }}
                className={`block h-px w-8 bg-amber-400/70 sm:w-12 ${flip ? 'origin-right' : 'origin-left'}`}
              />
              <span
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] backdrop-blur-md transition-all duration-300 sm:text-[11px] ${
                  isActive
                    ? 'border-amber-400/60 bg-amber-400 text-on-accent'
                    : 'border-line-2 bg-ink-950/75 text-bone'
                }`}
              >
                {p.label}
              </span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
