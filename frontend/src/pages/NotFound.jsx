import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

export default function NotFound() {
  const { isAuthenticated, homePath } = useAuth();
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <motion.div
          initial={{ rotate: -20, scale: 0.6, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12 }}
          className="mx-auto grid size-20 place-items-center rounded-3xl border border-amber-400/25 bg-amber-500/10"
        >
          <Zap className="size-9 text-amber-300" />
        </motion.div>
        <h1 className="mt-6 font-display text-6xl font-semibold">404</h1>
        <p className="mt-2 text-neutral-400">This page ran out of charge.</p>
        <Button className="mt-8" to={isAuthenticated ? homePath : '/'}>
          Take me home
        </Button>
      </div>
    </div>
  );
}
