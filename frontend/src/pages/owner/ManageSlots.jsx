import { motion } from 'framer-motion';
import {
  BatteryCharging,
  Calendar,
  CheckCircle2,
  Clock,
  IndianRupee,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { endpoints } from '@/lib/api';
import { inr, time12, toISODate } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';

export default function ManageSlots() {
  const [params, setParams] = useSearchParams();
  const stations = useAsync(() => endpoints.ownerStations(), []);
  const list = Array.isArray(stations.data) ? stations.data : [];
  const stationId = params.get('station') || (list[0] && String(list[0].id)) || '';
  const station = list.find((s) => String(s.id) === stationId);

  const [date, setDate] = useState(toISODate());
  const [price, setPrice] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  // Fetch real-time schedule: booked intervals and available gaps
  const schedule = useAsync(
    () => (stationId ? endpoints.stationSchedule(stationId, date) : Promise.resolve(null)),
    [stationId, date],
  );

  useEffect(() => {
    if (station) setPrice(station.price_per_hour ?? '');
  }, [station]);

  const savePrice = async () => {
    setSavingPrice(true);
    try {
      await endpoints.updateStation(station.id, { price_per_hour: price === '' ? null : Number(price) });
      toast.success('Base tariff updated successfully!');
      stations.reload();
      schedule.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingPrice(false);
    }
  };

  const bookedIntervals = schedule.data?.booked_intervals || [];
  const availableGaps = schedule.data?.available_gaps || [];
  const totalSlots = station?.total_slots || schedule.data?.total_slots || 4;

  // Calculate current occupancy right now (if today)
  const isToday = date === toISODate();
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const activeSessions = useMemo(() => {
    if (!isToday) return [];
    return bookedIntervals.filter((item) => {
      const [sh, sm] = item.start_time.split(':').map(Number);
      const [eh, em] = item.end_time.split(':').map(Number);
      const sMin = sh * 60 + sm;
      const eMin = eh * 60 + em;
      return currentMinutes >= sMin && currentMinutes < eMin;
    });
  }, [bookedIntervals, isToday, currentMinutes]);

  if (stations.loading) return <Spinner />;
  if (stations.error) return <ErrorState error={stations.error} onRetry={stations.reload} />;
  if (!list.length) {
    return (
      <EmptyState
        icon={BatteryCharging}
        title="Add a station first"
        description="Schedule and bay availability belong to a station. Create one to get started."
        action={<Button to="/owner/stations/new">Add station</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Station Management"
        title="Live Schedule & Bay Occupancy"
        description="Real-time bay occupancy, booked charging intervals, and open availability gaps. Slots are allocated automatically based on vehicle charging duration."
        actions={
          <div className="flex gap-2">
            <Button to="/owner/scanner" variant="primary" size="md">
              <QrCode className="size-4" /> Scan QR to Start Charging
            </Button>
            <Button variant="secondary" size="md" onClick={() => schedule.reload()} loading={schedule.loading}>
              <RefreshCw className="size-4" /> Refresh
            </Button>
          </div>
        }
      />

      {/* ── Top Bar Controls: Station, Date, Operating Hours & Price ── */}
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr_1.2fr]">
        <Field label="Station">
          <Select value={stationId} onChange={(e) => setParams({ station: e.target.value })}>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Schedule Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="Station Tariff (₹/unit)" icon={IndianRupee}>
          <div className="flex gap-2">
            <Input
              withIcon
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="20.00"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={savePrice}
              loading={savingPrice}
              disabled={String(price) === String(station?.price_per_hour ?? '')}
            >
              <Save className="size-4" />
            </Button>
          </div>
        </Field>

        <div className="flex flex-col justify-end">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-300">
            <div className="font-semibold uppercase tracking-wider text-[10px] text-emerald-400">Operating Hours</div>
            <div className="mt-0.5 font-bold">08:00 AM – 10:00 PM (Daily)</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
        {/* ── Left Column: Real-time Bays Status & Quick Actions ── */}
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg uppercase font-bold text-bone">
                  <Zap className="size-5 text-amber-300" /> Station Bays Status
                </h2>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {station?.name} · {totalSlots} Physical Charging Bays
                </p>
              </div>
              <span className="rounded-full border border-line bg-surface/60 px-3 py-1 text-xs font-semibold text-neutral-300">
                {activeSessions.length} / {totalSlots} In Use
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: totalSlots }, (_, i) => {
                const bayNumber = i + 1;
                const active = activeSessions[i];
                return (
                  <motion.div
                    key={bayNumber}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`rounded-2xl border p-4 transition-colors ${
                      active
                        ? 'border-amber-400/40 bg-amber-500/10'
                        : 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-display text-base font-bold text-bone">
                        Bay #{bayNumber}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          active
                            ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                            : 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                        }`}
                      >
                        <span className={`size-1.5 rounded-full ${active ? 'bg-amber-300 animate-pulse' : 'bg-emerald-400'}`} />
                        {active ? 'Charging' : 'Available'}
                      </span>
                    </div>

                    <div className="mt-3 text-xs space-y-1">
                      {active ? (
                        <>
                          <div className="font-semibold text-bone">{active.vehicle_number || 'Vehicle Charging'}</div>
                          <div className="text-amber-200">
                            {time12(active.start_time)} – {time12(active.end_time)}
                          </div>
                          <div className="text-[11px] text-neutral-400">
                            Session actively running
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-neutral-300 font-medium">Ready for next vehicle</div>
                          <div className="text-[11px] text-neutral-500">
                            {station?.charger_type || 'DC CCS2 Fast Charger'}
                          </div>
                        </>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Explanatory note */}
            <div className="mt-5 rounded-xl border border-line bg-surface/50 p-3.5 text-xs text-neutral-400 space-y-1.5">
              <div className="font-semibold text-neutral-300 flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-400" /> Real-time Early Bay Release
              </div>
              <p className="text-[11px] leading-relaxed">
                When a user completes charging or leaves early, scan their QR or click <b>"Complete & Free Bay"</b> in the Scanner. The bay is instantly released so other drivers can reserve it immediately.
              </p>
            </div>
          </Card>
        </div>

        {/* ── Right Column: Booked Intervals & Open Gaps Timeline ── */}
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg uppercase font-bold text-bone">
                  <Clock className="size-5 text-sky-300" /> Schedule on{' '}
                  {new Date(`${date}T00:00`).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </h2>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {bookedIntervals.length} Booked Session{bookedIntervals.length === 1 ? '' : 's'} · {availableGaps.length} Open Gap{availableGaps.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-6">
              {/* Booked Intervals List */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3 flex items-center gap-1.5">
                  <BatteryCharging className="size-4 text-amber-300" /> Booked Time Intervals
                </div>
                {bookedIntervals.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-neutral-500">
                    No bookings on this date yet. All bays are 100% open between 08:00 AM and 10:00 PM!
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {bookedIntervals.map((b, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 p-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="grid size-8 place-items-center rounded-lg bg-amber-500/10 text-amber-400 font-bold">
                            #{i + 1}
                          </span>
                          <div>
                            <div className="font-semibold text-bone">
                              {time12(b.start_time)} – {time12(b.end_time)}
                            </div>
                            <div className="text-neutral-400 text-[11px]">
                              {b.vehicle_number ? `Vehicle: ${b.vehicle_number}` : 'Reserved Vehicle'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge status={b.status || 'confirmed'} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Open Available Gaps */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3 flex items-center gap-1.5">
                  <Clock className="size-4 text-emerald-400" /> Open Available Gaps (Free for Booking)
                </div>
                {availableGaps.length === 0 ? (
                  <p className="text-xs text-neutral-500">Station is fully reserved for operating hours.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {availableGaps.map((g, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold text-emerald-300">
                            {time12(g.start_time)} – {time12(g.end_time)}
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-0.5">{g.label || `${g.duration_minutes}m free`}</div>
                        </div>
                        <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          Free
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
