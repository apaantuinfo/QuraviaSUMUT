/*
 * Prayer-time calculation following the criteria used by the Ministry of Religious
 * Affairs of the Republic of Indonesia (Kemenag RI / Bimas Islam):
 *   Subuh  : sun 20° below the horizon
 *   Isya   : sun 18° below the horizon
 *   Dzuhur : solar transit + ihtiyath
 *   Ashar  : shadow length = object + noon shadow (Shafi'i)
 *   Maghrib: sunset (sun centre 0°50' below the horizon) + ihtiyath
 *   Terbit : sunrise (sun centre 0°50' below the horizon) - ihtiyath
 *   Imsak  : Subuh - 10 minutes
 * Values are rounded to whole minutes the way the published tables are.
 * Solar position: NOAA / Meeus low-precision series (error well below 1 minute).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PrayerTimes = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const MIN = 60000;

  const KEMENAG = {
    fajrAngle: 20,
    ishaAngle: 18,
    sunAngle: 0.8333, // 16' semi-diameter + 34' refraction
    asrShadow: 1,
    ihtiyat: 2, // minutes
    imsakMinutes: 10,
    rounding: "ceil", // "round" | "ceil" | "floor"
    // Small calibration (minutes) to the published Kemenag tables, see tools/validate-prayer-times.js
    offsets: { dhuhr: 0.5, sunrise: -0.5, maghrib: 0 },
  };

  const mod = (value, n) => ((value % n) + n) % n;

  function julianDayFromEpoch(ms) {
    return ms / 86400000 + 2440587.5;
  }

  function solarPosition(ms) {
    const jd = julianDayFromEpoch(ms);
    const T = (jd - 2451545.0) / 36525;
    const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
    const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    const Mr = M * RAD;
    const C =
      Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
      Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
      Math.sin(3 * Mr) * 0.000289;
    const trueLong = L0 + C;
    const omega = 125.04 - 1934.136 * T;
    const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
    const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
    const declination = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
    const y = Math.tan((eps * RAD) / 2) ** 2;
    const L0r = L0 * RAD;
    const eqTime =
      4 *
      DEG *
      (y * Math.sin(2 * L0r) -
        2 * e * Math.sin(Mr) +
        4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
        0.5 * y * y * Math.sin(4 * L0r) -
        1.25 * e * e * Math.sin(2 * Mr));
    return { declination, eqTime };
  }

  /**
   * @param {number} year  @param {number} month 1-12  @param {number} day
   * @param {{latitude:number, longitude:number, elevation?:number, utcOffset:number}} place
   * @returns times as epoch milliseconds
   */
  function calculate(year, month, day, place, options) {
    const o = Object.assign({}, KEMENAG, options || {});
    const lat = place.latitude;
    const lon = place.longitude;
    const dip = place.elevation ? (1.76 / 60) * Math.sqrt(place.elevation) : 0;
    const utcMidnight = Date.UTC(year, month - 1, day);

    function transitAt(ms) {
      const { eqTime, declination } = solarPosition(ms);
      return { ms: utcMidnight + (720 - 4 * lon - eqTime) * MIN, declination };
    }

    // refine the transit using the equation of time at the transit itself
    let transit = transitAt(utcMidnight + 5 * 3600e3);
    transit = transitAt(transit.ms);
    transit = transitAt(transit.ms);

    function altitudeTime(altitudeDeg, direction) {
      let t = transit.ms + direction * 6 * 3600e3;
      for (let i = 0; i < 4; i += 1) {
        const { eqTime, declination } = solarPosition(t);
        const cosH =
          (Math.sin(altitudeDeg * RAD) - Math.sin(lat * RAD) * Math.sin(declination * RAD)) /
          (Math.cos(lat * RAD) * Math.cos(declination * RAD));
        if (cosH < -1 || cosH > 1) return null;
        const H = Math.acos(cosH) * DEG;
        t = utcMidnight + (720 - 4 * lon - eqTime) * MIN + direction * (H / 15) * 3600e3;
      }
      return t;
    }

    const asrAltitude =
      Math.atan(1 / (o.asrShadow + Math.tan(Math.abs(lat - transit.declination) * RAD))) * DEG;
    const horizon = -(o.sunAngle + dip);

    const raw = {
      fajr: altitudeTime(-o.fajrAngle, -1),
      sunrise: altitudeTime(horizon, -1),
      dhuhr: transit.ms,
      asr: altitudeTime(asrAltitude, 1),
      maghrib: altitudeTime(horizon, 1),
      isha: altitudeTime(-o.ishaAngle, 1),
    };

    const ih = o.ihtiyat * MIN;
    const adjusted = {
      fajr: raw.fajr === null ? null : raw.fajr + ih,
      sunrise: raw.sunrise === null ? null : raw.sunrise - ih + o.offsets.sunrise * MIN,
      dhuhr: raw.dhuhr + ih + o.offsets.dhuhr * MIN,
      asr: raw.asr === null ? null : raw.asr + ih,
      maghrib: raw.maghrib === null ? null : raw.maghrib + ih + o.offsets.maghrib * MIN,
      isha: raw.isha === null ? null : raw.isha + ih,
    };
    adjusted.imsak = adjusted.fajr === null ? null : adjusted.fajr - o.imsakMinutes * MIN;

    // Round to whole minutes in local time.
    const offsetMs = place.utcOffset * 3600e3;
    const roundFn = o.rounding === "none" ? (x) => x : Math[o.rounding] || Math.round;
    const times = {};
    for (const key of Object.keys(adjusted)) {
      const value = adjusted[key];
      times[key] = value === null ? null : roundFn((value + offsetMs) / MIN) * MIN - offsetMs;
    }
    return times;
  }

  function formatTime(ms, utcOffset) {
    if (ms === null || ms === undefined) return "--:--";
    const d = new Date(ms + utcOffset * 3600e3);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }

  return { calculate, formatTime, solarPosition, KEMENAG };
});
