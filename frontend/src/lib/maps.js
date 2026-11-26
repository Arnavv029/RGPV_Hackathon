/** Google Maps turn-by-turn link to a station (opens the Maps app on phones). */
export function directionsUrl(station) {
  if (!station) return null;
  const lat = Number(station.latitude);
  const lng = Number(station.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  }
  const query = [station.name, station.location_text].filter(Boolean).join(', ');
  return query ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving` : null;
}

export function openDirections(station) {
  const url = directionsUrl(station);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
