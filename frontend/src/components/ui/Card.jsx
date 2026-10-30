import { motion } from 'framer-motion';

/** Solid raised surface. `interactive` adds a spring lift and amber edge. */
export default function Card({ interactive = false, className = '', children, ...rest }) {
  const cls = [
    'glass rounded-3xl',
    interactive
      ? 'glass-hover hover:border-amber-400/35 hover:shadow-[0_28px_70px_-32px_rgba(245,173,63,0.55)]'
      : '',
    className,
  ].join(' ');

  if (!interactive) {
    return (
      <div className={cls} {...rest}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      className={cls}
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
