import { motion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BatteryCharging,
  Building2,
  PlugZap,
  Siren,
  Wrench,
} from 'lucide-react';
import { lazy, Suspense, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';
import {
  Counter,
  ImageReveal,
  Magnetic,
  Marquee,
  Parallax,
  Reveal,
  Stagger,
  StaggerItem,
  TextReveal,
  TiltCard,
} from '@/components/motion/Reveal';
import ChargerPanel from '@/components/landing/ChargerPanel';
import Hotspots from '@/components/landing/Hotspots';
import Faq from '@/components/landing/Faq';

// three.js is heavy — only the one section that uses it pays for it.
const EnergyCore = lazy(() => import('@/components/three/EnergyCore'));

// Connector standards the stations actually list — not car brands, which would
// imply partnerships that don't exist.
const CONNECTORS = [
  'CCS2 · 60 kW',
  'CCS2 · 30 kW',
  'Type 2 AC · 22 kW',
  'Type 2 AC · 7.4 kW',
  'CHAdeMO · 50 kW',
  'Bharat DC-001',
  'Bharat AC-001',
];

// Each role gets a real entry point — previously only drivers had one.
const ROLES = [
  {
    icon: BatteryCharging,
    title: 'Drivers',
    body: 'Car, auto, bike or scooter — find a point, book the hour you need and check in with a QR code.',
    cta: { label: 'Create an account', to: '/login?mode=register' },
  },
  {
    icon: Building2,
    title: 'Station owners',
    body: 'Publish your charger, open slots, set a base rate and approve bookings as they arrive.',
    cta: { label: 'List your station', to: '/login?mode=register&role=owner' },
  },
  {
    icon: Wrench,
    title: 'Mechanics',
    body: 'List your workshop and take roadside SOS jobs from drivers nearby.',
    cta: { label: 'Join as a mechanic', to: '/login?mode=register&role=mechanic' },
  },
];

const BENEFITS = [
  {
    n: '01',
    title: 'Live availability',
    body: 'Every point shows how many slots are still open today, so you never ride or drive to a full charger.',
    image: '/images/stations/mp-nagar.png',
  },
  {
    n: '02',
    title: 'Fair, explained pricing',
    body: 'Rates move with demand and each slot tells you why it costs what it costs before you pay.',
    image: '/images/stations/db-city.png',
  },
  {
    n: '03',
    title: 'QR check-in',
    body: 'Your booking becomes a signed QR ticket. The station scans it and your session starts.',
    image: '/images/stations/arera.png',
  },
];

const STEPS = [
  {
    k: 'Easy plug in',
    body: 'Open the live map of Bhopal, pick the hour that suits you and reserve it in a couple of taps.',
    image: '/images/stations/habibganj.png',
  },
  {
    k: 'Charge smart',
    body: 'Pay securely through Razorpay and watch your session status update from pending to charging.',
    image: '/images/stations/kolar.png',
  },
  {
    k: 'Drive clean',
    body: 'Rate the station afterwards. Your reviews rank the network for every driver who comes next.',
    image: '/images/stations/bittan.png',
  },
];

const HOTSPOTS = [
  { x: 24, y: 22, label: 'Fast & reliable charging' },
  { x: 70, y: 34, label: 'Multiple connectors' },
  { x: 32, y: 58, label: 'Transparent pricing' },
  { x: 74, y: 70, label: '24/7 customer support' },
  { x: 20, y: 84, label: 'Eco-friendly energy' },
];

export default function Landing() {
  const { isAuthenticated, homePath } = useAuth();
  const hero = useRef(null);
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] });

  // Hero parallax: background drifts slower than the headline, which fades out.
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '22%']);
  const bgScale = useTransform(scrollYProgress, [0, 1], [1, 1.15]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);

  const primaryCta = isAuthenticated ? homePath : '/login?mode=register';

  return (
    <div className="-mt-20 overflow-x-clip">
      {/* ══ HERO ═══════════════════════════════════════════════════════════ */}
      <section ref={hero} className="relative min-h-[92vh] overflow-hidden pt-20">
        <motion.div style={{ y: bgY, scale: bgScale }} className="absolute inset-0">
          <video
            className="size-full object-cover"
            src="/videos/ev-hero.mp4"
            poster="/images/ev-hero.jpg"
            autoPlay
            muted
            loop
            playsInline
          />
          {/* Fixed dark scrims: the hero is a dark "poster" in both themes, so the
              headline keeps its contrast whatever the palette is doing. */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#060607]/85 via-[#060607]/55 to-[#060607]/90" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#060607]/90 via-transparent to-[#060607]/60" />
          {/* …and its bottom edge melts into whatever the page colour is. */}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ink-950" />
        </motion.div>
        <div className="grid-fade pointer-events-none absolute inset-0" />

        <motion.div
          style={{ y: copyY, opacity: copyOpacity }}
          className="relative mx-auto flex min-h-[92vh] max-w-[1400px] flex-col justify-center px-5 pb-24 pt-36 sm:px-8"
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mb-7 inline-flex w-fit items-center gap-2.5 rounded-full border border-line-2 bg-hover px-4 py-2 backdrop-blur-md"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-mint-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">
              Live in Bhopal<span className="hidden sm:inline"> · Cars, autos, bikes &amp; scooters</span>
            </span>
          </motion.div>

          {/* The signature oversized headline */}
          <h1 className="display-xl text-[clamp(3.2rem,11vw,10rem)] !text-white">
            <TextReveal as="span" text="Power" className="block" />
            <TextReveal as="span" text="Forward" className="block text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.4)]" delay={0.15} />
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.55 }}
            className="mt-8 max-w-lg text-lg leading-relaxed text-white/75"
          >
            Bhopal's charging network for every electric vehicle — car, auto, bike or scooter. Find a point, book
            the exact hour you need, pay securely and check in with a QR code.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <Magnetic strength={0.3}>
              <Button to={primaryCta} size="lg" caps variant="accent">
                {isAuthenticated ? 'Open dashboard' : 'Create free account'} <ArrowRight className="size-4" />
              </Button>
            </Magnetic>
            <Magnetic strength={0.2}>
              <Button
                to={isAuthenticated ? '/app' : '/login'}
                size="lg"
                variant="secondary"
                caps
                className="!border-white/30 !bg-white/10 !text-white hover:!bg-white/20"
              >
                {isAuthenticated ? 'Find a station' : 'Log in'}
              </Button>
            </Magnetic>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.85 }}
            className="mt-5 text-[11px] uppercase tracking-[0.18em] text-white/50"
          >
            Free to join · Pay only for the slots you book
          </motion.p>

          {/* Floating live-session panel */}
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-28 right-5 hidden w-[370px] animate-float sm:right-8 xl:block"
          >
            <ChargerPanel />
          </motion.div>
        </motion.div>

        {/* Scroll cue */}
        <motion.a
          href="#benefits"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/60 hover:text-amber-300"
        >
          Scroll
          <motion.span animate={{ y: [0, 7, 0] }} transition={{ duration: 1.8, repeat: Infinity }}>
            <ArrowDown className="size-4" />
          </motion.span>
        </motion.a>
      </section>

      {/* ══ BRAND MARQUEE ══════════════════════════════════════════════════ */}
      <section className="border-y border-line bg-ink-900 py-7">
        <Marquee speed={34} className="edge-fade">
          {CONNECTORS.map((c, i) => (
            <span key={`${c}-${i}`} className="flex items-center gap-8 px-8">
              <span className="font-display text-lg font-bold uppercase tracking-[0.1em] text-neutral-600 transition-colors duration-300 hover:text-bone sm:text-xl">
                {c}
              </span>
              <PlugZap className="size-4 shrink-0 text-amber-300/40" />
            </span>
          ))}
        </Marquee>
        <p className="mt-5 text-center text-[10px] uppercase tracking-[0.25em] text-neutral-500">
          Every connector our stations support
        </p>
      </section>

      {/* ══ KEY BENEFITS ═══════════════════════════════════════════════════ */}
      <section id="benefits" className="bg-wash py-28">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <p className="eyebrow mb-5">Key benefits</p>
            </Reveal>
            <TextReveal
              as="h2"
              text="Built for the way you actually charge"
              className="display-xl text-[clamp(2.4rem,6vw,5rem)]"
            />
            <Reveal delay={0.2}>
              <p className="mx-auto mt-6 max-w-xl text-neutral-400">
                Everything between a low battery and a full one — for every EV on Bhopal's roads, from scooters to cars.
              </p>
            </Reveal>
          </div>

          <Stagger whileInView className="mt-20 grid gap-6 md:grid-cols-3" gap={0.12}>
            {BENEFITS.map((b) => (
              <StaggerItem key={b.n}>
                <TiltCard className="h-full">
                  <div className="glass h-full overflow-hidden rounded-[28px]">
                    <div className="relative h-52 overflow-hidden">
                      <img
                        src={b.image}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/30 to-transparent" />
                      <span className="absolute left-5 top-5 font-display text-xs font-bold tracking-[0.2em] text-amber-300">
                        {b.n}
                      </span>
                    </div>
                    <div className="p-7">
                      <h3 className="text-xl uppercase">{b.title}</h3>
                      <p className="mt-3 text-sm leading-relaxed text-neutral-400">{b.body}</p>
                    </div>
                  </div>
                </TiltCard>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ══ ANNOTATED STATION ══════════════════════════════════════════════ */}
      <section id="network" className="py-28">
        <div className="mx-auto grid max-w-[1400px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
          <Hotspots image="/images/ev-hero.jpg" points={HOTSPOTS} className="order-2 lg:order-1" />

          <div className="order-1 lg:order-2">
            <Reveal>
              <p className="eyebrow mb-5">The station</p>
            </Reveal>
            <TextReveal as="h2" text="Every charger, fully specified" className="display-xl text-[clamp(2.2rem,5vw,4.2rem)]" />
            <Reveal delay={0.15}>
              <p className="mt-6 max-w-md leading-relaxed text-neutral-400">
                Connector, power rating, price per hour, live ratings and the exact slots left today — all on the station
                page before you commit. Slow AC points for two-wheelers, DC fast points for cars.
              </p>
            </Reveal>

            <Stagger whileInView className="mt-10 grid grid-cols-2 gap-6" gap={0.1}>
              {[
                { value: 2, suffix: ' min', label: 'To book a slot' },
                { value: 100, suffix: '%', label: 'Refund if you cancel early' },
                { value: 24, suffix: '/7', label: 'Roadside assistance' },
                { value: 30, suffix: ' min', label: 'Free-cancellation window' },
              ].map((s) => (
                <StaggerItem key={s.label}>
                  <div className="border-l border-amber-400/30 pl-5">
                    <div className="font-display text-4xl font-bold text-bone">
                      <Counter value={s.value} suffix={s.suffix} />
                    </div>
                    <div className="mt-1.5 text-[11px] uppercase tracking-[0.15em] text-neutral-500">{s.label}</div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ═══════════════════════════════════════════════════ */}
      <section id="how" className="border-y border-line bg-ink-900 py-28">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <Reveal>
                <p className="eyebrow mb-5">How it works</p>
              </Reveal>
              <TextReveal as="h2" text="Three steps. Two minutes." className="display-xl text-[clamp(2.4rem,6vw,5rem)]" />
            </div>
            <Reveal delay={0.2}>
              <Button to={primaryCta} variant="secondary" caps>
                Get started <ArrowUpRight className="size-4" />
              </Button>
            </Reveal>
          </div>

          <div className="mt-20 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.k}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.8, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                className={i === 1 ? 'md:mt-14' : i === 2 ? 'md:mt-28' : ''}
              >
                <ImageReveal src={s.image} className="aspect-[4/5] rounded-[28px]" imgClassName="transition-transform duration-[1.2s] hover:scale-105" />
                <div className="mt-6 flex items-start gap-4">
                  <span className="mt-1 font-display text-xs font-bold tracking-[0.2em] text-amber-300">
                    0{i + 1}
                  </span>
                  <div>
                    <h3 className="text-xl uppercase">{s.k}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-400">{s.body}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ ENERGY FLOW (3D) ═══════════════════════════════════════════════ */}
      <section className="relative overflow-hidden py-28">
        <Parallax speed={0.15} className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 size-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/[0.07] blur-[120px]" />
        </Parallax>

        <div className="relative mx-auto grid max-w-[1400px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-2">
          <div>
            <Reveal>
              <p className="eyebrow mb-5">Energy flow optimisation</p>
            </Reveal>
            <TextReveal
              as="h2"
              text="Charge when the grid is cheapest"
              className="display-xl text-[clamp(2.4rem,6vw,5.2rem)]"
            />
            <Reveal delay={0.15}>
              <p className="mt-8 border-l-2 border-amber-400 pl-6 font-display text-2xl font-bold uppercase leading-snug text-bone">
                Shift to an off-peak hour and pay less for the same charge.
              </p>
            </Reveal>

            {/* The mechanism, spelled out — the claim is only convincing if you
                can see how the number is reached. */}
            <Stagger whileInView className="mt-10 space-y-px overflow-hidden rounded-2xl border border-line" gap={0.12}>
              {[
                ['Base rate', 'The station owner sets their own hourly price.'],
                ['Demand check', 'We weigh how busy that slot and station are.'],
                ['Your price', 'The live rate is shown with the reason, before you pay.'],
              ].map(([k, v], i) => (
                <StaggerItem key={k}>
                  <div className="flex items-start gap-4 bg-ink-850 px-5 py-4">
                    <span className="font-display text-xs font-bold tracking-[0.2em] text-amber-300">0{i + 1}</span>
                    <div>
                      <div className="text-sm font-semibold text-bone">{k}</div>
                      <div className="mt-0.5 text-sm text-neutral-400">{v}</div>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>

          <div className="relative h-[420px] sm:h-[520px]">
            <div className="absolute inset-[18%] animate-halo rounded-full bg-amber-500/20 blur-3xl" />
            <Suspense fallback={<div className="absolute inset-[30%] animate-pulse rounded-full bg-amber-500/15 blur-2xl" />}>
              <EnergyCore className="absolute inset-0" />
            </Suspense>
          </div>
        </div>
      </section>

      {/* ══ ROLES ══════════════════════════════════════════════════════════
          Replaces the template's testimonial carousel: we have no real reviews
          yet, and invented ones don't belong on a live site. This section does
          more work anyway — owners and mechanics finally get a way in. */}
      <section id="roles" className="border-y border-line bg-ink-900 py-28">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <Reveal>
                <p className="eyebrow mb-5">Who it's for</p>
              </Reveal>
              <TextReveal
                as="h2"
                text="One network, three roles"
                className="display-xl text-[clamp(2.4rem,6vw,5rem)]"
              />
            </div>
            <Reveal delay={0.2}>
              <p className="max-w-sm text-neutral-400">
                Drivers, station owners and mechanics all work from the same live data — so a slot booked on one side shows
                up instantly on the other. Bhopal today; more cities as the network grows.
              </p>
            </Reveal>
          </div>

          <Stagger whileInView className="mt-20 grid gap-6 md:grid-cols-3" gap={0.12}>
            {ROLES.map((r) => (
              <StaggerItem key={r.title}>
                <TiltCard className="h-full">
                  <div className="glass flex h-full flex-col rounded-[28px] p-8">
                    <span className="grid size-12 place-items-center rounded-2xl border border-amber-400/25 bg-amber-400/10">
                      <r.icon className="size-5 text-amber-300" />
                    </span>
                    <h3 className="mt-6 text-2xl uppercase">{r.title}</h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-neutral-400">{r.body}</p>
                    <Link
                      to={r.cta.to}
                      className="group/link mt-7 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-bone"
                    >
                      {r.cta.label}
                      <span className="grid size-7 place-items-center rounded-full border border-line-2 transition-all duration-300 group-hover/link:border-amber-400 group-hover/link:bg-amber-400 group-hover/link:text-on-accent">
                        <ArrowUpRight className="size-3.5" />
                      </span>
                    </Link>
                  </div>
                </TiltCard>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ══ FAQ ════════════════════════════════════════════════════════════ */}
      <section id="faq" className="py-28">
        <div className="mx-auto grid max-w-[1400px] gap-14 px-5 sm:px-8 lg:grid-cols-[1fr_1.3fr]">
          <div className="lg:sticky lg:top-28 lg:h-fit">
            <Reveal>
              <p className="eyebrow mb-5">FAQ</p>
            </Reveal>
            <TextReveal
              as="h2"
              text="Everything you need to know"
              className="display-xl text-[clamp(2.2rem,5vw,4rem)]"
            />
            <ImageReveal
              src="/images/stations/new-market.png"
              className="mt-10 hidden aspect-[4/3] rounded-[28px] lg:block"
              parallax={0.3}
            />
          </div>
          <Faq />
        </div>
      </section>

      {/* ══ CTA ════════════════════════════════════════════════════════════ */}
      <section className="pb-8">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-[36px] border border-amber-400/20 bg-gradient-to-br from-amber-500/15 via-ink-850 to-ink-900 px-8 py-20 text-center sm:px-16">
              <div className="grid-fade absolute inset-0 opacity-70" />
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
                className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full border border-dashed border-amber-400/20"
              />
              <div className="relative">
                <TextReveal as="h2" text="Your next charge is waiting" className="display-xl text-[clamp(2.2rem,6vw,4.6rem)]" />
                <Reveal delay={0.15}>
                  <p className="mx-auto mt-6 max-w-lg text-neutral-300">
                    Free to join, live across Bhopal, and built for every kind of EV.
                  </p>
                </Reveal>
                <Reveal delay={0.25}>
                  <div className="mt-10 flex flex-wrap justify-center gap-4">
                    <Magnetic strength={0.3}>
                      <Button to={primaryCta} size="lg" caps>
                        Create free account <ArrowRight className="size-4" />
                      </Button>
                    </Magnetic>
                    <Magnetic strength={0.2}>
                      <Button to="/login?mode=register&role=owner" size="lg" variant="secondary" caps>
                        <Building2 className="size-4" /> List your station
                      </Button>
                    </Magnetic>
                  </div>
                </Reveal>
                <Reveal delay={0.35}>
                  <p className="mt-8 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                    <Siren className="size-3.5 text-rose-300" /> 24/7 roadside assistance included
                  </p>
                </Reveal>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
