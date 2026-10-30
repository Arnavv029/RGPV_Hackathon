import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Crosshair, ImagePlus, Loader2, MapPin, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { endpoints } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import LiveMap from '@/components/map/LiveMap';

const CHARGERS = ['AC Type 2 - 7.4kW', 'AC Type 2 - 22kW', 'DC CCS2 - 30kW', 'DC CCS2 - 60kW', 'DC CHAdeMO - 50kW', 'Bharat AC-001', 'Bharat DC-001'];

const NOMINATIM = 'https://nominatim.openstreetmap.org';

export default function AddStation() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    description: '',
    location_text: '',
    latitude: '',
    longitude: '',
    phone: '',
    total_slots: 4,
    charger_type: CHARGERS[2],
    price_per_hour: '',
  });
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const hasPin = form.latitude !== '' && form.longitude !== '';

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const pickImage = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB');
      return;
    }
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  // Reverse-geocode a map click into a readable address.
  const setPin = async ({ lat, lng }) => {
    setForm((f) => ({ ...f, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
    try {
      const res = await fetch(`${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en`);
      const data = await res.json();
      if (data?.display_name) setForm((f) => (f.location_text ? f : { ...f, location_text: data.display_name }));
    } catch {
      /* address stays editable by hand */
    }
  };

  const useMyLocation = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setPin({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => toast.error('Could not get your location'),
    );

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.location_text.trim()) return setError('Station name and address are required.');
    if (!hasPin) return setError('Drop a pin on the map so drivers can find you.');

    setSaving(true);
    try {
      const payload = {
        ...form,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        total_slots: Number(form.total_slots) || 1,
        price_per_hour: form.price_per_hour === '' ? null : Number(form.price_per_hour),
      };
      if (image) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => v !== null && v !== '' && fd.append(k, v));
        fd.append('image', image);
        await endpoints.createStation(fd, true);
      } else {
        await endpoints.createStation(payload, false);
      }
      toast.success('Station published! Now add some time slots.');
      navigate('/owner/slots');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/owner" className="mb-5 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-bone">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <PageHeader eyebrow="New station" title="Add a charging station" description="Publish your charger to the HapticEV network. It shows up for drivers as soon as you save." />

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_1.05fr]" noValidate>
        <div className="space-y-6">
          <Card className="space-y-4 p-6">
            <Field label="Station name *">
              <Input value={form.name} onChange={set('name')} placeholder="GreenVolt MP Nagar Hub" required />
            </Field>
            <Field label="Description">
              <Textarea value={form.description} onChange={set('description')} placeholder="Covered parking, café nearby, 24×7 security…" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Charger type">
                <Select value={form.charger_type} onChange={set('charger_type')}>
                  {CHARGERS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Charging points">
                <Input type="number" min="1" value={form.total_slots} onChange={set('total_slots')} />
              </Field>
              <Field label="Base price (₹/hr)" hint="AI pricing adjusts this with demand">
                <Input type="number" min="0" step="1" value={form.price_per_hour} onChange={set('price_per_hour')} placeholder="120" />
              </Field>
              <Field label="Contact phone">
                <Input type="tel" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
              </Field>
            </div>
          </Card>

          <Card className="p-6">
            <span className="mb-3 block text-xs font-semibold uppercase tracking-wider text-neutral-400">Station photo</span>
            <label className="group relative flex h-48 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-line transition hover:border-amber-400/40">
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickImage(e.target.files?.[0])} />
              {preview ? (
                <>
                  <img src={preview} alt="" className="absolute inset-0 size-full object-cover" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setImage(null);
                      setPreview(null);
                    }}
                    className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-ink-950/80 text-bone"
                    aria-label="Remove photo"
                  >
                    <X className="size-4" />
                  </button>
                </>
              ) : (
                <>
                  <ImagePlus className="size-8 text-neutral-500 transition group-hover:text-amber-300" />
                  <span className="mt-2 text-sm text-neutral-400">Click to upload · JPG/PNG up to 5 MB</span>
                </>
              )}
            </label>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-4 p-6">
            <AddressSearch
              value={form.location_text}
              onChange={(v) => setForm((f) => ({ ...f, location_text: v }))}
              onSelect={(r) =>
                setForm((f) => ({ ...f, location_text: r.display_name, latitude: Number(r.lat).toFixed(6), longitude: Number(r.lon).toFixed(6) }))
              }
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">
                {hasPin ? (
                  <span className="font-mono">
                    📍 {Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}
                  </span>
                ) : (
                  'Search an address, or click the map to drop a pin'
                )}
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={useMyLocation}>
                <Crosshair className="size-4" /> Use my location
              </Button>
            </div>
            <LiveMap
              className="h-[360px]"
              points={hasPin ? [{ id: 'new', lat: Number(form.latitude), lng: Number(form.longitude), tone: 'mint' }] : []}
              onPick={setPin}
            />
          </Card>

          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <Button type="submit" size="lg" block loading={saving}>
            Publish station
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Debounced OpenStreetMap address autocomplete. */
function AddressSearch({ value, onChange, onSelect }) {
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef();

  const search = (q) => {
    onChange(q);
    clearTimeout(timer.current);
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${NOMINATIM}/search?format=json&limit=6&countrycodes=in&accept-language=en&q=${encodeURIComponent(q)}`);
        setResults(await res.json());
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
  };

  return (
    <div className="relative">
      <Field label="Address *" icon={searching ? Loader2 : Search}>
        <Input
          withIcon
          value={value}
          onChange={(e) => search(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search e.g. MP Nagar Zone 1, Bhopal"
          autoComplete="off"
        />
      </Field>
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute z-[600] mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-ink-800 p-1 shadow-2xl"
          >
            {results.map((r) => (
              <li key={r.place_id}>
                <button
                  type="button"
                  onMouseDown={() => {
                    onSelect(r);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-neutral-300 hover:bg-hover"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-amber-300" />
                  <span className="line-clamp-2">{r.display_name}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
