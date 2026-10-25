/*
 * Kabupaten/kota in Sumatera Utara (33). Coordinates and elevation (metres above sea level)
 * of each regency/city centre are approximate; the elevation is used for the sunrise/sunset
 * horizon correction exactly as Kemenag's tables do. Time zone: WIB (UTC+7).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SumutCities = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const cities = [
    { id: "medan", name: "Kota Medan", latitude: 3.5952, longitude: 98.6722, elevation: 25 },
    { id: "binjai", name: "Kota Binjai", latitude: 3.6001, longitude: 98.4854, elevation: 28 },
    { id: "tebing-tinggi", name: "Kota Tebing Tinggi", latitude: 3.3285, longitude: 99.1625, elevation: 26 },
    { id: "pematangsiantar", name: "Kota Pematangsiantar", latitude: 2.9595, longitude: 99.0687, elevation: 400 },
    { id: "tanjungbalai", name: "Kota Tanjungbalai", latitude: 2.9667, longitude: 99.7983, elevation: 3 },
    { id: "sibolga", name: "Kota Sibolga", latitude: 1.7425, longitude: 98.7792, elevation: 5 },
    { id: "padangsidimpuan", name: "Kota Padangsidimpuan", latitude: 1.373, longitude: 99.271, elevation: 270 },
    { id: "gunungsitoli", name: "Kota Gunungsitoli", latitude: 1.2897, longitude: 97.6138, elevation: 10 },
    { id: "asahan", name: "Kab. Asahan", latitude: 2.9845, longitude: 99.6185, elevation: 25 },
    { id: "batu-bara", name: "Kab. Batu Bara", latitude: 3.16, longitude: 99.5333, elevation: 5 },
    { id: "dairi", name: "Kab. Dairi", latitude: 2.75, longitude: 98.3167, elevation: 1070 },
    { id: "deli-serdang", name: "Kab. Deli Serdang", latitude: 3.55, longitude: 98.8667, elevation: 10 },
    { id: "humbang-hasundutan", name: "Kab. Humbang Hasundutan", latitude: 2.25, longitude: 98.7667, elevation: 1300 },
    { id: "karo", name: "Kab. Karo", latitude: 3.1006, longitude: 98.4914, elevation: 1300 },
    { id: "labuhanbatu", name: "Kab. Labuhanbatu", latitude: 2.105, longitude: 99.8333, elevation: 20 },
    { id: "labuhanbatu-selatan", name: "Kab. Labuhanbatu Selatan", latitude: 1.9267, longitude: 100.1253, elevation: 40 },
    { id: "labuhanbatu-utara", name: "Kab. Labuhanbatu Utara", latitude: 2.4, longitude: 99.8667, elevation: 20 },
    { id: "langkat", name: "Kab. Langkat", latitude: 3.7556, longitude: 98.4333, elevation: 15 },
    { id: "mandailing-natal", name: "Kab. Mandailing Natal", latitude: 0.8667, longitude: 99.55, elevation: 200 },
    { id: "nias", name: "Kab. Nias", latitude: 1.0833, longitude: 97.7667, elevation: 100 },
    { id: "nias-barat", name: "Kab. Nias Barat", latitude: 1.1, longitude: 97.5, elevation: 50 },
    { id: "nias-selatan", name: "Kab. Nias Selatan", latitude: 0.5667, longitude: 97.8167, elevation: 10 },
    { id: "nias-utara", name: "Kab. Nias Utara", latitude: 1.3667, longitude: 97.5, elevation: 50 },
    { id: "padang-lawas", name: "Kab. Padang Lawas", latitude: 1.35, longitude: 99.7167, elevation: 150 },
    { id: "padang-lawas-utara", name: "Kab. Padang Lawas Utara", latitude: 1.5667, longitude: 99.9, elevation: 200 },
    { id: "pakpak-bharat", name: "Kab. Pakpak Bharat", latitude: 2.6833, longitude: 98.2833, elevation: 900 },
    { id: "samosir", name: "Kab. Samosir", latitude: 2.6167, longitude: 98.6833, elevation: 905 },
    { id: "serdang-bedagai", name: "Kab. Serdang Bedagai", latitude: 3.3167, longitude: 99.0, elevation: 15 },
    { id: "simalungun", name: "Kab. Simalungun", latitude: 2.93, longitude: 98.76, elevation: 1000 },
    { id: "tapanuli-selatan", name: "Kab. Tapanuli Selatan", latitude: 1.5667, longitude: 99.2333, elevation: 900 },
    { id: "tapanuli-tengah", name: "Kab. Tapanuli Tengah", latitude: 1.6833, longitude: 98.8167, elevation: 5 },
    { id: "tapanuli-utara", name: "Kab. Tapanuli Utara", latitude: 2.0167, longitude: 98.9667, elevation: 1100 },
    { id: "toba", name: "Kab. Toba", latitude: 2.3333, longitude: 99.0667, elevation: 905 },
  ].map((city) => Object.assign({ utcOffset: 7 }, city));

  const byId = (id) => cities.find((city) => city.id === id) || cities[0];

  function distanceKm(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r;
    const dLon = (lon2 - lon1) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function nearest(latitude, longitude) {
    let best = cities[0];
    let bestDistance = Infinity;
    for (const city of cities) {
      const d = distanceKm(latitude, longitude, city.latitude, city.longitude);
      if (d < bestDistance) {
        best = city;
        bestDistance = d;
      }
    }
    return { city: best, distanceKm: bestDistance };
  }

  return { cities, byId, nearest };
});
