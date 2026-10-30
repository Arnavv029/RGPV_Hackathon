import { motion } from 'framer-motion';
import { CalendarPlus, Clock, IndianRupee, Lock, LockOpen, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { endpoints } from '@/lib/api';
import { inr, time12, toISODate } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/Feedback';

const pad = (n) => String(n).padStart(2, '0');

/** Hourly ranges between two "HH:MM" times, e.g. 09:00–12:00 -> 3 ranges. */
function hourlyRanges(from, to, stepHours) {
  const [fh] = from.split(':').map(Number);
  const [th] = to.split(':').map(Number);
  const out = [];
  for (let h = fh; h + stepHours <= th; h += stepHours) {
    out.push({ start_time: `${pad(h)}:00`, end_time: `${pad(h + stepHours)}:00` });
  }
  return out;
}

export default function ManageSlots() {
  const [params, setParams] = useSearchParams();
  const stations = useAsync(() => endpoints.ownerStations(), []);
  const list = Array.isArray(stations.data) ? stations.data : [];
  const stationId = params.get('station') || (list[0] && String(list[0].id)) || '';
  const station = list.find((s) => String(s.id) === stationId);

  const [date, setDate] = useState(toISODate());
  const [price, setPrice] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  // Generator
  const [from, setFrom] = useState('08:00');
  const [to, setTo] = useState('20:00');
  const [step, setStep] = useState(1);
  const [capacity, setCapacity] = useState(1);
  const [creating, setCreating] = useState(false);
  const [custom, setCustom] = useState([]);

  const slots = useAsync(() => (stationId ? endpoints.ownerSlots(stationId, date) : Promise.resolve(null)), [stationId, date]);
  const slotList = slots.data?.slots || [];
  const [busySlot, setBusySlot] = useState(null);

  const toggleSlot = async (s) => {
    setBusySlot(s.id);
    try {
      await endpoints.updateSlot(s.id, { is_available: !s.is_available });
      toast.success(s.is_available ? 'Slot closed to new bookings' : 'Slot reopened');
      slots.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusySlot(null);
    }
  };

  const removeSlot = async (s) => {
    if (!window.confirm(`Delete the ${time12(s.start_time)} – ${time12(s.end_time)} slot?`)) return;
    setBusySlot(s.id);
    try {
      await endpoints.deleteSlot(s.id);
      toast.success('Slot deleted');
      slots.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusySlot(null);
    }
  };

  useEffect(() => {
    if (station) setPrice(station.price_per_hour ?? '');
  }, [station]);

  const savePrice = async () => {
    setSavingPrice(true);
    try {
      await endpoints.updateStation(station.id, { price_per_hour: price === '' ? null : Number(price) });
      toast.success('Base price updated');
      stations.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingPrice(false);
    }
  };

  const preview = [...hourlyRanges(from, to, Number(step)), ...custom];
  const existing = new Set(slotList.map((s) => `${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)}`));
  const toCreate = preview.filter((r) => !existing.has(`${r.start_time}-${r.end_time}`));

  const create = async () => {
    if (!toCreate.length) return toast('All of these slots already exist for this date.');
    setCreating(true);
    try {
      const res = await endpoints.createSlots({ station: Number(stationId), date, capacity: Number(capacity) || 1, time_ranges: toCreate });
      toast.success(res.message || 'Slots created');
      if (res.errors?.length) {
        const first = Object.values(res.errors[0] || {}).flat()[0];
        toast.warning(`${res.errors.length} slot(s) skipped${first ? `: ${first}` : ''}`);
      }
      setCustom([]);
      slots.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (stations.loading) return <Spinner />;
  if (stations.error) return <ErrorState error={stations.error} onRetry={stations.reload} />;
  if (!list.length)
    return (
      <EmptyState icon={CalendarPlus} title="Add a station first" description="Slots belong to a station. Create one to get started." action={<Button to="/owner/stations/new">Add station</Button>} />
    );

  return (
    <div>
      <PageHeader eyebrow="Availability" title="Slots & pricing" description="Open bookable time slots and set your base hourly rate. AI pricing adjusts each slot's price around it." />

      <div className="mb-6 grid gap-4 md:grid-cols-[1.2fr_1fr_1fr]">
        <Field label="Station">
          <Select value={stationId} onChange={(e) => setParams({ station: e.target.value })}>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={date} min={toISODate()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Base price (₹/hr)" icon={IndianRupee}>
          <div className="flex gap-2">
            <Input withIcon type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
            <Button type="button" variant="secondary" onClick={savePrice} loading={savingPrice} disabled={String(price) === String(station?.price_per_hour ?? '')}>
              <Save className="size-4" />
            </Button>
          </div>
        </Field>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* Generator */}
        <Card className="p-6">
          <h2 className="mb-5 flex items-center gap-2 text-lg uppercase">
            <Wand2 className="size-5 text-amber-300" /> Slot generator
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Opens at">
              <Input type="time" step="3600" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Closes at">
              <Input type="time" step="3600" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field label="Slot length">
              <Select value={step} onChange={(e) => setStep(e.target.value)}>
                <option value={1}>1 hour</option>
                <option value={2}>2 hours</option>
                <option value={3}>3 hours</option>
              </Select>
            </Field>
            <Field label="Cars per slot">
              <Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </Field>
          </div>

          <CustomRange onAdd={(r) => setCustom((c) => [...c, r])} />

          <div className="mt-5 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
            {preview.map((r, i) => {
              const dup = existing.has(`${r.start_time}-${r.end_time}`);
              const isCustom = i >= preview.length - custom.length;
              return (
                <span
                  key={`${r.start_time}-${r.end_time}-${i}`}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                    dup ? 'border-line text-neutral-600 line-through' : 'border-amber-400/25 bg-amber-500/5 text-amber-200'
                  }`}
                >
                  {r.start_time}–{r.end_time}
                  {isCustom && (
                    <button type="button" onClick={() => setCustom((c) => c.filter((x) => x !== r))} aria-label="Remove">
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          <Button block className="mt-5" onClick={create} loading={creating} disabled={!toCreate.length}>
            <CalendarPlus className="size-4" /> Create {toCreate.length} slot{toCreate.length === 1 ? '' : 's'}
          </Button>
        </Card>

        {/* Existing */}
        <Card className="p-6">
          <h2 className="mb-5 flex items-center gap-2 text-lg uppercase">
            <Clock className="size-5 text-sky-300" /> Slots on {new Date(`${date}T00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
          </h2>
          {slots.loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : slots.error ? (
            <ErrorState error={slots.error} onRetry={slots.reload} />
          ) : slotList.length === 0 ? (
            <p className="py-12 text-center text-sm text-neutral-500">No slots on this date yet. Use the generator to add some.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {slotList.map((s, i) => {
                const pct = Math.round((s.booked_count / Math.max(1, s.capacity)) * 100);
                const busy = busySlot === s.id;
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.02 } }}
                    className={`rounded-xl border border-line bg-hover p-3 ${s.is_available ? '' : 'opacity-60'}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-semibold text-bone">
                        {time12(s.start_time)} – {time12(s.end_time)}
                      </p>
                      <div className="flex shrink-0 gap-1 text-neutral-400">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggleSlot(s)}
                          className="rounded p-0.5 hover:text-bone disabled:opacity-40"
                          aria-label={s.is_available ? 'Close slot' : 'Reopen slot'}
                          title={s.is_available ? 'Close to new bookings' : 'Reopen for bookings'}
                        >
                          {s.is_available ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5 text-rose-400" />}
                        </button>
                        {s.booked_count === 0 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => removeSlot(s)}
                            className="rounded p-0.5 hover:text-rose-400 disabled:opacity-40"
                            aria-label="Delete slot"
                            title="Delete slot"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {!s.is_available && <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-400">Closed</p>}
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-hover">
                      <div className={`h-full rounded-full ${s.is_full ? 'bg-rose-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[11px] text-neutral-500">
                      <span>
                        {s.booked_count}/{s.capacity} booked
                      </span>
                      {s.dynamic_price?.hourly_rate != null && <span className="text-neutral-300">{inr(s.dynamic_price.hourly_rate)}</span>}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function CustomRange({ onAdd }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const valid = start && end && start < end;
  return (
    <div className="mt-4 flex items-end gap-2">
      <Field label="Custom slot" className="flex-1">
        <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field className="flex-1">
        <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      <Button
        type="button"
        variant="secondary"
        disabled={!valid}
        onClick={() => {
          onAdd({ start_time: start, end_time: end });
          setStart('');
          setEnd('');
        }}
        aria-label="Add custom slot"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
