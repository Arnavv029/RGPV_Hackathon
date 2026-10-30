import { useEffect, useMemo } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

/**
 * Shared map used by Home (stations), Emergency (mechanics + stations) and
 * Add Station (location picker).
 *
 * The basemap is deliberately BRIGHT — full-colour OpenStreetMap, no dark
 * filter — so streets, parks and labels stay readable for everyone. Markers are
 * saturated teardrop pins with a white keyline so they pop against the map.
 */

const DEFAULT_CENTER = [23.2599, 77.4126]; // Bhopal — where the seed data lives

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Saturated marker colours, readable on a light basemap. */
const TONES = {
  mint: { core: '#059669', ring: 'rgba(5,150,105,0.35)' },
  amber: { core: '#d97706', ring: 'rgba(217,119,6,0.35)' },
  rose: { core: '#e11d48', ring: 'rgba(225,29,72,0.35)' },
  sky: { core: '#0284c7', ring: 'rgba(2,132,199,0.35)' },
  muted: { core: '#475569', ring: 'rgba(71,85,105,0.3)' },
};

const iconCache = new Map();

/** Teardrop pin drawn as inline SVG, so no image assets are needed. */
export function pinIcon(tone = 'mint', { active = false, label = '' } = {}) {
  const key = `${tone}-${active}-${label}`;
  if (iconCache.has(key)) return iconCache.get(key);

  const { core, ring } = TONES[tone] || TONES.mint;
  const w = active ? 46 : 36;
  const h = active ? 60 : 47;

  const icon = L.divIcon({
    className: 'hev-marker',
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 6],
    html: `
      <div style="position:relative;width:${w}px;height:${h}px;transform-origin:50% 100%;
        animation:hevDrop .45s cubic-bezier(.22,1,.36,1) both">
        ${active ? `<span style="position:absolute;left:50%;bottom:-6px;width:${w}px;height:${w * 0.42}px;
          transform:translateX(-50%);border-radius:50%;background:${ring};filter:blur(4px)"></span>` : ''}
        <svg width="${w}" height="${h}" viewBox="0 0 36 47" fill="none" style="position:relative;filter:drop-shadow(0 4px 8px rgba(0,0,0,.35))">
          <path d="M18 46C18 46 34 28.6 34 17.4 34 8.3 26.8 1 18 1S2 8.3 2 17.4C2 28.6 18 46 18 46Z"
            fill="${core}" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>
          <circle cx="18" cy="17" r="6.5" fill="#ffffff" fill-opacity="${label ? 1 : 0.92}"/>
          ${label ? `<text x="18" y="21.5" text-anchor="middle" font-family="Inter,sans-serif" font-size="10"
            font-weight="700" fill="${core}">${label}</text>` : ''}
        </svg>
      </div>`,
  });
  iconCache.set(key, icon);
  return icon;
}

/** "You are here" — a blue dot with a soft accuracy halo. */
const userIcon = L.divIcon({
  className: 'hev-marker',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  html: `<div style="position:relative;display:grid;place-items:center;width:26px;height:26px">
    <span style="position:absolute;inset:0;border-radius:999px;background:rgba(2,132,199,.25);animation:hevPulse 2.2s ease-out infinite"></span>
    <span style="position:relative;width:16px;height:16px;border-radius:999px;background:#0284c7;
      border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"></span>
  </div>`,
});

/**
 * Re-frames the map whenever the framed coordinates change. `focus` (a list of
 * [lat, lng]) overrides the default of "every point plus the user".
 */
function FitBounds({ points, user, focus }) {
  const map = useMap();
  const coords = useMemo(() => {
    if (focus?.length) return focus;
    const all = points.map((p) => [p.lat, p.lng]);
    if (user) all.push([user.lat, user.lng]);
    return all;
  }, [points, user, focus]);
  const key = JSON.stringify(coords);
  useEffect(() => {
    if (coords.length === 1) map.setView(coords[0], 14, { animate: true });
    else if (coords.length > 1) map.fitBounds(coords, { padding: [48, 48], maxZoom: 15, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/** Flies to the focused point when a list card is hovered or selected. */
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
  }, [target, map]);
  return null;
}

function ClickPicker({ onPick }) {
  useMapEvents({ click: (e) => onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/**
 * @param points  [{ id, lat, lng, tone?, label?, popup?: ReactNode }]
 * @param user    { lat, lng } | null — draws the "you are here" dot
 * @param activeId id of the highlighted point
 * @param onPick  when set, clicking the map reports coordinates (location picker)
 * @param focus   optional [[lat, lng], …] to frame instead of all points
 */
export default function LiveMap({
  points = [],
  user = null,
  activeId = null,
  onSelect,
  onPick,
  radiusKm,
  className = 'h-[460px]',
  fit = true,
  focus = null,
}) {
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const active = valid.find((p) => p.id === activeId) || null;
  const center = user ? [user.lat, user.lng] : valid[0] ? [valid[0].lat, valid[0].lng] : DEFAULT_CENTER;

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-line shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] ${className}`}>
      <MapContainer center={center} zoom={13} scrollWheelZoom className="h-full w-full" zoomControl>
        <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} maxZoom={19} />
        {fit && <FitBounds points={valid} user={user} focus={focus} />}
        <FlyTo target={active} />
        {onPick && <ClickPicker onPick={onPick} />}

        {user && (
          <>
            <Marker position={[user.lat, user.lng]} icon={userIcon} zIndexOffset={1000}>
              <Popup>You are here</Popup>
            </Marker>
            {radiusKm && (
              <Circle
                center={[user.lat, user.lng]}
                radius={radiusKm * 1000}
                pathOptions={{ color: '#0284c7', weight: 1.5, fillColor: '#0ea5e9', fillOpacity: 0.07, dashArray: '5 7' }}
              />
            )}
          </>
        )}

        {valid.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={pinIcon(p.tone, { active: p.id === activeId, label: p.label || '' })}
            zIndexOffset={p.id === activeId ? 500 : 0}
            eventHandlers={onSelect ? { click: () => onSelect(p.id) } : undefined}
          >
            {p.popup && <Popup>{p.popup}</Popup>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
