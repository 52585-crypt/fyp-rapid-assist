const EARTH_RADIUS_KM = 6371;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Haversine distance between two WGS84 points in kilometers.
 */
function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const φ1 = toRadians(Number(lat1));
  const φ2 = toRadians(Number(lat2));
  const Δφ = toRadians(Number(lat2) - Number(lat1));
  const Δλ = toRadians(Number(lng2) - Number(lng1));

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

function isValidLatLng(lat, lng) {
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    return false;
  }
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) {
    return false;
  }
  if (la < -90 || la > 90 || ln < -180 || ln > 180) {
    return false;
  }
  return true;
}

module.exports = {
  calculateDistanceKm,
  isValidLatLng,
};
