import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, Inbox, MapPin, Phone, Power, RefreshCw, Save, Siren, User, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { endpoints } from '@/lib/api';
import { dateTimeLong, fullName } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, Spinner, StatCard } from '@/components/ui/Feedback';
import LiveMap from '@/components/map/LiveMap';

const SPECIALIZATIONS = [
  ['battery', 'Battery Specialist'],
  ['charger', 'Charger / Wiring'],
  ['general', 'General EV Mechanic'],
  ['tyre', 'Tyre & Suspension'],
  ['motor', 'Motor & Drivetrain'],
];

const EMPTY = {
  name: '',
  phone: '',
  specialization: 'general',
  location_text: '',
  latitude: '',
  longitude: '',
  experience_years: 1,
  service_cost: 500,
  is_available: true,
};

export default function MechanicDashboard() {
  const { user } = useAuth();
  const profile = useAsync(() => endpoints.mechanicProfile(), []);
  const requests = useAsync(() => endpoints.mechanicRequests(), []);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(null);

  useEffect(() => {
    if (!profile.data) return;
    setForm({
      ...EMPTY,
      name: fullName(user) === 'there' ? '' : fullName(user),
      phone: user?.phone || '',
      ...Object.fromEntries(Object.entries(profile.data).filter(([, v]) => v !== null && v !== undefined)),
    });
  }, [profile.data, user]);

  const hasProfile = !!profile.data?.id;
  const reqList = Array.isArray(requests.data) ? requests.data : [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        latitude: form.latitude === '' ? null : Number(form.latitude),
        longitude: form.longitude === '' ? null : Number(form.longitude),
        experience_years: Number(form.experience_years) || 1,
        service_cost: Number(form.service_cost) || 0,
      };
      delete payload.id;
      delete payload.photo;
      const saved = await endpoints.saveMechanicProfile(payload);
      profile.setData(saved);
      toast.success(hasProfile ? 'Profile updated' : 'Your workshop is live. Drivers can now find you.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async () => {
    const next = !form.is_available;
    setForm((f) => ({ ...f, is_available: next }));
    if (!hasProfile) return;
    try {
      const saved = await endpoints.saveMechanicProfile({ ...form, is_available: next, photo: undefined, id: undefined });
      profile.setData(saved);
      toast.success(next ? "You're online" : "You're offline");
    } catch (err) {
      setForm((f) => ({ ...f, is_available: !next }));
      toast.error(err.message);
    }
  };

  const act = async (id, action) => {
    setActing(`${id}-${action}`);
    try {
      const updated = await endpoints.mechanicRequestAction(id, action);
      requests.setData((prev) =>
        (prev || []).flatMap((r) => (r.id !== id ? [r] : action === 'accept' ? [updated] : [])),
      );
      toast.success(
        { accept: 'Request accepted. Call the driver now.', reject: 'Request declined', complete: 'Job marked as done' }[action],
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(null);
    }
  };

  if (profile.loading) return <Spinner label="Loading your workshop…" />;
  if (profile.error) return <ErrorState error={profile.error} onRetry={profile.reload} />;

  const pin =
    form.latitude !== '' && form.longitude !== ''
      ? [{ id: 'me', lat: Number(form.latitude), lng: Number(form.longitude), tone: 'rose' }]
      : [];

  return (
    <div>
      <PageHeader
        eyebrow="Mechanic console"
        title={hasProfile ? form.name || 'Your workshop' : 'Set up your workshop'}
        description="Keep your profile current so drivers can find you, then take SOS requests as they come in."
        actions={
          <button
            onClick={toggleAvailability}
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              form.is_available ? 'border-amber-400/40 bg-amber-500/10 text-amber-300' : 'border-line text-neutral-400'
            }`}
          >
            <span className={`relative flex size-2.5`}>
              {form.is_available && <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />}
              <span className={`relative inline-flex size-2.5 rounded-full ${form.is_available ? 'bg-amber-400' : 'bg-neutral-500'}`} />
            </span>
            <Power className="size-4" /> {form.is_available ? 'Online' : 'Offline'}
          </button>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Siren} label="Open SOS requests" value={reqList.filter((r) => r.status === 'pending').length} accent="siren" />
        <StatCard icon={Wrench} label="Specialisation" value={SPECIALIZATIONS.find(([v]) => v === form.specialization)?.[1].split(' ')[0] || '—'} delay={0.05} />
        <StatCard icon={Clock} label="Experience" value={`${form.experience_years || 0} yrs`} accent="beam" delay={0.1} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        {/* SOS queue */}
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg uppercase">
              <Inbox className="size-5 text-rose-300" /> Incoming SOS
            </h2>
            <Button size="sm" variant="ghost" onClick={requests.reload} loading={requests.loading}>
              {!requests.loading && <RefreshCw className="size-4" />}
            </Button>
          </div>
          {requests.error ? (
            <ErrorState error={requests.error} onRetry={requests.reload} />
          ) : reqList.length === 0 ? (
            <EmptyState icon={Inbox} title="All quiet" description="New emergency requests will show up here." />
          ) : (
            <ul className="space-y-3">
              <AnimatePresence>
                {reqList.map((r) => (
                  <motion.li
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 font-semibold text-bone">
                          <User className="size-4 text-neutral-400" /> {r.user_name}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">{dateTimeLong(r.created_at)}</p>
                      </div>
                      <Badge status={r.status} />
                    </div>
                    {r.message && <p className="mt-3 text-sm text-neutral-300">"{r.message}"</p>}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-400">
                      {r.vehicle_number && <span>🚗 {r.vehicle_number}</span>}
                      {r.phone && (
                        <a href={`tel:${r.phone}`} className="flex items-center gap-1 text-amber-300 hover:underline">
                          <Phone className="size-3" /> {r.phone}
                        </a>
                      )}
                      {r.latitude && r.longitude && (
                        <a
                          href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-sky-300 hover:underline"
                        >
                          <MapPin className="size-3" /> Open location
                        </a>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      {r.status === 'accepted' ? (
                        <Button size="sm" onClick={() => act(r.id, 'complete')} loading={acting === `${r.id}-complete`}>
                          <Check className="size-4" /> Mark done
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => act(r.id, 'accept')} loading={acting === `${r.id}-accept`} disabled={!hasProfile}>
                            <Check className="size-4" /> Accept
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => act(r.id, 'reject')} loading={acting === `${r.id}-reject`} disabled={!hasProfile}>
                            <X className="size-4" /> Decline
                          </Button>
                        </>
                      )}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
          {!hasProfile && reqList.length > 0 && (
            <p className="mt-4 text-xs text-amber-300">Save your profile before you accept requests.</p>
          )}
        </Card>

        {/* Profile */}
        <Card className="p-6">
          <h2 className="mb-5 flex items-center gap-2 text-lg uppercase">
            <Wrench className="size-5 text-amber-300" /> Workshop profile
          </h2>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Workshop / your name">
                <Input value={form.name} onChange={set('name')} required />
              </Field>
              <Field label="Phone">
                <Input type="tel" value={form.phone || ''} onChange={set('phone')} />
              </Field>
              <Field label="Specialisation">
                <Select value={form.specialization} onChange={set('specialization')}>
                  {SPECIALIZATIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Experience (yrs)">
                  <Input type="number" min="0" value={form.experience_years} onChange={set('experience_years')} />
                </Field>
                <Field label="Visit fee (₹)">
                  <Input type="number" min="0" value={form.service_cost} onChange={set('service_cost')} />
                </Field>
              </div>
            </div>
            <Field label="Area / address">
              <Input value={form.location_text || ''} onChange={set('location_text')} placeholder="MP Nagar, Bhopal" />
            </Field>
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Location on map <span className="normal-case tracking-normal text-neutral-500">(click to set)</span>
              </span>
              <LiveMap
                className="h-56"
                points={pin}
                fit={pin.length > 0}
                onPick={({ lat, lng }) => setForm((f) => ({ ...f, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }))}
              />
              {pin.length > 0 && (
                <p className="mt-1.5 font-mono text-[11px] text-neutral-500">
                  {Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}
                </p>
              )}
            </div>
            <Button type="submit" loading={saving} block>
              <Save className="size-4" /> {hasProfile ? 'Save changes' : 'Go live'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
