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
    headingReceived: false,
    toastTimer: null,
    arabicSize: storage.get("quranSumutArabicSize", 32),
    bookmarks: storage.get("quranSumutBookmarks", []),
    tasbih: storage.get("quranSumutTasbih", {
      dhikr: "Subhanallah",
      target: 33,
      counts: { Subhanallah: 0, Alhamdulillah: 0, "Allahu Akbar": 0 },
    }),
  };

  const screenMeta = {
    home: ["ASSALAMU’ALAIKUM", "Quran Sumut"],
    quran: ["BACA & RENUNGKAN", "Al-Qur’an"],
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
    if (!options.keepScroll) window.scrollTo({ top: 0, behavior: "auto" });
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
    const lastRead = storage.get("quranSumutLastRead", { surah: 1, ayah: 1 });
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
          <button class="bookmark-button${bookmarked ? " bookmark-button--active" : ""}" type="button" data-bookmark="${key}" aria-label="${bookmarked ? "Hapus" : "Simpan"} penanda ayat ${verse.id}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16l-5-3-5 3V4Z" /></svg>
          </button>
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
        storage.set("quranSumutLastRead", { surah: surah.id, ayah });
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.45] },
    );

    $$(".verse-card", $("#verse-list")).forEach((card) => state.readerObserver.observe(card));
  }

  async function openSurah(id) {
    const summary = state.surahs.find((surah) => surah.id === id);
    if (!summary) return;

    navigate("reader");
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
      storage.set("quranSumutLastRead", { surah: surah.id, ayah: 1 });
      observeReaderProgress(surah);
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
    storage.set("quranSumutArabicSize", state.arabicSize);
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
    storage.set("quranSumutTasbih", state.tasbih);
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

        state.qiblaBearing = calculateQiblaBearing(latitude, longitude);
        $("#qibla-bearing").textContent = String(Math.round(state.qiblaBearing));
        $("#approved-coordinates").textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)} • akurasi ±${Math.round(accuracy)} m`;
        $("#qibla-gate").hidden = true;
        $("#qibla-compass-panel").hidden = false;
        showToast("Lokasi Sumatera Utara berhasil diverifikasi.");
      },
      (error) => {
        setButtonLoading(button, false);
        message.textContent = locationErrorMessage(error);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  function handleOrientation(event) {
    if (state.qiblaBearing === null) return;
    let heading;
    if (typeof event.webkitCompassHeading === "number") {
      heading = event.webkitCompassHeading;
    } else if (typeof event.alpha === "number") {
      const screenAngle = screen.orientation?.angle ?? window.orientation ?? 0;
      heading = (360 - event.alpha + screenAngle + 360) % 360;
    } else {
      return;
    }

    state.headingReceived = true;
    const relativeQibla = (state.qiblaBearing - heading + 360) % 360;
    $("#compass-dial").style.transform = `rotate(${-heading}deg)`;
    $("#qibla-needle").style.transform = `rotate(${relativeQibla}deg)`;
    $("#compass-status").textContent = `Arah ponsel ${Math.round(heading)}° • putar hingga penunjuk emas menghadap atas.`;
    $("#enable-compass").hidden = true;
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

      state.headingReceived = false;
      window.addEventListener("deviceorientationabsolute", handleOrientation, true);
      window.addEventListener("deviceorientation", handleOrientation, true);
      $("#compass-status").textContent = "Menunggu data sensor kompas…";
      setTimeout(() => {
        if (!state.headingReceived) {
          $("#compass-status").textContent = "Sensor belum mengirim arah. Kalibrasi ponsel dengan gerakan angka delapan.";
        }
      }, 2200);
    } catch {
      $("#compass-status").textContent = "Izin sensor kompas ditolak. Aktifkan izin gerakan/orientasi di pengaturan browser.";
    }
  }

  function openInstallHelp() {
    $("#install-help").hidden = false;
  }

  async function handleInstall() {
    if (state.deferredInstallPrompt) {
      state.deferredInstallPrompt.prompt();
      const result = await state.deferredInstallPrompt.userChoice;
      if (result.outcome === "accepted") showToast("Quran Sumut sedang dipasang.");
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
      showToast("Quran Sumut berhasil dipasang.");
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
      storage.set("quranSumutBookmarks", state.bookmarks);
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
    $("#install-button").addEventListener("click", handleInstall);
    $$('[data-close-modal]').forEach((button) => button.addEventListener("click", () => { $("#install-help").hidden = true; }));

    $("#start-app").addEventListener("click", () => {
      storage.set("quranSumutOnboarded", true);
      $("#onboarding").hidden = true;
    });

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
    $("#onboarding").hidden = storage.get("quranSumutOnboarded", false);
    document.documentElement.style.setProperty("--arabic-size", `${state.arabicSize}px`);
    bindEvents();
    updateTasbih();
    setupInstallPrompt();
    registerServiceWorker();
    loadQuranIndex();
  }

  initialize();
})();
