import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

const EASE = [0.22, 1, 0.36, 1];

/* ── Scroll reveal ──────────────────────────────────────────────────────── */

/** Fades + lifts children into view once, as they scroll on-screen. */
export function Reveal({ children, delay = 0, y = 28, className = '', as = 'div' }) {
  const Comp = motion[as] || motion.div;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </Comp>
  );
}

/**
 * Headline that animates word-by-word out of a clipping mask — the move that
 * makes oversized editorial type feel deliberate rather than merely big.
 */
export function TextReveal({ text, className = '', as: Tag = 'h2', delay = 0, stagger = 0.055 }) {
  const words = String(text).split(' ');
  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <motion.span
        aria-hidden
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-15%' }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: stagger, delayChildren: delay } } }}
        className="inline"
      >
        {words.map((word, i) => (
          <span key={`${word}-${i}`} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <motion.span
              className="inline-block"
              variants={{
                hidden: { y: '110%', opacity: 0, rotateX: 40 },
                show: { y: '0%', opacity: 1, rotateX: 0, transition: { duration: 0.85, ease: EASE } },
              }}
            >
              {word}
              {i < words.length - 1 ? ' ' : ''}
            </motion.span>
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}

/** Parent that staggers its <StaggerItem> children on mount. */
export function Stagger({ children, className = '', gap = 0.07, whileInView = false }) {
  const trigger = whileInView
    ? { whileInView: 'show', viewport: { once: true, margin: '-60px' } }
    : { animate: 'show' };
  return (
    <motion.div
      className={className}
      initial="hidden"
      {...trigger}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = '', y = 22 }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Cross-fades routed pages. */
export function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ── Scroll-linked motion ───────────────────────────────────────────────── */

/**
 * Moves a layer at a different rate to the page as it scrolls.
 * `speed` > 0 drifts down, < 0 drifts up.
 */
export function Parallax({ children, speed = 0.25, className = '' }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const raw = useTransform(scrollYProgress, [0, 1], [`${-speed * 100}%`, `${speed * 100}%`]);
  const y = useSpring(raw, { stiffness: 120, damping: 30, mass: 0.4 });
  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y }} className="h-full w-full">
        {children}
      </motion.div>
    </div>
  );
}

/** Thin amber progress bar pinned to the top of the viewport. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 260, damping: 40, restDelta: 0.001 });
  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[900] h-0.5 origin-left bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500"
    />
  );
}

/**
 * Image that unmasks upward while its content scales back to 1 — gives photos
 * a sense of being revealed rather than popped in.
 */
export function ImageReveal({ src, alt = '', className = '', imgClassName = '', parallax = 0 }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [`${-parallax * 60}px`, `${parallax * 60}px`]);

  return (
    <motion.div
      ref={ref}
      className={`overflow-hidden ${className}`}
      initial={{ clipPath: 'inset(100% 0% 0% 0%)' }}
      whileInView={{ clipPath: 'inset(0% 0% 0% 0%)' }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 1.05, ease: EASE }}
    >
      <motion.div
        className="h-full w-full"
        style={parallax ? { y } : undefined}
        initial={{ scale: 1.25 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 1.4, ease: EASE }}
      >
        <img src={src} alt={alt} loading="lazy" className={`h-full w-full object-cover ${imgClassName}`} />
      </motion.div>
    </motion.div>
  );
}

/* ── Interaction ────────────────────────────────────────────────────────── */

/** Element that leans toward the cursor and springs back on leave. */
export function Magnetic({ children, strength = 0.35, className = '' }) {
  const ref = useRef(null);
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.35 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.35 });

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div ref={ref} onMouseMove={onMove} onMouseLeave={reset} style={{ x, y }} className={className}>
      {children}
    </motion.div>
  );
}

/** Card that tilts in 3D toward the cursor, with a light sheen that follows it. */
export function TiltCard({ children, className = '', max = 9, glare = true }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(1000px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max}deg) translateY(-6px)`;
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  };
  const reset = () => {
    ref.current.style.transform = '';
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      className={`group relative transition-transform duration-300 ease-out will-change-transform ${className}`}
    >
      {glare && (
        <div
          className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: 'radial-gradient(420px circle at var(--mx) var(--my), rgba(245,173,63,0.14), transparent 45%)',
          }}
        />
      )}
      {children}
    </div>
  );
}

/* ── Numbers & marquee ──────────────────────────────────────────────────── */

/** Counts up to `value` the first time it scrolls into view. */
export function Counter({ value, duration = 1.6, decimals = 0, prefix = '', suffix = '', className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const mv = useMotionValue(0);
  const [shown, setShown] = useState('0');

  useMotionValueEvent(mv, 'change', (v) => setShown(v.toFixed(decimals)));
  useEffect(() => {
    if (inView) {
      const controls = animate(mv, Number(value) || 0, { duration, ease: EASE });
      return controls.stop;
    }
    return undefined;
  }, [inView, value, duration, mv]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {shown}
      {suffix}
    </span>
  );
}

/** Seamless infinite marquee; the row is duplicated and shifted by exactly 50%. */
export function Marquee({ children, speed = 40, className = '', pauseOnHover = true }) {
  return (
    <div className={`group relative flex overflow-hidden ${className}`}>
      <div
        className={`flex w-max animate-marquee items-center ${pauseOnHover ? 'group-hover:[animation-play-state:paused]' : ''}`}
        style={{ animationDuration: `${speed}s` }}
      >
        {children}
        {children}
      </div>
    </div>
  );
}
