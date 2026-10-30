import { Toaster } from 'sonner';
import { useTheme } from '@/hooks/useTheme';

/** Toasts that follow the active theme instead of being locked to dark. */
export default function ThemedToaster() {
  const { theme, isDark } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="top-right"
      richColors
      toastOptions={{
        style: {
          background: isDark ? '#101013' : '#ffffff',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.09)' : 'rgba(20,19,15,0.12)'}`,
          color: isDark ? '#f6f5f2' : '#14130f',
          borderRadius: '16px',
        },
      }}
    />
  );
}
