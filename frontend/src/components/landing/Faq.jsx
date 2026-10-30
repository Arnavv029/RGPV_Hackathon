import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useState } from 'react';

const ITEMS = [
  {
    q: 'How do I find a charging station?',
    a: 'Open the app and allow location access. Every point across Bhopal appears on a live map and in a list sorted by distance or rating. You can also set a search range — useful when you are planning a longer trip and want to book ahead at the far end of it.',
  },
  {
    q: 'How do I start a charging session?',
    a: 'Pick a station, choose a time slot and pay. You get a QR code straight away — show it at the station and the owner scans it to start your session.',
  },
  {
    q: 'What types of charging connectors are supported?',
    a: 'Each point lists its connector and power rating — slow AC Type 2 points suit scooters, bikes and autos, while DC CCS2 and CHAdeMO points fast-charge cars. Check the station page before you book.',
  },
  {
    q: 'Can I monitor my charging progress?',
    a: 'Your booking page shows the session details, the QR ticket and its current status as the station owner confirms and then completes it.',
  },
  {
    q: 'How is the price calculated?',
    a: "You pay by the hour. Owners set a base hourly rate from the point's rated output — an hour on a 30 kW point delivers roughly 30 kWh — and our model adjusts each slot around that with demand. Every slot shows the live rate and the reason before you pay.",
  },
  {
    q: 'What happens if I need to cancel?',
    a: 'Cancel 30+ minutes before your slot for a full refund, 70% within the last 30 minutes, 50% in the first half hour of the session. We show the exact refund before you confirm.',
  },
];

export default function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <div className="divide-y divide-line border-y border-line">
      {ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <motion.div
            key={item.q}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: i * 0.05, duration: 0.5 }}
          >
            <button
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              className="group flex w-full items-center gap-5 py-6 text-left"
            >
              <span
                className={`font-display text-sm font-bold tabular-nums transition-colors duration-300 ${
                  isOpen ? 'text-amber-300' : 'text-neutral-600'
                }`}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span
                className={`flex-1 font-display text-lg font-bold uppercase leading-snug transition-colors duration-300 sm:text-xl ${
                  isOpen ? 'text-amber-300' : 'text-bone group-hover:text-amber-200'
                }`}
              >
                {item.q}
              </span>
              <motion.span
                animate={{ rotate: isOpen ? 135 : 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className={`grid size-9 shrink-0 place-items-center rounded-full border transition-colors duration-300 ${
                  isOpen ? 'border-amber-400 text-amber-300' : 'border-line-2 text-neutral-400'
                }`}
              >
                <Plus className="size-4" />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="max-w-2xl pb-7 pl-10 text-sm leading-relaxed text-neutral-400">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
