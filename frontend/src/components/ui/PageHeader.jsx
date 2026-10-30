import { TextReveal } from '@/components/motion/Reveal';
import { motion } from 'framer-motion';

/** Standard page masthead: eyebrow, oversized display title, actions. */
export default function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="mb-10 flex flex-col gap-5 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && (
          <motion.p
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="eyebrow mb-3"
          >
            {eyebrow}
          </motion.p>
        )}
        <TextReveal as="h1" text={title} className="display-xl text-4xl sm:text-5xl" stagger={0.04} />
        {description && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.6 }}
            className="mt-4 max-w-2xl text-neutral-400"
          >
            {description}
          </motion.p>
        )}
      </div>
      {actions && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex flex-wrap gap-2"
        >
          {actions}
        </motion.div>
      )}
    </header>
  );
}
