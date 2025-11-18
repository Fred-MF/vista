const EARTH_RADIUS_KM = 6371;

export function haversineDistance(coordA, coordB) {
  if (
    typeof coordA?.lat !== "number" ||
    typeof coordA?.lon !== "number" ||
    typeof coordB?.lat !== "number" ||
    typeof coordB?.lon !== "number"
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const toRad = deg => (deg * Math.PI) / 180;

  const dLat = toRad(coordB.lat - coordA.lat);
  const dLon = toRad(coordB.lon - coordA.lon);

  const lat1 = toRad(coordA.lat);
  const lat2 = toRad(coordB.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}
