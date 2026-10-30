import { motion } from 'framer-motion';
import { BatteryCharging, Gauge, MapPin, Navigation, Sparkles, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { distanceLabel, inr } from '@/lib/format';

const FALLBACK_IMAGES = ['arera', 'bittan', 'db-city', 'habibganj', 'kolar', 'mp-nagar', 'new-market'].map(
  (n) => `/images/stations/${n}.png`,
);

/** Owner-uploaded photo when present, otherwise a stable local fallback. */
export const stationImage = (station) =>
  station?.image_url || FALLBACK_IMAGES[(Number(station?.id) || 0) % FALLBACK_IMAGES.length];

export const qrSrc = (qr) => (!qr ? null : qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`);

/**
 * Stations are booked and billed by the hour, but drivers think in units.
 * An hour at a 30 kW point delivers ~30 kWh, so hourly ÷ kW is a fair
 * per-unit estimate — shown as "approx." because real throughput depends on
 * the vehicle and its state of charge.
 */
export function perUnitRate(station) {
  const hourly = Number(station?.price_per_hour);
  const kw = Number(station?.power_kw);
  if (!Number.isFinite(hourly) || !Number.isFinite(kw) || hourly <= 0 || kw <= 0) return null;
  return hourly / kw;
}

export function RatingStars({ value = 0, size = 'size-3.5', onChange }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const star = (
          <Star className={`${size} ${filled ? 'fill-amber-400 text-amber-400' : 'text-neutral-600'} transition-colors`} />
        );
        return onChange ? (
          <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5 hover:scale-110" aria-label={`${n} star`}>
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}

export function AvailabilityPill({ count }) {
  const open = Number(count) > 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md ${
        open ? 'border-mint-400/40 bg-ink-950/70 text-mint-300' : 'border-line bg-ink-950/70 text-neutral-400'
      }`}
    >
      <span className={`size-1.5 rounded-full ${open ? 'animate-pulse bg-mint-400' : 'bg-neutral-500'}`} />
      {open ? `${count} slots today` : 'Full today'}
    </span>
  );
}

export default function StationCard({ station, active }) {
  const dist = distanceLabel(station.distance);
  const unit = perUnitRate(station);
  const connector = (station.charger_type || '').split(' - ')[0];

  return (
    <motion.div layout whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
      <Link
        to={`/app/stations/${station.id}`}
        className={`group glass block h-full overflow-hidden rounded-3xl transition-all duration-500 ${
          active
            ? 'border-amber-400/50 shadow-[0_26px_60px_-24px_rgba(245,173,63,0.55)]'
            : station.is_priority
            ? 'border-amber-500/40 shadow-sm hover:border-amber-400/60'
            : 'hover:border-amber-400/30'
        }`}
      >
        <div className="relative h-44 overflow-hidden">
          <img
            src={stationImage(station)}
            alt={station.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-[1.1s] ease-out group-hover:scale-[1.12]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060607]/90 via-[#060607]/20 to-transparent" />

          <div className="absolute left-3 top-3 flex items-center gap-1.5">
            <AvailabilityPill count={station.available_slots} />
            {station.is_priority && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-950 shadow-md backdrop-blur-md">
                <Sparkles className="size-2.5 fill-ink-950" /> Priority
              </span>
            )}
          </div>
          {dist && (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
              <Navigation className="size-3" /> {dist}
            </span>
          )}

          {/* Price sits on the image so it survives the card being scanned quickly */}
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
            <div>
              <span className="font-display text-2xl font-bold text-white">
                {station.price_per_hour ? inr(station.price_per_hour) : 'Free'}
              </span>
              {station.price_per_hour && <span className="text-xs text-white/70"> /hour</span>}
            </div>
            {unit && (
              <span className="rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold text-white/80 backdrop-blur-md">
                ≈ {inr(unit, { decimals: 0 })}/kWh
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3 p-5">
          <div>
            <h3 className="line-clamp-1 font-display text-base font-bold uppercase tracking-tight text-bone">
              {station.name}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
              <MapPin className="size-3.5 shrink-0" />
              <span className="line-clamp-1">{station.location_text || 'Location not set'}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {connector && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-neutral-300">
                <BatteryCharging className="size-3.5 text-amber-300" /> {connector}
              </span>
            )}
            {station.power_kw && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-neutral-300">
                <Gauge className="size-3.5 text-amber-300" /> {station.power_kw} kW
              </span>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-line pt-3 text-xs text-neutral-400">
            <span className="flex items-center gap-2">
              <RatingStars value={station.avg_rating} />
              {Number(station.avg_rating || 0).toFixed(1)} ({station.review_count || 0})
            </span>
            <span className="font-semibold text-amber-300 transition-transform group-hover:translate-x-0.5">
              Book →
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
