(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const storage = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // The application remains usable when storage is unavailable.
      }
    },
  };

  // New feature modules must never be able to take down navigation or the Qur'an reader.
  function safely(label, task) {
    try {
      return task();
    } catch (error) {
      console.error(`[Quravia] ${label} gagal dijalankan`, error);
      return undefined;
    }
  }

  const state = {
    surahs: [],
    filter: "all",
    query: "",
    currentScreen: "home",
    readerOrigin: "quran",
    currentSurah: null,
    readerObserver: null,
    deferredInstallPrompt: null,
    qiblaBearing: null,
    position: null,
    mosqueBusy: false,
    mosqueRun: 0,
    mosqueCache: null,
    toastTimer: null,
    arabicSize: storage.get("QuraviaArabicSize", 32),
    bookmarks: storage.get("QuraviaBookmarks", []),
    tasbih: storage.get("QuraviaTasbih", {
      dhikr: "Subhanallah",
      target: 33,
      counts: { Subhanallah: 0, Alhamdulillah: 0, "Allahu Akbar": 0 },
    }),
  };

  const screenMeta = {
    home: ["ASSALAMU’ALAIKUM", "Quravia"],
    quran: ["BACA & RENUNGKAN", "Al-Qur’an"],
    prayer: ["SUMATERA UTARA", "Jadwal Salat"],
    short: ["JUZ AMMA", "Surat Pendek"],
    tasbih: ["DZIKIR HARIAN", "Tasbih Digital"],
    qibla: ["SUMATERA UTARA", "Kompas Kiblat"],
    reader: ["SEDANG DIBACA", "Al-Qur’an"],
  };

  const dhikrText = {
    Subhanallah: "سُبْحَانَ اللَّهِ",
    Alhamdulillah: "الْحَمْدُ لِلَّهِ",
    "Allahu Akbar": "اللَّهُ أَكْبَرُ",
  };

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("toast--visible");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("toast--visible"), 2800);
  }

  function setButtonLoading(button, loading, loadingText) {
    if (loading) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.textContent = loadingText;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    }
  }

  function navigate(screen, options = {}) {
    if (!screenMeta[screen]) return;
    if (screen === "reader" && state.currentScreen !== "reader") {
      state.readerOrigin = state.currentScreen === "home" ? "home" : state.currentScreen;
    }

    $$(".screen").forEach((section) => {
      const active = section.dataset.screen === screen;
      section.hidden = !active;
      section.classList.toggle("screen--active", active);
    });

    state.currentScreen = screen;
    const [kicker, title] = screenMeta[screen];
    $("#header-kicker").textContent = kicker;
    $("#header-title").textContent = title;
    $("#back-button").hidden = screen !== "reader";
    $("#bottom-nav").hidden = screen === "reader";

    $$(".nav-item").forEach((item) => {
      item.classList.toggle("nav-item--active", item.dataset.go === screen);
    });

    if (screen === "home" && state.surahs.length) updateContinueCard();
    safely("murottal", () => {
      if (screen !== "reader") {
        stopMurottal();
        $("#murottal-bar").hidden = true;
      }
    });
    safely("jadwal salat", () => {
      if (screen === "prayer") {
        prayer.dayOffset = 0;
        renderPrayerScreen();
      }
      updateCountdowns();
    });
    safely("kompas", syncCompass);
    safely("footer", () => {
      $(".site-footer").classList.toggle("site-footer--reader", screen === "reader");
      document.body.classList.toggle("in-reader", screen === "reader");
    });
    if (!options.keepScroll) window.scrollTo({ top: 0, behavior: "instant" });
  }

  function surahTypeLabel(type) {
    return type === "medinan" ? "Madaniyah" : "Makkiyah";
  }

  function surahRowTemplate(surah) {
    return `
      <button class="surah-row" type="button" data-surah="${surah.id}" aria-label="Baca ${escapeHTML(surah.transliteration)}">
        <span class="surah-number">${surah.id}</span>
        <span class="surah-main">
          <strong>${escapeHTML(surah.transliteration)}</strong>
          <small>${escapeHTML(surah.translation)} • ${surah.total_verses} ayat • ${surahTypeLabel(surah.type)}</small>
        </span>
        <span class="surah-arabic" lang="ar" dir="rtl">${escapeHTML(surah.name)}</span>
      </button>`;
  }

  function bindSurahButtons(root) {
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-surah]");
      if (button) openSurah(Number(button.dataset.surah));
    });
  }

  function renderSurahs() {
    const normalizedQuery = state.query.trim().toLocaleLowerCase("id");
    const visible = state.surahs.filter((surah) => {
      const filterMatch = state.filter === "all" || surah.type === state.filter;
      const searchText = `${surah.id} ${surah.transliteration} ${surah.translation} ${surah.name}`.toLocaleLowerCase("id");
      return filterMatch && (!normalizedQuery || searchText.includes(normalizedQuery));
    });

    $("#surah-list").innerHTML = visible.map(surahRowTemplate).join("");
    $("#surah-empty").hidden = visible.length > 0;
  }

  function renderShortSurahs() {
    const shortSurahs = state.surahs.filter((surah) => surah.id >= 78);
    $("#short-list").innerHTML = shortSurahs.map(surahRowTemplate).join("");
  }

  function renderPopularSurahs() {
    const popularIds = [112, 113, 114, 109];
    const popular = popularIds.map((id) => state.surahs.find((surah) => surah.id === id)).filter(Boolean);
    $("#popular-list").innerHTML = popular
      .map(
        (surah) => `
          <button class="popular-card" type="button" data-surah="${surah.id}">
            <span class="popular-card-top">
              <span class="popular-number">${surah.id}</span>
              <span class="popular-arabic" lang="ar" dir="rtl">${escapeHTML(surah.name)}</span>
            </span>
            <strong>${escapeHTML(surah.transliteration)}</strong>
            <small>${escapeHTML(surah.translation)} • ${surah.total_verses} ayat</small>
          </button>`,
      )
      .join("");
  }

  function updateContinueCard() {
    const lastRead = storage.get("QuraviaLastRead", { surah: 1, ayah: 1 });
    const surah = state.surahs.find((item) => item.id === lastRead.surah) || state.surahs[0];
    if (!surah) return;
    $("#continue-title").textContent = surah.transliteration;
    $("#continue-subtitle").textContent = `Ayat ${lastRead.ayah || 1} • ${surah.translation}`;
    $("#continue-card").dataset.surah = String(surah.id);
  }

  function bookmarkKey(surahId, verseId) {
    return `${surahId}:${verseId}`;
  }

  function verseTemplate(verse, surahId) {
    const key = bookmarkKey(surahId, verse.id);
    const bookmarked = state.bookmarks.includes(key);
    return `
      <article class="verse-card" data-verse="${verse.id}">
        <div class="verse-topline">
          <span class="verse-index">${verse.id}</span>
          <div class="verse-actions">
          <button class="verse-play" type="button" data-play="${verse.id}" aria-label="Putar ayat ${verse.id}">
            <svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>
            <svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
            <span class="murottal-spin" aria-hidden="true"></span>
          </button>
          <button class="bookmark-button${bookmarked ? " bookmark-button--active" : ""}" type="button" data-bookmark="${key}" aria-label="${bookmarked ? "Hapus" : "Simpan"} penanda ayat ${verse.id}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16l-5-3-5 3V4Z" /></svg>
          </button>
          </div>
        </div>
        <p class="verse-arabic" lang="ar" dir="rtl">${escapeHTML(verse.text)}</p>
        <p class="verse-latin">${escapeHTML(verse.transliteration)}</p>
        <p class="verse-translation">${verse.id}. ${escapeHTML(verse.translation)}</p>
      </article>`;
  }

  function observeReaderProgress(surah) {
    if (state.readerObserver) state.readerObserver.disconnect();
    if (!("IntersectionObserver" in window)) return;

    state.readerObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const ayah = Number(visible.target.dataset.verse);
        storage.set("QuraviaLastRead", { surah: surah.id, ayah });
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.45] },
    );

    $$(".verse-card", $("#verse-list")).forEach((card) => state.readerObserver.observe(card));
  }

  async function openSurah(id) {
    const summary = state.surahs.find((surah) => surah.id === id);
    if (!summary) return;

    navigate("reader");
    stopMurottal();
    $("#murottal-bar").hidden = true;
    $("#reader-loading").innerHTML = `<div class="spinner"></div><p>Menyiapkan surah…</p>`;
    $("#reader-loading").hidden = false;
    $("#reader-content").hidden = true;
    $("#header-title").textContent = summary.transliteration;

    try {
      const response = await fetch(`./data/quran/${id}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const surah = await response.json();
      state.currentSurah = surah;

      $("#reader-number").textContent = surah.id;
      $("#reader-type").textContent = surahTypeLabel(surah.type).toUpperCase();
      $("#reader-name").textContent = surah.transliteration;
      $("#reader-meaning").textContent = `${surah.translation} • ${surah.total_verses} ayat`;
      $("#reader-arabic-name").textContent = surah.name;
      $("#verse-list").innerHTML = surah.verses.map((verse) => verseTemplate(verse, surah.id)).join("");
      document.documentElement.style.setProperty("--arabic-size", `${state.arabicSize}px`);

      $("#reader-loading").hidden = true;
      $("#reader-content").hidden = false;
      storage.set("QuraviaLastRead", { surah: surah.id, ayah: 1 });
      observeReaderProgress(surah);
      prepareMurottal(surah);
    } catch {
      $("#reader-loading").innerHTML = `<p>Surah belum dapat dimuat. Periksa koneksi lalu coba lagi.</p><button class="secondary-button" type="button" id="reader-retry">Coba Lagi</button>`;
      $("#reader-retry")?.addEventListener("click", () => {
        $("#reader-loading").innerHTML = `<div class="spinner"></div><p>Menyiapkan surah…</p>`;
        openSurah(id);
      });
    }
  }

  function setArabicSize(nextSize) {
    state.arabicSize = Math.max(25, Math.min(46, nextSize));
    storage.set("QuraviaArabicSize", state.arabicSize);
    document.documentElement.style.setProperty("--arabic-size", `${state.arabicSize}px`);
    showToast(`Ukuran teks Arab: ${state.arabicSize}px`);
  }

  function updateTasbih() {
    const { dhikr, target, counts } = state.tasbih;
    const count = Number(counts[dhikr] || 0);
    const cycleProgress = count === 0 ? 0 : count % target === 0 ? 1 : (count % target) / target;
    $("#tasbih-count").textContent = String(count);
    $("#tasbih-target-label").textContent = `dari ${target}`;
    $("#dhikr-label").textContent = dhikr;
    $("#dhikr-arabic").textContent = dhikrText[dhikr];
    $("#tasbih-ring").style.setProperty("--progress", `${cycleProgress * 360}deg`);

    $$(".dhikr-chip").forEach((button) => button.classList.toggle("dhikr-chip--active", button.dataset.dhikr === dhikr));
    $$(".target-chip").forEach((button) => button.classList.toggle("target-chip--active", Number(button.dataset.target) === target));
    storage.set("QuraviaTasbih", state.tasbih);
  }

  function incrementTasbih() {
    const { dhikr, target, counts } = state.tasbih;
    counts[dhikr] = Number(counts[dhikr] || 0) + 1;
    if (navigator.vibrate) navigator.vibrate(counts[dhikr] % target === 0 ? [80, 45, 80] : 18);
    updateTasbih();
    if (counts[dhikr] % target === 0) showToast(`MasyaAllah, ${target} hitungan selesai.`);
  }

  // A simplified point-in-polygon geofence derived from the North Sumatra
  // provincial outline. Separate island polygons include Nias and Batu Islands.
  const NORTH_SUMATRA_POLYGONS = [
    [
      [98.2557, 4.2910], [98.1717, 4.1086], [98.2343, 4.1295], [98.3877, 4.0761],
      [98.5286, 4.0120], [98.6091, 3.9142], [98.7024, 3.8113], [98.7885, 3.7183],
      [98.9914, 3.6525], [99.2057, 3.5357], [99.3728, 3.4024], [99.5466, 3.2442],
      [99.7378, 3.1706], [99.9171, 2.9799], [100.0003, 2.7997], [100.0987, 2.6764],
      [100.2414, 2.6375], [100.3308, 2.5342], [100.3096, 2.3407], [100.3601, 2.2204],
      [100.3227, 2.0140], [100.2921, 1.8023], [100.4553, 1.6291], [100.4159, 1.5371],
      [100.4340, 1.5113], [100.3159, 1.4165], [100.0779, 1.3872], [100.1305, 1.1746],
      [100.1087, 1.0719], [100.1614, 0.9992], [100.0928, 0.9151], [100.1837, 0.7619],
      [100.0833, 0.7919], [99.8819, 0.9057], [99.8452, 0.6863], [99.9194, 0.6059],
      [99.9648, 0.5544], [99.9082, 0.4748], [99.7650, 0.4819], [99.6709, 0.4810],
      [99.5875, 0.5166], [99.4997, 0.5388], [99.4073, 0.4935], [99.2971, 0.3377],
      [99.1620, 0.2318], [99.1095, 0.3426], [99.1357, 0.4357], [99.0713, 0.6291],
      [99.0175, 0.8137], [98.9692, 0.9312], [98.9107, 1.1224], [98.8399, 1.2867],
      [98.7779, 1.4349], [98.7598, 1.5289], [98.8410, 1.6287], [98.7693, 1.7595],
      [98.6789, 1.7408], [98.5016, 1.9415], [98.3894, 2.0075], [98.2246, 2.0963],
      [98.1531, 2.1460], [98.1877, 2.3194], [98.1121, 2.4244], [98.0752, 2.5755],
      [98.1243, 2.6551], [98.0868, 2.7349], [98.0421, 2.8280], [97.9546, 2.9003],
      [97.9392, 3.0719], [97.9253, 3.2264], [97.8723, 3.2490], [97.9849, 3.2756],
      [98.0298, 3.3299], [97.9497, 3.3915], [97.9069, 3.5536], [97.8032, 3.7317],
      [97.9086, 3.8205], [97.9582, 3.9289], [98.0231, 3.9698], [98.0593, 4.1907],
      [98.1454, 4.2874], [98.2557, 4.2910],
    ],
    [
      [97.5005, 0.9161], [97.3998, 0.9421], [97.2536, 1.2311], [97.0731, 1.4172],
      [97.2571, 1.4104], [97.3864, 1.4933], [97.5302, 1.4076], [97.6784, 1.1771],
      [97.8544, 1.0537], [97.9356, 0.9610], [97.8758, 0.7437], [97.8918, 0.6289],
      [97.7953, 0.5582], [97.7042, 0.5599], [97.5880, 0.8382], [97.5005, 0.9161],
    ],
    [
      [98.4097, -0.5968], [98.3413, -0.5122], [98.3702, -0.4529], [98.3671, -0.3773],
      [98.3804, -0.3376], [98.4362, -0.2959], [98.4422, -0.2448], [98.5161, -0.3554],
      [98.5011, -0.4906], [98.4984, -0.5552], [98.4097, -0.5968],
    ],
    [
      [98.3711, 0.0059], [98.4148, -0.0255], [98.4881, -0.2040], [98.5680, -0.2777],
      [98.5632, -0.3281], [98.5156, -0.3211], [98.4272, -0.2024], [98.3567, -0.0543],
      [98.3149, -0.0118], [98.3711, 0.0059],
    ],
    [
      [98.5982, 0.0950], [98.5308, 0.1060], [98.5224, 0.1441], [98.6089, 0.1839],
      [98.7178, 0.1594], [98.7968, 0.1714], [98.8506, 0.1179], [98.8446, 0.0821],
      [98.7775, 0.0981], [98.7456, 0.0731], [98.5982, 0.0950],
    ],
  ];

  function pointInPolygon(longitude, latitude, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      const intersects = yi > latitude !== yj > latitude &&
        longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function isInNorthSumatra(latitude, longitude) {
    return NORTH_SUMATRA_POLYGONS.some((polygon) => pointInPolygon(longitude, latitude, polygon));
  }

  function calculateQiblaBearing(latitude, longitude) {
    const toRad = (degrees) => (degrees * Math.PI) / 180;
    const kaabaLatitude = toRad(21.422487);
    const latitudeRad = toRad(latitude);
    const deltaLongitude = toRad(39.826206 - longitude);
    const y = Math.sin(deltaLongitude);
    const x = Math.cos(latitudeRad) * Math.tan(kaabaLatitude) - Math.sin(latitudeRad) * Math.cos(deltaLongitude);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function locationErrorMessage(error) {
    if (error.code === error.PERMISSION_DENIED) return "Izin lokasi ditolak. Buka pengaturan browser, izinkan lokasi, lalu coba lagi.";
    if (error.code === error.POSITION_UNAVAILABLE) return "Lokasi belum dapat ditentukan. Aktifkan GPS dan coba di area terbuka.";
    if (error.code === error.TIMEOUT) return "Pemeriksaan lokasi terlalu lama. Silakan coba lagi.";
    return "Lokasi tidak dapat diperiksa pada perangkat ini.";
  }

  function verifyLocation() {
    const button = $("#check-location");
    const message = $("#location-message");
    message.textContent = "";

    if (!window.isSecureContext || !navigator.geolocation) {
      message.textContent = "Fitur lokasi memerlukan HTTPS. Buka aplikasi dari Vercel atau GitHub Pages.";
      return;
    }

    setButtonLoading(button, true, "Memeriksa lokasi…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setButtonLoading(button, false);
        const { latitude, longitude, accuracy } = coords;
        if (!isInNorthSumatra(latitude, longitude)) {
          message.textContent = "Kompas terkunci: posisi Anda terdeteksi berada di luar Sumatera Utara.";
          return;
        }

        state.position = { latitude, longitude, accuracy, at: Date.now() };
        state.qiblaBearing = calculateQiblaBearing(latitude, longitude);
        $("#qibla-bearing").textContent = String(Math.round(state.qiblaBearing));
        $("#approved-coordinates").textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)} • akurasi ±${Math.round(accuracy)} m`;
        $("#qibla-gate").hidden = true;
        $("#qibla-compass-panel").hidden = false;
        $("#mosque-block").hidden = false; // shown only once the Qibla direction is known
        showToast("Lokasi Sumatera Utara berhasil diverifikasi.");
      },
      (error) => {
        setButtonLoading(button, false);
        message.textContent = locationErrorMessage(error);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  // ---------------------------------------------------------------------------
  // Compass
  //
  // Why the old version shook:
  //  1. It listened to "deviceorientationabsolute" AND "deviceorientation". On
  //     Android both fire; the second one reports a *relative* alpha, so the dial
  //     flipped between two unrelated headings dozens of times per second.
  //  2. Raw sensor values were applied directly (no smoothing / dead-band).
  //  3. A CSS transition on top of per-event updates fought itself and spun the
  //     whole dial backwards at the 359°→0° wrap.
  //  4. Every event rewrote text in the page, causing layout work at ~60 Hz.
  //  5. The listeners were never removed when leaving the Qibla screen.
  // ---------------------------------------------------------------------------
  const compass = {
    enabled: false,
    active: false,
    raf: 0,
    target: null,
    shown: null,
    lastStatusAt: 0,
    lastStatusKey: "",
    aligned: false,
    gotRelativeOnly: false,
    useAbsoluteEvent: "ondeviceorientationabsolute" in window,
  };

  const normalizeAngle = (degrees) => ((degrees % 360) + 360) % 360;
  const shortestDelta = (from, to) => ((to - from + 540) % 360) - 180;

  // Heading (0° = north, clockwise) of the direction the phone points to.
  // Works flat on a table (top edge) and held upright (back camera).
  function tiltCompensatedHeading(alpha, beta, gamma) {
    const rad = Math.PI / 180;
    const [a, b, g] = [alpha * rad, beta * rad, gamma * rad];
    const [cA, sA, cB, sB, cG, sG] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(g), Math.sin(g)];
    const topEast = -cB * sA;
    const topNorth = cA * cB;
    const backEast = -(cG * sA * sB + cA * sG);
    const backNorth = -(sA * sG - cA * cG * sB);
    const useTop = Math.hypot(topEast, topNorth) >= Math.hypot(backEast, backNorth);
    const east = useTop ? topEast : backEast;
    const north = useTop ? topNorth : backNorth;
    return normalizeAngle(Math.atan2(east, north) / rad);
  }

  function headingFromEvent(event) {
    // iOS Safari supplies a ready-made, calibrated compass heading.
    if (typeof event.webkitCompassHeading === "number" && Number.isFinite(event.webkitCompassHeading)) {
      return normalizeAngle(event.webkitCompassHeading);
    }
    // Elsewhere only an absolute (magnetic-north) reference is usable as a compass.
    const absolute = event.type === "deviceorientationabsolute" || event.absolute === true;
    if (!absolute) {
      compass.gotRelativeOnly = true;
      return null;
    }
    if (typeof event.alpha !== "number") return null;
    const screenAngle = screen.orientation?.angle ?? window.orientation ?? 0;
    const heading =
      typeof event.beta === "number" && typeof event.gamma === "number"
        ? tiltCompensatedHeading(event.alpha, event.beta, event.gamma)
        : 360 - event.alpha;
    return normalizeAngle(heading + screenAngle);
  }

  function handleOrientation(event) {
    if (state.qiblaBearing === null) return;
    const heading = headingFromEvent(event);
    // Only store the value; drawing happens once per animation frame.
    if (heading !== null) compass.target = heading;
  }

  function renderCompass(heading) {
    const relativeQibla = normalizeAngle(state.qiblaBearing - heading);
    $("#compass-dial").style.transform = `rotate(${(-heading).toFixed(2)}deg)`;
    $("#qibla-needle").style.transform = `rotate(${relativeQibla.toFixed(2)}deg)`;

    const aligned = relativeQibla <= 4 || relativeQibla >= 356;
    if (aligned !== compass.aligned) {
      compass.aligned = aligned;
      $(".compass-wrap").classList.toggle("compass-wrap--aligned", aligned);
    }

    // Text is updated at most ~4×/second and only when it actually changes.
    const now = performance.now();
    const key = `${Math.round(heading)}|${aligned}`;
    if (key !== compass.lastStatusKey && now - compass.lastStatusAt > 250) {
      compass.lastStatusKey = key;
      compass.lastStatusAt = now;
      $("#compass-status").textContent = aligned
        ? `Arah ponsel ${Math.round(heading)}° • Anda sudah menghadap kiblat.`
        : `Arah ponsel ${Math.round(heading)}° • putar hingga penunjuk emas menghadap atas.`;
    }
  }

  function compassFrame() {
    if (!compass.active) return;
    compass.raf = requestAnimationFrame(compassFrame);
    if (compass.target === null || state.qiblaBearing === null) return;

    if (compass.shown === null) {
      compass.shown = compass.target;
      $("#enable-compass").hidden = true;
      renderCompass(compass.shown);
      return;
    }

    const delta = shortestDelta(compass.shown, compass.target);
    if (Math.abs(delta) < 0.4) return; // dead-band: ignore sensor noise
    // Small changes are smoothed heavily, large turns are followed quickly.
    const factor = Math.min(0.35, Math.max(0.08, Math.abs(delta) / 70));
    compass.shown = normalizeAngle(compass.shown + delta * factor);
    renderCompass(compass.shown);
  }

  function startCompassLoop() {
    if (compass.active) return;
    compass.active = true;
    compass.shown = null;
    window.addEventListener(compass.useAbsoluteEvent ? "deviceorientationabsolute" : "deviceorientation", handleOrientation, true);
    compass.raf = requestAnimationFrame(compassFrame);
  }

  function stopCompassLoop() {
    if (!compass.active) return;
    compass.active = false;
    cancelAnimationFrame(compass.raf);
    window.removeEventListener("deviceorientationabsolute", handleOrientation, true);
    window.removeEventListener("deviceorientation", handleOrientation, true);
  }

  // Run the sensor only while the Qibla screen is visible.
  function syncCompass() {
    const shouldRun = compass.enabled && state.currentScreen === "qibla" && !document.hidden;
    if (shouldRun) startCompassLoop();
    else stopCompassLoop();
  }

  async function enableCompass() {
    const button = $("#enable-compass");
    try {
      if (typeof DeviceOrientationEvent === "undefined") {
        $("#compass-status").textContent = "Sensor kompas tidak tersedia. Gunakan angka bearing dengan kompas biasa.";
        button.hidden = true;
        return;
      }

      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== "granted") throw new Error("permission-denied");
      }

      compass.enabled = true;
      compass.target = null;
      compass.gotRelativeOnly = false;
      $("#compass-status").textContent = "Menunggu data sensor kompas…";
      syncCompass();
      setTimeout(() => {
        if (compass.enabled && compass.target === null) {
          $("#compass-status").textContent = compass.gotRelativeOnly
            ? "Perangkat ini tidak menyediakan sensor arah utara. Gunakan angka bearing dengan kompas biasa."
            : "Sensor belum mengirim arah. Kalibrasi ponsel dengan gerakan angka delapan.";
        }
      }, 2500);
    } catch {
      $("#compass-status").textContent = "Izin sensor kompas ditolak. Aktifkan izin gerakan/orientasi di pengaturan browser.";
    }
  }

  // ---------------------------------------------------------------------------
  // Nearest mosque: browser Geolocation (free) + OpenStreetMap Overpass (free, no key)
  // ---------------------------------------------------------------------------
  // Public Overpass servers are shared and often slow or rate-limited (HTTP 429),
  // so several are raced (staggered, so the happy path only hits the first one)
  // and Nominatim is used as a last-resort fallback.
  const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  const OVERPASS_STAGGER_MS = 1200;
  const OVERPASS_TIMEOUT_MS = 14000;
  const MOSQUE_RADII = [5000, 15000];
  const MAX_MOSQUES_SHOWN = 8;
  const MOSQUE_CACHE_MS = 10 * 60 * 1000;
  const FRESH_POSITION_MS = 5 * 60 * 1000;

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDistance(meters) {
    if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
    return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
  }

  function mapsSearchUrl(latitude, longitude) {
    return `https://www.google.com/maps/search/masjid/@${latitude.toFixed(5)},${longitude.toFixed(5)},15z`;
  }

  function mapsRouteUrl(latitude, longitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  }

  function getFreshPosition() {
    return new Promise((resolve, reject) => {
      if (!window.isSecureContext || !navigator.geolocation) {
        reject({ code: 0 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, at: Date.now() }),
        reject,
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 },
      );
    });
  }

  function raceOverpass(query) {
    const controllers = [];
    const attempts = OVERPASS_ENDPOINTS.map(async (endpoint, index) => {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, index * OVERPASS_STAGGER_MS));
      const controller = new AbortController();
      controllers.push(controller);
      const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          body: new URLSearchParams({ data: query }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.elements)) throw new Error("bad-response");
        return data.elements;
      } finally {
        clearTimeout(timer);
      }
    });
    return Promise.any(attempts).finally(() => controllers.forEach((controller) => controller.abort()));
  }

  function toMosque(position, latitude, longitude, tags) {
    const name = String(tags.name || tags["name:id"] || tags["name:en"] || "").trim();
    const kind = /musala|mushal|musholla|mushola|surau|langgar/i.test(name) ? "Musala" : "Masjid";
    const address = [tags["addr:street"], tags["addr:suburb"] || tags["addr:city"]].filter(Boolean).join(", ");
    return {
      name: name || "Masjid (nama belum tercatat)",
      hasName: Boolean(name),
      kind,
      address,
      latitude,
      longitude,
      distance: haversineMeters(position.latitude, position.longitude, latitude, longitude),
    };
  }

  function sortAndDedupe(found) {
    found.sort((a, b) => a.distance - b.distance);
    // OpenStreetMap sometimes maps one mosque twice (building + point); drop near-duplicates.
    const unique = [];
    for (const item of found) {
      const duplicate = unique.some(
        (kept) =>
          haversineMeters(kept.latitude, kept.longitude, item.latitude, item.longitude) < 60 &&
          (!kept.hasName || !item.hasName || kept.name.toLowerCase() === item.name.toLowerCase()),
      );
      if (!duplicate) unique.push(item);
    }
    return unique;
  }

  async function searchMosquesOverpass(position, radius) {
    // Coordinates are rounded to 3 decimals (~100 m) before leaving the device.
    const lat = Number(position.latitude.toFixed(3));
    const lon = Number(position.longitude.toFixed(3));
    const query =
      `[out:json][timeout:25];(` +
      `nwr["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${lat},${lon});` +
      `nwr["building"="mosque"](around:${radius},${lat},${lon});` +
      `);out center tags;`;
    const elements = await raceOverpass(query);
    const found = [];
    for (const element of elements) {
      const latitude = element.lat ?? element.center?.lat;
      const longitude = element.lon ?? element.center?.lon;
      if (typeof latitude !== "number" || typeof longitude !== "number") continue;
      found.push(toMosque(position, latitude, longitude, element.tags || {}));
    }
    return sortAndDedupe(found);
  }

  // Fallback when every Overpass server fails: Nominatim (free, CORS-enabled).
  async function searchMosquesNominatim(position) {
    const lat = Number(position.latitude.toFixed(3));
    const lon = Number(position.longitude.toFixed(3));
    const delta = 0.09; // roughly 10 km each way
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=40&bounded=1&accept-language=id&q=masjid" +
      `&viewbox=${lon - delta},${lat + delta},${lon + delta},${lat - delta}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = await response.json();
      const found = [];
      for (const row of Array.isArray(rows) ? rows : []) {
        const isMosque =
          (row.category === "amenity" && row.type === "place_of_worship") ||
          (row.category === "building" && row.type === "mosque");
        const latitude = Number(row.lat);
        const longitude = Number(row.lon);
        if (!isMosque || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
        found.push(toMosque(position, latitude, longitude, { name: row.name || "" }));
      }
      return sortAndDedupe(found);
    } finally {
      clearTimeout(timer);
    }
  }

  function renderMosques(mosques) {
    const shown = mosques.slice(0, MAX_MOSQUES_SHOWN);
    $("#mosque-list").innerHTML = shown
      .map(
        (mosque, index) => `
          <li class="mosque-item">
            <span class="mosque-rank">${index + 1}</span>
            <div class="mosque-info">
              <strong>${escapeHTML(mosque.name)}</strong>
              <small>${mosque.kind} • ${formatDistance(mosque.distance)}${mosque.address ? ` • ${escapeHTML(mosque.address)}` : ""}</small>
            </div>
            <a class="mosque-route" href="${mapsRouteUrl(mosque.latitude, mosque.longitude)}" target="_blank" rel="noopener noreferrer" aria-label="Buka rute ke ${escapeHTML(mosque.name)}">Rute</a>
          </li>`,
      )
      .join("");
    $("#mosque-list").hidden = false;
    return shown.length;
  }

  function openMosqueSheet() {
    $("#mosque-sheet").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeMosqueSheet() {
    $("#mosque-sheet").hidden = true;
    document.body.style.overflow = "";
    state.mosqueRun += 1; // ignore results of a search the user walked away from
    state.mosqueBusy = false;
  }

  function setMosqueUI({ loading = false, status = "", retry = false, mapsLink = null } = {}) {
    $("#mosque-spinner").hidden = !loading;
    $("#mosque-status").textContent = status;
    $("#mosque-retry").hidden = !retry;
    const link = $("#mosque-maps-link");
    if (mapsLink) link.href = mapsLink;
    link.hidden = !mapsLink;
  }

  async function findNearestMosque(force = false) {
    if (state.mosqueBusy) {
      openMosqueSheet();
      return;
    }
    state.mosqueBusy = true;
    const run = ++state.mosqueRun;
    const stale = () => run !== state.mosqueRun;

    // Open the sheet immediately so the tap always gives visible feedback.
    $("#mosque-list").hidden = true;
    $("#mosque-list").innerHTML = "";
    setMosqueUI({ loading: true, status: "Menentukan lokasi GPS Anda…" });
    openMosqueSheet();

    let position = null;
    try {
      // The compass check just produced a fix; reuse it if it is recent, else ask GPS again.
      if (state.position && Date.now() - (state.position.at || 0) < FRESH_POSITION_MS) {
        position = state.position;
      } else {
        try {
          position = await getFreshPosition();
          state.position = position;
        } catch (error) {
          if (!state.position) {
            if (stale()) return;
            setMosqueUI({ status: locationErrorMessage(error && error.code ? error : { code: 0 }), retry: true });
            return;
          }
          position = state.position; // fall back to the fix that unlocked the compass
        }
      }
      if (stale()) return;

      const mapsLink = mapsSearchUrl(position.latitude, position.longitude);

      const cache = state.mosqueCache;
      const cacheKey = `${position.latitude.toFixed(3)},${position.longitude.toFixed(3)}`;
      if (!force && cache && cache.key === cacheKey && Date.now() - cache.at < MOSQUE_CACHE_MS) {
        const count = renderMosques(cache.mosques);
        setMosqueUI({ status: `${count} masjid terdekat dalam radius ${cache.radius / 1000} km.`, retry: true, mapsLink });
        return;
      }

      if (navigator.onLine === false) {
        setMosqueUI({ status: "Tidak ada koneksi internet. Pencarian masjid membutuhkan internet.", retry: true, mapsLink });
        return;
      }

      setMosqueUI({ loading: true, status: "Mencari masjid di sekitar Anda…" });

      let mosques = [];
      let usedRadius = MOSQUE_RADII[0];
      let overpassFailed = false;
      try {
        for (const radius of MOSQUE_RADII) {
          usedRadius = radius;
          mosques = await searchMosquesOverpass(position, radius);
          if (stale()) return;
          if (mosques.length) break;
        }
      } catch {
        overpassFailed = true;
      }
      if (stale()) return;

      if (overpassFailed) {
        setMosqueUI({ loading: true, status: "Server peta utama sibuk, mencoba sumber cadangan…" });
        try {
          mosques = await searchMosquesNominatim(position);
          usedRadius = 10000;
          overpassFailed = false;
        } catch {
          /* handled below */
        }
        if (stale()) return;
      }

      if (overpassFailed) {
        setMosqueUI({
          status: "Layanan peta sedang sibuk atau tidak terjangkau dari jaringan Anda. Coba lagi, atau buka pencarian di Google Maps.",
          retry: true,
          mapsLink,
        });
        return;
      }

      if (!mosques.length) {
        setMosqueUI({
          status: `Belum ada data masjid di OpenStreetMap dalam radius ${usedRadius / 1000} km. Coba cari lewat Google Maps.`,
          retry: true,
          mapsLink,
        });
        return;
      }

      state.mosqueCache = { key: cacheKey, mosques, radius: usedRadius, at: Date.now() };
      const count = renderMosques(mosques);
      setMosqueUI({ status: `${count} masjid terdekat dalam radius ${usedRadius / 1000} km.`, retry: true, mapsLink });
      $("#mosque-sheet .mosque-sheet").scrollTop = 0;
    } finally {
      if (!stale()) state.mosqueBusy = false;
    }
  }

  // ===========================================================================
  // Prayer times + adhan
  // ===========================================================================
  const PRAYER_LABELS = { imsak: "Imsak", fajr: "Subuh", sunrise: "Terbit", dhuhr: "Dzuhur", asr: "Ashar", maghrib: "Maghrib", isha: "Isya" };
  const FARD = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  const ROW_ORDER = ["imsak", "fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
  const WIB_OFFSET_MS = 7 * 3600e3;
  const ADHAN_WINDOW_MS = 90 * 1000;
  const BELL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9ZM10 20a2 2 0 0 0 4 0" /></svg>';

  const prayer = {
    city: null,
    dayOffset: 0,
    cache: new Map(),
    adhan: { master: false, perPrayer: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true } },
    wake: false,
    primed: false,
    armedAt: Date.now(),
    lastFired: storage.get("QuraviaLastAdhan", ""),
    lastNextKey: "",
    todayKey: "",
    hiddenAt: 0,
    mode: null, // "auto" (follow my location) | "manual" | null (not chosen yet)
    lastLocateAt: 0,
    locating: false,
    sentinel: null,
    current: null, // { key, variant, audio, test, blocked }
  };

  const adhanAudio = {
    fajr: new Audio("./assets/audio/adzan-subuh.mp3"),
    regular: new Audio("./assets/audio/adzan-makkah.mp3"),
  };

  const dateFormatter = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  function wibParts(ms) {
    const d = new Date(ms + WIB_OFFSET_MS);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() };
  }

  function addDays(date, days) {
    const t = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay() };
  }

  function formatDate(date) {
    return dateFormatter.format(new Date(Date.UTC(date.y, date.m - 1, date.d)));
  }

  function timesFor(date, city = prayer.city) {
    const key = `${city.id}|${date.y}-${date.m}-${date.d}`;
    let times = prayer.cache.get(key);
    if (!times) {
      times = PrayerTimes.calculate(date.y, date.m, date.d, city);
      if (prayer.cache.size > 60) prayer.cache.clear();
      prayer.cache.set(key, times);
    }
    return times;
  }

  const clock = (ms) => PrayerTimes.formatTime(ms, 7);
  const wibDayKey = (ms) => {
    const parts = wibParts(ms);
    return `${parts.y}-${parts.m}-${parts.d}`;
  };
  const clockWithSeconds = (ms) => {
    const d = new Date(ms + WIB_OFFSET_MS);
    return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
  };

  function prayerDisplayName(key, date) {
    return key === "dhuhr" && date.dow === 5 ? "Jumat" : PRAYER_LABELS[key];
  }

  function nextPrayer(now = Date.now()) {
    const today = wibParts(now);
    for (let offset = 0; offset <= 1; offset += 1) {
      const date = addDays(today, offset);
      const times = timesFor(date);
      for (const key of FARD) {
        if (times[key] !== null && times[key] > now) return { key, at: times[key], date };
      }
    }
    return null;
  }

  function formatCountdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function renderPrayerScreen() {
    const now = Date.now();
    const today = wibParts(now);
    const date = addDays(today, prayer.dayOffset);
    const times = timesFor(date);
    const isToday = prayer.dayOffset === 0;
    const upcoming = nextPrayer(now);
    const nextKey = isToday && upcoming && upcoming.date.d === date.d ? upcoming.key : "";
    // The prayer whose time has begun and not yet ended (latest fard that has already started today).
    const currentKey = isToday ? [...FARD].reverse().find((key) => times[key] !== null && times[key] <= now) || "" : "";

    $("#prayer-day-title").textContent = formatDate(date);
    $("#prayer-today").hidden = isToday;

    $("#prayer-list").innerHTML = ROW_ORDER.map((key) => {
      const isFard = FARD.includes(key);
      const name = prayerDisplayName(key, date);
      const classes = ["prayer-row"];
      if (!isFard) classes.push("prayer-row--minor");
      if (isToday && times[key] !== null && times[key] <= now && key !== nextKey) classes.push("prayer-row--passed");
      if (key === nextKey) classes.push("prayer-row--next");
      if (key === currentKey) classes.push("prayer-row--current");
      const sub =
        (key === "dhuhr" && date.dow === 5 ? "<small>SALAT JUMAT • masuk waktu Dzuhur</small>" : "") +
        (key === currentKey ? '<small class="prayer-now-badge">● SEDANG BERLANGSUNG</small>' : "");
      const on = prayer.adhan.perPrayer[key] !== false;
      const bell = isFard
        ? `<button class="adhan-bell" type="button" data-adhan-toggle="${key}" aria-pressed="${on}" aria-label="Adzan ${name} ${on ? "aktif" : "nonaktif"}">${BELL_SVG}</button>`
        : '<span aria-hidden="true"></span>';
      return `<li class="${classes.join(" ")}" data-prayer="${key}"${key === currentKey ? ' aria-current="time"' : ""}><span class="prayer-row-name">${name}${sub}</span><span class="prayer-row-time">${clock(times[key])}</span>${bell}</li>`;
    }).join("");

    const banner = $("#jumat-banner");
    banner.hidden = date.dow !== 5;
    if (date.dow === 5) {
      $("#jumat-title").textContent = "Hari Jumat • Salat Jumat";
      $("#jumat-text").textContent = `Salat Jumat dimulai saat masuk waktu Dzuhur, sekitar pukul ${clock(times.dhuhr)} WIB di ${prayer.city.name}. Jam pelaksanaan di masjid setempat dapat berbeda; ikuti pengumuman takmir.`;
    }

    const jumatNext = $("#jumat-next");
    if (date.dow === 5) {
      jumatNext.hidden = true;
    } else {
      const ahead = addDays(date, (5 - date.dow + 7) % 7 || 7);
      jumatNext.textContent = `Salat Jumat berikutnya: ${formatDate(ahead)} • sekitar ${clock(timesFor(ahead).dhuhr)} WIB (masuk waktu Dzuhur).`;
      jumatNext.hidden = false;
    }

    prayer.lastNextKey = upcoming ? `${upcoming.date.d}:${upcoming.key}` : "";
    updateCountdowns();
    syncAdhanUI();
  }

  function updateCountdowns() {
    if (!prayer.city) return;
    const next = nextPrayer();
    if (!next) return;
    const name = prayerDisplayName(next.key, next.date);
    const countdown = formatCountdown(next.at - Date.now());
    const sameDay = next.date.d === wibParts(Date.now()).d;

    if (state.currentScreen === "prayer") {
      $("#prayer-now").textContent = `Sekarang ${clockWithSeconds(Date.now())} WIB`;
      $("#prayer-next-name").textContent = next.key === "dhuhr" && next.date.dow === 5 ? "Salat Jumat" : name;
      $("#prayer-next-time").textContent = clock(next.at);
      $("#prayer-countdown").textContent = `− ${countdown}`;
      $("#prayer-hero-label").textContent = sameDay ? "Waktu salat berikutnya" : "Besok, waktu salat berikutnya";
    }
    if (state.currentScreen === "home") {
      $("#home-prayer-name").textContent = `${next.key === "dhuhr" && next.date.dow === 5 ? "Salat Jumat" : name} • ${prayer.city.name.replace(/^(Kota|Kab\.) /, "")}`;
      $("#home-prayer-time").textContent = clock(next.at);
      $("#home-prayer-countdown").textContent = `− ${countdown}`;
      $("#home-prayer-label").textContent = sameDay ? "Waktu salat berikutnya" : "Besok";
    }
  }

  // ---- adhan playback ----
  function primeAdhanAudio() {
    if (prayer.primed) return;
    prayer.primed = true;
    for (const audio of Object.values(adhanAudio)) {
      audio.preload = "auto";
      audio.muted = true;
      const attempt = audio.play();
      if (attempt && attempt.then) {
        attempt
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
            syncAdhanUI();
          })
          .catch(() => {
            audio.muted = false;
            prayer.primed = false;
          });
      }
    }
  }

  function syncAdhanUI() {
    const master = prayer.adhan.master;
    $("#adhan-master").setAttribute("aria-checked", String(master));
    $("#adhan-status").textContent = master
      ? "Aktif • berbunyi saat waktu salat tiba (biarkan aplikasi terbuka)"
      : "Nonaktif • tidak ada suara adzan otomatis";
    $$("[data-adhan-toggle]").forEach((button) => {
      const key = button.dataset.adhanToggle;
      const on = prayer.adhan.perPrayer[key] !== false;
      button.setAttribute("aria-pressed", String(on));
      button.setAttribute("aria-label", `Adzan ${PRAYER_LABELS[key]} ${on ? "aktif" : "nonaktif"}`);
    });
    const current = prayer.current;
    $("#adhan-test-fajr").classList.toggle("adhan-test--playing", Boolean(current && current.test && current.variant === "fajr"));
    $("#adhan-test-regular").classList.toggle("adhan-test--playing", Boolean(current && current.test && current.variant === "regular"));
    $("#wake-switch").setAttribute("aria-checked", String(prayer.wake));
  }

  function showAdhanPlayer({ title, sub, blocked }) {
    $("#adhan-player").hidden = false;
    $("#adhan-player-title").textContent = title;
    $("#adhan-player-sub").textContent = sub;
    $("#adhan-player-stop").textContent = blocked ? "Putar" : "Hentikan";
  }

  function stopAdhan() {
    const current = prayer.current;
    prayer.current = null;
    if (current) {
      current.audio.pause();
      current.audio.currentTime = 0;
    }
    $("#adhan-player").hidden = true;
    syncAdhanUI();
  }

  async function playAdhan(key, options = {}) {
    const variant = key === "fajr" ? "fajr" : "regular";
    const audio = adhanAudio[variant];
    stopAdhan();
    pauseMurottal();

    audio.preload = "auto";
    audio.muted = false;
    audio.volume = 1;
    audio.currentTime = 0;
    const today = wibParts(Date.now());
    const label = options.test
      ? `Contoh adzan ${variant === "fajr" ? "Subuh" : "Dzuhur–Isya"}`
      : `Adzan ${prayerDisplayName(key, today)}`;
    const sub = options.test ? "Pratinjau suara" : `${prayer.city.name} • ${clock(timesFor(today)[key])} WIB`;
    prayer.current = { key, variant, audio, test: Boolean(options.test), blocked: false, label, sub };

    try {
      await audio.play();
      showAdhanPlayer({ title: label, sub, blocked: false });
    } catch {
      // Autoplay was refused by the browser: ask for one tap.
      if (prayer.current) prayer.current.blocked = true;
      showAdhanPlayer({ title: `${label} — ketuk untuk memutar`, sub: "Browser menahan suara otomatis", blocked: true });
    }
    syncAdhanUI();
  }

  function checkAdhan() {
    if (!prayer.adhan.master || prayer.current) return;
    const now = Date.now();
    const date = wibParts(now);
    const times = timesFor(date);
    for (const key of FARD) {
      if (prayer.adhan.perPrayer[key] === false) continue;
      const at = times[key];
      if (at === null || now < at || now - at > ADHAN_WINDOW_MS) continue;
      if (at < prayer.armedAt - 1000) continue; // do not announce a prayer that began before the app was opened/armed
      const id = `${date.y}-${date.m}-${date.d}:${key}`;
      if (prayer.lastFired === id) continue;
      prayer.lastFired = id;
      storage.set("QuraviaLastAdhan", id);
      playAdhan(key);
      return;
    }
  }

  function prayerTick() {
    if (!prayer.city) return;
    const dayKey = wibDayKey(Date.now());
    const dayChanged = dayKey !== prayer.todayKey;
    if (dayChanged) {
      // Midnight passed (or the app woke up on a later day): always return to "today".
      prayer.todayKey = dayKey;
      prayer.dayOffset = 0;
    }
    updateCountdowns();
    checkAdhan();
    if (state.currentScreen === "prayer") {
      const next = nextPrayer();
      const marker = next ? `${next.date.d}:${next.key}` : "";
      if (dayChanged || (marker !== prayer.lastNextKey && prayer.dayOffset === 0)) renderPrayerScreen();
    }
  }

  // Called whenever the app comes back to the foreground.
  function refreshPrayerOnResume() {
    if (!prayer.city) return;
    const away = prayer.hiddenAt ? Date.now() - prayer.hiddenAt : 0;
    prayer.hiddenAt = 0;
    if (away > 5 * 60 * 1000) prayer.dayOffset = 0; // coming back after a while: show today, not a browsed day
    prayer.todayKey = ""; // force prayerTick() to treat this as a fresh day check
    prayerTick();
    if (state.currentScreen === "prayer") renderPrayerScreen();
    maybeFollowLocation();
  }

  async function applyWakeLock() {
    if (!prayer.wake || document.hidden || !("wakeLock" in navigator) || prayer.sentinel) return;
    try {
      prayer.sentinel = await navigator.wakeLock.request("screen");
      prayer.sentinel.addEventListener("release", () => {
        prayer.sentinel = null;
      });
    } catch {
      prayer.sentinel = null;
    }
  }

  function releaseWakeLock() {
    if (prayer.sentinel) prayer.sentinel.release().catch(() => {});
    prayer.sentinel = null;
  }

  function populateCities() {
    $("#prayer-city").innerHTML = SumutCities.cities
      .map((city) => `<option value="${city.id}">${escapeHTML(city.name)}</option>`)
      .join("");
    $("#prayer-city").value = prayer.city.id;
  }

  function getCoarsePosition() {
    return new Promise((resolve, reject) => {
      if (!window.isSecureContext || !navigator.geolocation) {
        reject({ code: 0 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, at: Date.now() }),
        reject,
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }, // refreshes are already limited to once per 15 minutes
      );
    });
  }

  function describeLocation(city, distanceKm) {
    return `Mengikuti lokasi Anda: ${city.name} (±${Math.round(distanceKm)} km dari pusat kota). Lokasi tidak dikirim ke mana pun. Pilih kota di atas untuk mengunci manual.`;
  }

  // Applies the city nearest to a position; returns true when it is inside Sumatera Utara.
  function applyPositionToPrayer(position, announce) {
    state.position = position;
    prayer.lastLocateAt = Date.now();
    if (!isInNorthSumatra(position.latitude, position.longitude)) {
      if (announce) $("#prayer-location-note").textContent = "Lokasi Anda di luar Sumatera Utara. Pilih kabupaten/kota secara manual.";
      return false;
    }
    const { city, distanceKm } = SumutCities.nearest(position.latitude, position.longitude);
    if (city.id !== prayer.city.id) setPrayerCity(city.id);
    $("#prayer-location-note").textContent = describeLocation(city, distanceKm);
    return true;
  }

  async function useMyLocationForPrayer() {
    const button = $("#prayer-gps");
    const note = $("#prayer-location-note");
    button.disabled = true;
    note.textContent = "Menentukan lokasi…";
    try {
      const position = await getFreshPosition();
      if (applyPositionToPrayer(position, true)) {
        prayer.mode = "auto";
        storage.set("QuraviaCityMode", "auto");
      }
    } catch (error) {
      note.textContent = locationErrorMessage(error && error.code ? error : { code: 0 });
    } finally {
      button.disabled = false;
    }
  }

  // Silent refresh when the app opens/resumes: only if the user did not lock a city manually
  // and location access is already granted (so no new permission prompt appears on open).
  async function maybeFollowLocation() {
    if (prayer.mode === "manual" || prayer.locating || !navigator.geolocation) return;
    if (Date.now() - prayer.lastLocateAt < 15 * 60 * 1000) return;
    prayer.locating = true;
    try {
      let allowed = prayer.mode === "auto";
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const status = await navigator.permissions.query({ name: "geolocation" });
          allowed = status.state === "granted";
        } catch {
          /* keep the previous value */
        }
      }
      if (!allowed) return;
      applyPositionToPrayer(await getCoarsePosition(), false);
    } catch {
      /* location unavailable: keep the current city */
    } finally {
      prayer.locating = false;
    }
  }

  function setPrayerCity(id) {
    prayer.city = SumutCities.byId(id);
    storage.set("QuraviaCity", prayer.city.id);
    $("#prayer-city").value = prayer.city.id;
    prayer.dayOffset = 0;
    renderPrayerScreen();
  }

  function bindPrayerEvents() {
    $("#prayer-city").addEventListener("change", (event) => {
      prayer.mode = "manual";
      storage.set("QuraviaCityMode", "manual");
      $("#prayer-location-note").textContent = "Kota dikunci manual. Ketuk ikon target untuk kembali mengikuti lokasi Anda.";
      setPrayerCity(event.target.value);
    });
    $("#prayer-gps").addEventListener("click", useMyLocationForPrayer);
    $("#prayer-prev-day").addEventListener("click", () => {
      prayer.dayOffset -= 1;
      renderPrayerScreen();
    });
    $("#prayer-next-day").addEventListener("click", () => {
      prayer.dayOffset += 1;
      renderPrayerScreen();
    });
    $("#prayer-today").addEventListener("click", () => {
      prayer.dayOffset = 0;
      renderPrayerScreen();
    });

    $("#prayer-list").addEventListener("click", (event) => {
      const bell = event.target.closest("[data-adhan-toggle]");
      if (!bell) return;
      const key = bell.dataset.adhanToggle;
      prayer.adhan.perPrayer[key] = prayer.adhan.perPrayer[key] === false;
      storage.set("QuraviaAdhan", prayer.adhan);
      syncAdhanUI();
      showToast(`Adzan ${PRAYER_LABELS[key]} ${prayer.adhan.perPrayer[key] ? "diaktifkan" : "dimatikan"}.`);
    });

    $("#adhan-master").addEventListener("click", () => {
      prayer.adhan.master = !prayer.adhan.master;
      storage.set("QuraviaAdhan", prayer.adhan);
      if (prayer.adhan.master) {
        prayer.armedAt = Date.now();
        primeAdhanAudio();
        showToast("Adzan otomatis aktif. Biarkan Quravia terbuka agar adzan berbunyi.");
      } else {
        stopAdhan();
        showToast("Adzan otomatis dimatikan.");
      }
      syncAdhanUI();
    });

    const testButton = (selector, key) =>
      $(selector).addEventListener("click", () => {
        const variant = key === "fajr" ? "fajr" : "regular";
        if (prayer.current && prayer.current.test && prayer.current.variant === variant) {
          stopAdhan();
          return;
        }
        playAdhan(key, { test: true });
      });
    testButton("#adhan-test-fajr", "fajr");
    testButton("#adhan-test-regular", "dhuhr");

    $("#adhan-player-stop").addEventListener("click", () => {
      const current = prayer.current;
      if (current && current.blocked) {
        current.audio.play().then(() => {
          current.blocked = false;
          showAdhanPlayer({ title: current.label, sub: current.sub, blocked: false });
        }).catch(() => stopAdhan());
        return;
      }
      stopAdhan();
    });

    $("#wake-switch").addEventListener("click", () => {
      prayer.wake = !prayer.wake;
      storage.set("QuraviaWake", prayer.wake);
      if (prayer.wake) applyWakeLock();
      else releaseWakeLock();
      syncAdhanUI();
    });

    for (const audio of Object.values(adhanAudio)) {
      audio.addEventListener("ended", stopAdhan);
    }

    // Browsers only allow sound after a user gesture: prepare the audio on the first tap.
    const primeOnce = () => {
      if (prayer.adhan.master) primeAdhanAudio();
    };
    document.addEventListener("pointerdown", primeOnce, { once: true });
    document.addEventListener("keydown", primeOnce, { once: true });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        prayer.hiddenAt = Date.now();
        return;
      }
      refreshPrayerOnResume();
      applyWakeLock();
    });
    // Pages restored from the back/forward cache (and some installed-app resumes) do not fire visibilitychange.
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) refreshPrayerOnResume();
    });
  }

  function initPrayer() {
    if (typeof SumutCities === "undefined" || typeof PrayerTimes === "undefined") {
      // Scripts failed to load: hide the feature instead of breaking the app.
      $$('[data-go="prayer"]').forEach((item) => {
        item.hidden = true;
      });
      return;
    }
    prayer.city = SumutCities.byId(storage.get("QuraviaCity", "medan"));
    prayer.mode = storage.get("QuraviaCityMode", null);
    prayer.todayKey = wibDayKey(Date.now());
    const saved = storage.get("QuraviaAdhan", null);
    if (saved && typeof saved === "object") {
      prayer.adhan.master = Boolean(saved.master);
      Object.assign(prayer.adhan.perPrayer, saved.perPrayer || {});
    }
    prayer.wake = Boolean(storage.get("QuraviaWake", false));
    $("#wake-row").hidden = !("wakeLock" in navigator);
    populateCities();
    renderPrayerScreen();
    setInterval(prayerTick, 1000);
    if (prayer.wake) applyWakeLock();
    if (!prayer.mode) {
      $("#prayer-location-note").textContent = `Lokasi: ${prayer.city.name}. Ketuk ikon target untuk mengikuti lokasi Anda.`;
    }
    maybeFollowLocation();
  }

  // ===========================================================================
  // Murottal (verse-by-verse recitation with synchronized scrolling)
  // ===========================================================================
  const RECITERS = [
    { id: "alafasy", name: "Mishary Alafasy", folder: "Alafasy_128kbps", edition: "ar.alafasy", bitrate: 128 },
    { id: "husary", name: "Mahmoud Al-Husary", folder: "Husary_64kbps", edition: "ar.husary", bitrate: 64 },
    { id: "minshawy", name: "Al-Minshawi (Murattal)", folder: "Minshawy_Murattal_128kbps", edition: "ar.minshawi", bitrate: 64 },
    { id: "abdulbasit", name: "Abdul Basit (Murattal)", folder: "Abdul_Basit_Murattal_64kbps", edition: "ar.abdulbasitmurattal", bitrate: 64 },
  ];

  const murottal = {
    players: [new Audio(), new Audio()],
    active: 0,
    preloaded: null, // { index, surahId, verseId, reciterId }
    surah: null,
    verseId: 0,
    status: "idle", // idle | loading | playing | paused | error
    urls: [],
    sourceIndex: 0,
    switching: false,
    continuous: storage.get("QuraviaMurottalContinuous", true),
    follow: storage.get("QuraviaMurottalFollow", true),
    reciterId: storage.get("QuraviaReciter", "alafasy"),
  };

  const mAudio = () => murottal.players[murottal.active];
  const currentReciter = () => RECITERS.find((item) => item.id === murottal.reciterId) || RECITERS[0];
  const pad3 = (value) => String(value).padStart(3, "0");

  function verseAudioUrls(surahId, verseId) {
    const reciter = currentReciter();
    const primary = `https://everyayah.com/data/${reciter.folder}/${pad3(surahId)}${pad3(verseId)}.mp3`;
    const before = state.surahs.slice(0, surahId - 1).reduce((sum, item) => sum + item.total_verses, 0);
    const fallback = `https://cdn.islamic.network/quran/audio/${reciter.bitrate}/${reciter.edition}/${before + verseId}.mp3`;
    return [primary, fallback];
  }

  const murottalTotal = () => (murottal.surah ? murottal.surah.verses.length : 0);
  const verseCard = (id) => $(`.verse-card[data-verse="${id}"]`, $("#verse-list"));

  function prepareMurottal(surah) {
    murottal.surah = surah;
    murottal.verseId = 0;
    murottal.status = "idle";
    $("#murottal-bar").hidden = false;
    renderMurottalUI();
  }

  function renderMurottalUI() {
    const total = murottalTotal();
    const status = murottal.status;
    const active = status !== "idle";
    const playingLike = status === "playing" || status === "loading";

    $$(".verse-card", $("#verse-list")).forEach((card) => {
      const id = Number(card.dataset.verse);
      const isCurrent = active && id === murottal.verseId;
      card.classList.toggle("verse-card--playing", isCurrent);
      const button = $(".verse-play", card);
      button.classList.toggle("verse-play--playing", isCurrent && status === "playing");
      button.classList.toggle("is-loading", isCurrent && status === "loading");
      const label = isCurrent && playingLike ? `Jeda ayat ${id}` : `Putar ayat ${id}`;
      button.setAttribute("aria-label", label);
    });

    const play = $("#murottal-play");
    play.classList.toggle("is-playing", status === "playing");
    play.classList.toggle("is-loading", status === "loading");
    play.setAttribute("aria-label", playingLike ? "Jeda murottal" : "Putar murottal");

    $("#murottal-title").textContent = murottal.surah ? murottal.surah.transliteration : "Murottal";
    const verseText = active ? `Ayat ${murottal.verseId} dari ${total}` : `${total} ayat`;
    const statusText = { idle: "Ketuk ▶ untuk memulai", loading: "Memuat audio…", playing: "Sedang diputar", paused: "Dijeda", error: "Audio gagal dimuat" }[status];
    $("#murottal-sub").textContent = `${verseText} • ${statusText}`;
    $("#murottal-prev").disabled = active && murottal.verseId <= 1;
    $("#murottal-next").disabled = active && murottal.verseId >= total;
    $("#murottal-continuous").setAttribute("aria-pressed", String(murottal.continuous));
    $("#murottal-follow").setAttribute("aria-pressed", String(murottal.follow));
    $("#murottal-reciter").value = murottal.reciterId;
    updateMediaSession();
  }

  function setMurottalStatus(status) {
    murottal.status = status;
    renderMurottalUI();
  }

  function scrollToVerse(id) {
    if (!murottal.follow) return;
    const card = verseCard(id);
    if (!card) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tall = card.getBoundingClientRect().height > window.innerHeight * 0.55;
    card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: tall ? "start" : "center" });
  }

  // The idle player fetches the next verse while the current one plays, so the
  // hand-over is gapless and nothing is downloaded twice.
  function preloadNextVerse(nextId) {
    murottal.preloaded = null;
    const saveData = navigator.connection && navigator.connection.saveData;
    if (!murottal.surah || nextId > murottalTotal() || !navigator.onLine || saveData) return;
    const index = 1 - murottal.active;
    const idle = murottal.players[index];
    idle.preload = "auto";
    idle.src = verseAudioUrls(murottal.surah.id, nextId)[0];
    idle.load();
    murottal.preloaded = { index, surahId: murottal.surah.id, verseId: nextId, reciterId: murottal.reciterId };
  }

  function playVerse(verseId) {
    if (!murottal.surah || verseId < 1 || verseId > murottalTotal()) return;
    stopAdhan();
    murottal.verseId = verseId;
    murottal.sourceIndex = 0;
    murottal.urls = verseAudioUrls(murottal.surah.id, verseId);
    murottal.switching = true;

    const ready = murottal.preloaded;
    const reuse = ready && ready.surahId === murottal.surah.id && ready.verseId === verseId && ready.reciterId === murottal.reciterId;
    const previous = mAudio();
    previous.pause();
    if (reuse) {
      murottal.active = ready.index;
    } else {
      murottal.players[1 - murottal.active].removeAttribute("src");
      murottal.players[1 - murottal.active].load();
      mAudio().src = murottal.urls[0];
    }
    murottal.preloaded = null;

    const audio = mAudio();
    audio.currentTime = 0;
    setMurottalStatus("loading");
    const attempt = audio.play();
    if (attempt && attempt.catch) {
      attempt.catch((error) => {
        if (error && error.name === "AbortError") return;
        murottal.switching = false;
        if (error && error.name === "NotAllowedError") setMurottalStatus("paused");
        else handleMurottalError();
      });
    }
    scrollToVerse(verseId);
    preloadNextVerse(verseId + 1);
  }

  function pauseMurottal() {
    if (murottal.status === "playing" || murottal.status === "loading") {
      mAudio().pause();
      setMurottalStatus("paused");
    }
  }

  function resumeMurottal() {
    stopAdhan();
    setMurottalStatus("loading");
    const attempt = mAudio().play();
    if (attempt && attempt.catch) attempt.catch(() => handleMurottalError());
  }

  function stopMurottal() {
    if (murottal.status === "idle" && !murottal.players.some((player) => player.getAttribute("src"))) return;
    murottal.status = "idle";
    murottal.preloaded = null;
    for (const player of murottal.players) {
      player.pause();
      player.removeAttribute("src");
      player.load();
    }
    murottal.verseId = 0;
    if (murottal.surah && state.currentScreen === "reader") renderMurottalUI();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
  }

  function handleMurottalError() {
    if (murottal.status === "idle") return;
    if (murottal.sourceIndex === 0 && murottal.urls[1]) {
      murottal.sourceIndex = 1;
      mAudio().src = murottal.urls[1];
      const attempt = mAudio().play();
      if (attempt && attempt.catch) attempt.catch(() => {});
      return;
    }
    murottal.switching = false;
    setMurottalStatus("error");
    showToast("Audio murottal tidak dapat dimuat. Periksa koneksi internet lalu coba lagi.");
  }

  function firstVisibleVerse() {
    const cards = $$(".verse-card", $("#verse-list"));
    const found = cards.find((card) => card.getBoundingClientRect().bottom > 130);
    return found ? Number(found.dataset.verse) : 1;
  }

  function toggleVerse(verseId) {
    const sameVerse = murottal.status !== "idle" && murottal.verseId === verseId;
    if (sameVerse) {
      if (murottal.status === "playing" || murottal.status === "loading") pauseMurottal();
      else if (murottal.status === "paused") resumeMurottal();
      else playVerse(verseId);
      return;
    }
    playVerse(verseId);
  }

  function toggleMainMurottal() {
    if (murottal.status === "playing" || murottal.status === "loading") pauseMurottal();
    else if (murottal.status === "paused") resumeMurottal();
    else playVerse(murottal.status === "error" && murottal.verseId ? murottal.verseId : firstVisibleVerse());
  }

  function updateMediaSession() {
    if (!("mediaSession" in navigator) || !murottal.surah || murottal.status === "idle") return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${murottal.surah.transliteration} • Ayat ${murottal.verseId}`,
        artist: currentReciter().name,
        album: "Quravia",
        artwork: [{ src: "./assets/icon-512.png", sizes: "512x512", type: "image/png" }],
      });
      navigator.mediaSession.playbackState = murottal.status === "playing" ? "playing" : "paused";
    } catch {
      /* Media Session is optional */
    }
  }

  function bindMurottalEvents() {
    for (const audio of murottal.players) {
      audio.preload = "auto";
      const isActive = () => audio === mAudio();
      audio.addEventListener("playing", () => {
        if (!isActive()) return;
        murottal.switching = false;
        if (murottal.status !== "idle") setMurottalStatus("playing");
      });
      audio.addEventListener("waiting", () => {
        if (isActive() && murottal.status === "playing") setMurottalStatus("loading");
      });
      audio.addEventListener("pause", () => {
        if (!isActive() || murottal.switching || audio.ended) return;
        if (murottal.status === "playing" || murottal.status === "loading") setMurottalStatus("paused");
      });
      audio.addEventListener("ended", () => {
        if (!isActive()) return;
        if (murottal.continuous && murottal.verseId < murottalTotal()) {
          playVerse(murottal.verseId + 1);
        } else {
          const finished = murottal.verseId;
          setMurottalStatus("paused");
          audio.currentTime = 0;
          $("#murottal-sub").textContent = `Ayat ${finished} dari ${murottalTotal()} • Selesai`;
        }
      });
      audio.addEventListener("error", () => {
        if (isActive()) handleMurottalError();
      });
    }

    $("#murottal-play").addEventListener("click", toggleMainMurottal);
    $("#murottal-prev").addEventListener("click", () => playVerse(murottal.status === "idle" ? firstVisibleVerse() : murottal.verseId - 1));
    $("#murottal-next").addEventListener("click", () => playVerse(murottal.status === "idle" ? firstVisibleVerse() : murottal.verseId + 1));
    $("#murottal-continuous").addEventListener("click", () => {
      murottal.continuous = !murottal.continuous;
      storage.set("QuraviaMurottalContinuous", murottal.continuous);
      renderMurottalUI();
      showToast(murottal.continuous ? "Memutar ayat berikutnya otomatis." : "Berhenti setelah satu ayat.");
    });
    $("#murottal-follow").addEventListener("click", () => {
      murottal.follow = !murottal.follow;
      storage.set("QuraviaMurottalFollow", murottal.follow);
      renderMurottalUI();
      if (murottal.follow && murottal.status !== "idle") scrollToVerse(murottal.verseId);
      showToast(murottal.follow ? "Layar mengikuti ayat yang dibacakan." : "Layar tidak lagi bergulir otomatis.");
    });
    $("#murottal-reciter").addEventListener("change", (event) => {
      murottal.reciterId = event.target.value;
      storage.set("QuraviaReciter", murottal.reciterId);
      if (murottal.status === "playing" || murottal.status === "loading") playVerse(murottal.verseId);
      else renderMurottalUI();
    });
  }

  function initMurottal() {
    $("#murottal-reciter").innerHTML = RECITERS.map((item) => `<option value="${item.id}">${escapeHTML(item.name)}</option>`).join("");
    $("#murottal-reciter").value = murottal.reciterId;
    if (!("mediaSession" in navigator)) return;
    const actions = {
      play: () => (murottal.status === "paused" ? resumeMurottal() : toggleMainMurottal()),
      pause: pauseMurottal,
      previoustrack: () => murottal.verseId > 1 && playVerse(murottal.verseId - 1),
      nexttrack: () => murottal.verseId < murottalTotal() && playVerse(murottal.verseId + 1),
    };
    for (const [name, handler] of Object.entries(actions)) {
      try {
        navigator.mediaSession.setActionHandler(name, handler);
      } catch {
        /* unsupported action */
      }
    }
  }

  // ---- Donation button (navbar). The address comes from js/site-config.js ----
  function safeExternalUrl(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value.trim());
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch {
      return null;
    }
  }

  function initDonation() {
    const link = $("#donate-link");
    const configured = window.QURAVIA_CONFIG && window.QURAVIA_CONFIG.donationUrl;
    const href = safeExternalUrl(configured);
    if (!href) {
      link.hidden = true; // no (valid) address configured: show nothing rather than a dead button
      if (configured) console.warn("[Quravia] donationUrl tidak valid; harus diawali https:// atau http://");
      return;
    }
    link.href = href;
    link.hidden = false;
  }

  // ---- Theme (light by default; the saved choice is applied before first paint by js/theme-init.js) ----
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#000000" : "#ffffff");
    const toggle = $("#theme-toggle");
    const label = theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap";
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("title", label);
  }

  function initTheme() {
    applyTheme(currentTheme());
    $("#theme-toggle").addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.classList.add("theme-animating");
      applyTheme(next);
      storage.set("QuraviaTheme", next);
      setTimeout(() => document.documentElement.classList.remove("theme-animating"), 300);
    });
  }

  function openInstallHelp() {
    $("#install-help").hidden = false;
  }

  async function handleInstall() {
    if (state.deferredInstallPrompt) {
      state.deferredInstallPrompt.prompt();
      const result = await state.deferredInstallPrompt.userChoice;
      if (result.outcome === "accepted") showToast("Quravia sedang dipasang.");
      state.deferredInstallPrompt = null;
      return;
    }
    openInstallHelp();
  }

  function setupInstallPrompt() {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (standalone) $("#install-button").hidden = true;

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      $("#install-button").hidden = false;
    });
    window.addEventListener("appinstalled", () => {
      state.deferredInstallPrompt = null;
      $("#install-button").hidden = true;
      showToast("Quravia berhasil dipasang.");
    });
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const navButton = event.target.closest("[data-go]");
      if (navButton) navigate(navButton.dataset.go);
    });

    bindSurahButtons($("#surah-list"));
    bindSurahButtons($("#short-list"));
    bindSurahButtons($("#popular-list"));

    $("#continue-card").addEventListener("click", (event) => openSurah(Number(event.currentTarget.dataset.surah || 1)));
    $("#back-button").addEventListener("click", () => navigate(state.readerOrigin || "quran"));

    $("#surah-search").addEventListener("input", (event) => {
      state.query = event.target.value;
      renderSurahs();
    });

    $$(".filter-chip").forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter;
        $$(".filter-chip").forEach((chip) => chip.classList.toggle("filter-chip--active", chip === button));
        renderSurahs();
      });
    });

    $("#font-decrease").addEventListener("click", () => setArabicSize(state.arabicSize - 2));
    $("#font-increase").addEventListener("click", () => setArabicSize(state.arabicSize + 2));
    $("#verse-list").addEventListener("click", (event) => {
      const playButton = event.target.closest("[data-play]");
      if (playButton) {
        toggleVerse(Number(playButton.dataset.play));
        return;
      }
      const button = event.target.closest("[data-bookmark]");
      if (!button) return;
      const key = button.dataset.bookmark;
      const index = state.bookmarks.indexOf(key);
      if (index >= 0) {
        state.bookmarks.splice(index, 1);
        button.classList.remove("bookmark-button--active");
        showToast("Penanda ayat dihapus.");
      } else {
        state.bookmarks.push(key);
        button.classList.add("bookmark-button--active");
        showToast("Ayat disimpan sebagai penanda.");
      }
      storage.set("QuraviaBookmarks", state.bookmarks);
    });

    $("#tasbih-button").addEventListener("click", incrementTasbih);
    $$(".dhikr-chip").forEach((button) => button.addEventListener("click", () => {
      state.tasbih.dhikr = button.dataset.dhikr;
      updateTasbih();
    }));
    $$(".target-chip").forEach((button) => button.addEventListener("click", () => {
      state.tasbih.target = Number(button.dataset.target);
      updateTasbih();
    }));
    $("#tasbih-reset").addEventListener("click", () => {
      state.tasbih.counts[state.tasbih.dhikr] = 0;
      updateTasbih();
      showToast("Hitungan diulang dari nol.");
    });

    $("#check-location").addEventListener("click", verifyLocation);
    $("#enable-compass").addEventListener("click", enableCompass);
    $("#find-mosque").addEventListener("click", () => findNearestMosque());
    $("#mosque-retry").addEventListener("click", () => findNearestMosque(true));
    $$("[data-close-mosque]").forEach((button) => button.addEventListener("click", closeMosqueSheet));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !$("#mosque-sheet").hidden) closeMosqueSheet();
    });
    document.addEventListener("visibilitychange", syncCompass);
    $("#install-button").addEventListener("click", handleInstall);
    $$('[data-close-modal]').forEach((button) => button.addEventListener("click", () => { $("#install-help").hidden = true; }));

    $("#start-app").addEventListener("click", () => {
      storage.set("QuraviaOnboarded", true);
      $("#onboarding").hidden = true;
    });

    safely("pengikat jadwal salat", bindPrayerEvents);
    safely("pengikat murottal", bindMurottalEvents);

    window.addEventListener("online", () => showToast("Koneksi internet kembali tersedia."));
    window.addEventListener("offline", () => showToast("Mode offline aktif. Al-Qur’an tetap dapat dibaca."));
  }

  async function loadQuranIndex() {
    try {
      const response = await fetch("./data/quran/index.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.surahs = await response.json();
      renderSurahs();
      renderShortSurahs();
      renderPopularSurahs();
      updateContinueCard();
    } catch {
      $("#surah-list").innerHTML = `<div class="empty-state"><h2>Data Al-Qur’an belum tersedia</h2><p>Muat ulang aplikasi saat koneksi internet tersedia.</p></div>`;
      showToast("Data Al-Qur’an belum dapat dimuat.");
    }
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
    }
  }

  function initialize() {
    const today = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
    $("#today-label").textContent = today;
    $("#onboarding").hidden = storage.get("QuraviaOnboarded", false);
    document.documentElement.style.setProperty("--arabic-size", `${state.arabicSize}px`);
    bindEvents();
    safely("jadwal salat", initPrayer);
    safely("murottal", initMurottal);
    safely("tasbih", updateTasbih);
    safely("pemasangan", setupInstallPrompt);
    safely("tema", initTheme);
    safely("donasi", initDonation);
    safely("footer", () => {
      $("#footer-year").textContent = String(new Date().getFullYear());
    });
    registerServiceWorker();
    loadQuranIndex();
  }

  initialize();
})();
