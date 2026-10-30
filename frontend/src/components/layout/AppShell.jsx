import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Spinner } from '@/components/ui/Feedback';
import { ScrollProgress } from '@/components/motion/Reveal';
import Navbar from './Navbar';
import Footer from './Footer';

/** Chrome for every page: scroll bar, sticky nav, content column, footer. */
export default function AppShell({ wide = false }) {
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollProgress />
      <Navbar />
      <main
        className={wide ? 'w-full flex-1' : 'mx-auto w-full max-w-[1400px] flex-1 px-5 pt-10 sm:px-8'}
      >
        <Suspense fallback={<Spinner className="min-h-[50vh]" />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
