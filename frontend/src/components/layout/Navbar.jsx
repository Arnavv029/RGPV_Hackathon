import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarClock,
  Crown,
  Inbox,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  PlusCircle,
  ScanLine,
  Siren,
  SlidersHorizontal,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { fullName, initials } from '@/lib/format';
import Button from '@/components/ui/Button';
import { Magnetic } from '@/components/motion/Reveal';
import ThemeToggle, { ThemeToggleRow } from '@/components/ui/ThemeToggle';
import Logo from '@/components/brand/Logo';

const LINKS = {
  user: [
    { to: '/app', label: 'Charging stations', icon: MapPinned, end: true },
    { to: '/app/bookings', label: 'My bookings', icon: CalendarClock },
    { to: '/app/emergency', label: 'Emergency', icon: Siren, danger: true },
  ],
  owner: [
    { to: '/owner', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/owner/membership', label: 'Membership', icon: Crown },
    { to: '/owner/requests', label: 'Requests', icon: Inbox },
    { to: '/owner/slots', label: 'Slots', icon: SlidersHorizontal },
    { to: '/owner/scanner', label: 'Scan QR', icon: ScanLine },
    { to: '/owner/stations/new', label: 'Add station', icon: PlusCircle },
  ],
  mechanic: [{ to: '/mechanic', label: 'Dashboard', icon: Wrench, end: true }],
};

/**
 * Signed-out visitors get no section links — the landing page is a single
 * scroll and the only actions that matter are Log in / Sign up.
 */
const MARKETING = [];

/** Nav link with an underline that wipes in from the left. */
function NavItem({ to, label, end, danger, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `group relative py-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors duration-300 ${
          isActive ? 'text-bone' : danger ? 'text-rose-300 hover:text-rose-300' : 'text-neutral-400 hover:text-bone'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {label}
          <span
            className={`absolute -bottom-0.5 left-0 h-px w-full origin-left bg-amber-400 transition-transform duration-400 ${
              isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
            }`}
          />
        </>
      )}
    </NavLink>
  );
}

export default function Navbar() {
  const { user, logout, isAuthenticated, homePath } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = isAuthenticated ? LINKS[user.role] || LINKS.user : MARKETING;

  // The landing hero is a dark poster in both themes, so while the bar floats
  // over it (before any scrolling) its chrome renders light.
  const overDarkHero = pathname === '/' && !scrolled;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <motion.header
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className={`sticky top-0 z-[600] transition-all duration-500 ${
          scrolled ? 'border-b border-line bg-ink-950/90 backdrop-blur-xl' : 'border-b border-transparent'
        } ${overDarkHero ? 'on-dark' : ''}`}
      >
        <nav className="mx-auto flex h-20 max-w-[1400px] items-center justify-between gap-6 px-5 sm:px-8">
          <Logo to={isAuthenticated ? homePath : '/'} />

          <div className="hidden items-center gap-8 lg:flex">
            {links.map((l) =>
              l.to.includes('#') ? (
                <a
                  key={l.to}
                  href={l.to.replace('/', '')}
                  className="group relative py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400 transition-colors hover:text-bone"
                >
                  {l.label}
                  <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-amber-400 transition-transform duration-300 group-hover:scale-x-100" />
                </a>
              ) : (
                <NavItem key={l.to} {...l} />
              ),
            )}
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle className="hidden sm:grid" />
            {isAuthenticated ? (
              <div className="hidden items-center gap-3 lg:flex">
                <div className="flex items-center gap-2.5 rounded-full border border-line py-1 pl-1 pr-4">
                  <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-[11px] font-bold text-on-accent">
                    {initials(user)}
                  </span>
                  <div className="leading-tight">
                    <div className="max-w-32 truncate text-xs font-semibold text-bone">{fullName(user)}</div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">{user.role}</div>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  aria-label="Sign out"
                  className="grid size-10 place-items-center rounded-full border border-line text-neutral-400 transition-colors hover:border-rose-500/40 hover:text-rose-300"
                >
                  <LogOut className="size-4" />
                </button>
              </div>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Button to="/login" variant="ghost" size="md" caps>
                  Log in
                </Button>
                <Magnetic strength={0.25}>
                  <Button to="/login?mode=register" size="md" caps>
                    Sign up
                  </Button>
                </Magnetic>
              </div>
            )}

            <button
              className="grid size-11 place-items-center rounded-full border border-line text-bone transition-colors hover:border-amber-400/50 lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={open}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </nav>
      </motion.header>

      {/* Full-screen mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ clipPath: 'circle(0% at 92% 5%)' }}
            animate={{ clipPath: 'circle(150% at 92% 5%)' }}
            exit={{ clipPath: 'circle(0% at 92% 5%)' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[590] bg-ink-950 lg:hidden"
          >
            <div className="grid-fade absolute inset-0 opacity-60" />
            <div className="relative flex h-full flex-col justify-center px-8 pt-20">
              <motion.ul
                initial="hidden"
                animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.18 } } }}
                className="space-y-2"
              >
                {links.map((l) => (
                  <motion.li
                    key={l.to}
                    variants={{ hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0 } }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {l.to.includes('#') ? (
                      <a
                        href={l.to.replace('/', '')}
                        onClick={() => setOpen(false)}
                        className="block font-display text-4xl font-bold uppercase text-bone"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <NavLink
                        to={l.to}
                        end={l.end}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          `block font-display text-4xl font-bold uppercase ${isActive ? 'text-amber-300' : 'text-bone'}`
                        }
                      >
                        {l.label}
                      </NavLink>
                    )}
                  </motion.li>
                ))}
              </motion.ul>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="mt-12 space-y-3"
              >
                <ThemeToggleRow />
                {isAuthenticated ? (
                  <Button variant="secondary" block size="lg" onClick={handleLogout}>
                    <LogOut className="size-4" /> Sign out
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <Button to="/login?mode=register" block size="lg" caps>
                      Sign up
                    </Button>
                    <Button to="/login" variant="secondary" block size="lg" caps>
                      Log in
                    </Button>
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
