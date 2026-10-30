/** Google Maps turn-by-turn link to a station (opens the Maps app on phones). */
export function directionsUrl(station) {
  if (!station) return null;
  const lat = Number(station.latitude);
  const lng = Number(station.longitude);
  if (station.latitude != null && station.longitude != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  }
  const query = station.location_text || station.name;
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

export function openDirections(station) {
  const url = directionsUrl(station);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
