/* global self */
(function (g) {
  const UA = "MarketplaceListingShelf/1.1 (local extension; geocoding via Nominatim policy)";

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  let lastGeocodeAt = 0;

  async function geocode(q, cache) {
    const key = String(q || "").trim().toLowerCase();
    if (!key) return null;
    if (cache[key]) return cache[key];

    const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
    await new Promise((r) => setTimeout(r, wait));
    lastGeocodeAt = Date.now();

    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(q.trim());
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": UA,
      },
    });
    if (!res.ok) throw new Error("Geocode failed: " + res.status);
    const arr = await res.json();
    if (!arr || !arr[0]) return null;
    const o = { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) };
    cache[key] = o;
    return o;
  }

  g.ShelfGeo = { haversineKm, geocode };
})(typeof self !== "undefined" ? self : window);
