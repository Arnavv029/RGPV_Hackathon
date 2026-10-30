import { Facebook, Instagram, Linkedin, Mail, Twitter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import Logo from '@/components/brand/Logo';
import { Marquee, Reveal } from '@/components/motion/Reveal';

/**
 * Every link here resolves to a real route or an on-page section — no dead
 * anchors. Anything not built yet is stated plainly rather than linked.
 */
const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Find a station', to: '/app' },
      { label: 'My bookings', to: '/app/bookings' },
      { label: 'Emergency SOS', to: '/app/emergency' },
      { label: 'List your station', to: '/login?mode=register&role=owner' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { label: 'How it works', href: '#how' },
      { label: 'Benefits', href: '#benefits' },
      { label: 'The network', href: '#network' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Log in', to: '/login' },
      { label: 'Sign up', to: '/login?mode=register' },
      { label: 'For mechanics', to: '/login?mode=register&role=mechanic' },
      { label: 'Contact support', href: 'mailto:support@hapticev.in' },
    ],
  },
];

const SOCIALS = [
  { Icon: Instagram, label: 'Instagram' },
  { Icon: Twitter, label: 'X' },
  { Icon: Linkedin, label: 'LinkedIn' },
  { Icon: Facebook, label: 'Facebook' },
];

export default function Footer() {
  return (
    <footer className="relative mt-32 overflow-hidden border-t border-line bg-ink-900">
      {/* Scrolling brand statement */}
      <Marquee speed={38} className="border-b border-line py-5">
        {['Charge without the wait', 'Book in 2 minutes', 'QR check-in', '24/7 roadside help'].map((t, i) => (
          <span key={`${t}-${i}`} className="flex items-center gap-6 px-6">
            <span className="font-display text-sm font-bold uppercase tracking-[0.2em] text-neutral-600">{t}</span>
            <span className="size-1.5 rounded-full bg-amber-400/60" />
          </span>
        ))}
      </Marquee>

      <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_2fr]">
          <Reveal>
            <Logo />
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-neutral-500">
              HapticEV connects EV drivers, charging-station owners and mechanics on one network.
            </p>
            <a
              href="mailto:support@hapticev.in"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-bone transition-colors hover:text-amber-300"
            >
              <Mail className="size-4" />
              support@hapticev.in
            </a>
          </Reveal>

          <div className="grid gap-10 sm:grid-cols-3">
            {COLUMNS.map((col, ci) => (
              <Reveal key={col.title} delay={ci * 0.08}>
                <h4 className="mb-5 text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-500">{col.title}</h4>
                <ul className="space-y-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {l.to ? (
                        <Link
                          to={l.to}
                          className="group inline-flex items-center gap-2 text-sm text-neutral-400 transition-colors hover:text-bone"
                        >
                          <span className="h-px w-0 bg-amber-400 transition-all duration-300 group-hover:w-4" />
                          {l.label}
                        </Link>
                      ) : (
                        <a
                          href={l.href}
                          className="group inline-flex items-center gap-2 text-sm text-neutral-400 transition-colors hover:text-bone"
                        >
                          <span className="h-px w-0 bg-amber-400 transition-all duration-300 group-hover:w-4" />
                          {l.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Oversized wordmark lockup */}
        <Reveal delay={0.1}>
          <div className="mt-20 select-none border-t border-line pt-10">
            <h2 className="display-xl text-center text-[16vw] leading-[0.8] text-ink-700 sm:text-[13vw]">HapticEV</h2>
          </div>
        </Reveal>

        <div className="mt-10 flex flex-col items-center justify-between gap-6 border-t border-line pt-8 md:flex-row">
          <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
            © {new Date().getFullYear()} HapticEV. All rights reserved.
          </p>
          <div className="flex gap-2">
            {SOCIALS.map(({ Icon, label }) => (
              <button
                key={label}
                aria-label={label}
                onClick={() => toast(`Our ${label} page isn't live yet.`)}
                className="grid size-10 place-items-center rounded-full border border-line text-neutral-500 transition-all duration-300 hover:-translate-y-1 hover:border-amber-400/40 hover:text-amber-300"
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
