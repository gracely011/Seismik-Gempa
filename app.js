/**
 * SEISMOGRAPH - GOOGLE MAPS EDITION
 * Main Application Logic (Sensor, Maps, Real-time APIs, UI)
 */

// ==================== GLOBAL STATE ====================
let sData = [];
let historyLog = [];
let isStarted = false;
let isMuted = false;
let isAlarmOn = false;
let audioCtx = null;
let baseZ = 9.8;
const filterAlpha = 0.05;
let hasHardwareMotion = false;
let simInterval = null;

// User Location & LocalStorage Persistence
const savedLat = localStorage.getItem('seismo_user_lat');
const savedLon = localStorage.getItem('seismo_user_lon');
const savedAcc = localStorage.getItem('seismo_user_acc');
let userPlaceName = localStorage.getItem('seismo_user_place') || '';
let userPlaceObj = null;
try {
    const savedObj = localStorage.getItem('seismo_user_place_obj');
    if (savedObj) userPlaceObj = JSON.parse(savedObj);
} catch (e) { }

let userCoords = (savedLat && savedLon) ? [parseFloat(savedLat), parseFloat(savedLon)] : [-2.5, 118];
let hasUserGPS = !!(savedLat && savedLon);
let quakesArray = [];
let currentFilter = 'all';
let searchQuery = '';

// LocalStorage Persistent Settings
let currentTheme = localStorage.getItem('seismo_theme') || 'light';
let currentMapLayer = localStorage.getItem('seismo_layer') || (currentTheme === 'light' ? 'light' : 'dark');

// SVG Icons for Light / Dark Mode
const SVG_MOON = '<svg class="gmap-icon" id="themeIcon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>';
const SVG_SUN = '<svg class="gmap-icon" id="themeIcon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>';

function updateThemeIcon(isLight) {
    const indicator = document.getElementById('themeIconIndicator');
    if (indicator) {
        indicator.innerHTML = isLight ? SVG_SUN : SVG_MOON;
    }
}

// ==================== THEME INITIALIZATION ====================
function initTheme() {
    if (currentTheme === 'light') {
        document.body.classList.add('theme-light');
        updateThemeIcon(true);
        if (!localStorage.getItem('seismo_layer') || currentMapLayer === 'dark') {
            currentMapLayer = 'light';
        }
    } else {
        updateThemeIcon(false);
    }
}

function toggleThemeMode() {
    if (document.body.classList.contains('theme-light')) {
        document.body.classList.remove('theme-light');
        localStorage.setItem('seismo_theme', 'dark');
        currentTheme = 'dark';
        updateThemeIcon(false);
        applyMapLayer('dark');
    } else {
        document.body.classList.add('theme-light');
        localStorage.setItem('seismo_theme', 'light');
        currentTheme = 'light';
        updateThemeIcon(true);
        applyMapLayer('light');
    }
    if (sData.length > 0) draw(isReplaying ? getReplaySlice() : sData);
}

// ==================== CANVAS SETUP ====================
const canvas = document.getElementById("c");
const ctx = canvas ? canvas.getContext("2d") : null;

function resizeCanvas() {
    if (!canvas) return;
    canvas.width = canvas.offsetWidth || 340;
    canvas.height = 110;
    if (sData.length > 0) draw(isReplaying ? getReplaySlice() : sData);
}
window.addEventListener("resize", resizeCanvas);

// ==================== MAP & TILES ====================
const map = L.map("map", {
    zoomControl: false,
    zoomAnimation: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
    zoomSnap: 1,
    zoomDelta: 1,
    wheelPxPerZoomLevel: 120,
    inertia: true,
    inertiaDeceleration: 3000
}).setView(userCoords, hasUserGPS ? 7 : 5);

// Konfigurasi Buffer dan Transisi Ubin Peta Ringan & Cepat
const tileCommonOptions = {
    keepBuffer: 4,
    updateWhenIdle: true,
    updateWhenZooming: true
};

const darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    ...tileCommonOptions,
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; CartoDB &copy; OpenStreetMap'
});

const satTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    ...tileCommonOptions,
    maxZoom: 18,
    attribution: '&copy; Esri &copy; Earthstar Geographics'
});

const lightTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    ...tileCommonOptions,
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; CartoDB &copy; OpenStreetMap'
});

const terrainTileLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    ...tileCommonOptions,
    maxZoom: 17,
    attribution: '&copy; OpenTopoMap &copy; OpenStreetMap'
});

function applyMapLayer(layerName) {
    if (map.hasLayer(darkTileLayer)) map.removeLayer(darkTileLayer);
    if (map.hasLayer(satTileLayer)) map.removeLayer(satTileLayer);
    if (map.hasLayer(lightTileLayer)) map.removeLayer(lightTileLayer);
    if (map.hasLayer(terrainTileLayer)) map.removeLayer(terrainTileLayer);

    const card = document.getElementById("layerCard");
    const badge = document.getElementById("layerBadgeText");

    // Update active highlight on popup options
    document.querySelectorAll('.layer-option-item').forEach(el => el.classList.remove('active'));

    if (layerName === 'sat') {
        satTileLayer.addTo(map);
        if (card) card.style.backgroundImage = "url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/8/13')";
        if (badge) badge.innerText = "Satelit";
        const opt = document.getElementById("layerOptSat");
        if (opt) opt.classList.add('active');
    } else if (layerName === 'dark') {
        darkTileLayer.addTo(map);
        if (card) card.style.backgroundImage = "url('https://a.basemaps.cartocdn.com/dark_all/4/8/6.png')";
        if (badge) badge.innerText = "Gelap";
        const opt = document.getElementById("layerOptDark");
        if (opt) opt.classList.add('active');
    } else if (layerName === 'terrain') {
        terrainTileLayer.addTo(map);
        if (card) card.style.backgroundImage = "url('https://a.tile.opentopomap.org/4/8/6.png')";
        if (badge) badge.innerText = "Medan";
        const opt = document.getElementById("layerOptTerrain");
        if (opt) opt.classList.add('active');
    } else {
        lightTileLayer.addTo(map);
        if (card) card.style.backgroundImage = "url('https://a.basemaps.cartocdn.com/rastertiles/voyager/4/8/6.png')";
        if (badge) badge.innerText = "Standar";
        const opt = document.getElementById("layerOptLight");
        if (opt) opt.classList.add('active');
    }

    currentMapLayer = layerName;
    localStorage.setItem('seismo_layer', layerName);
    setTimeout(() => { map.invalidateSize(); }, 50);
}

function selectMapLayer(layerName) {
    applyMapLayer(layerName);
    const popup = document.getElementById("layerPopupMenu");
    if (popup) popup.classList.remove('show');
}

function toggleMapLayer(e) {
    if (e) {
        if (e.stopPropagation) e.stopPropagation();
    }
    const popup = document.getElementById("layerPopupMenu");
    if (popup) {
        popup.classList.toggle('show');
    }
}

// Tutup popup menu layer jika klik/sentuh di luar area
['click', 'touchend'].forEach(evtType => {
    document.addEventListener(evtType, (e) => {
        const wrap = document.getElementById("layerSwitcherWrap");
        const popup = document.getElementById("layerPopupMenu");
        if (popup && popup.classList.contains('show') && wrap && !wrap.contains(e.target)) {
            popup.classList.remove('show');
        }
    });
});

// ==================== GPS PULSE MARKER ====================
let gpsMarker = null;
let gpsCircle = null;

const gpsPulseIcon = L.divIcon({
    className: 'custom-gps-icon',
    html: '<div class="gps-pulse-marker"><div class="gps-pulse-wave"></div><div class="gps-pulse-core"></div></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

function updateGPSMarker(lat, lon, accuracy = 50, pan = false) {
    userCoords = [lat, lon];
    hasUserGPS = true;

    let placeTitle = userPlaceName;
    if (userPlaceObj && userPlaceObj.main) {
        placeTitle = `${userPlaceObj.main} (${userPlaceObj.admin}, ${userPlaceObj.province})`;
    }
    const placeDisplay = placeTitle ? `<div style="font-size:13px; font-weight:700; color:#202124; margin:2px 0 4px 0;">📍 ${placeTitle}</div>` : '';

    if (!gpsMarker) {
        gpsMarker = L.marker([lat, lon], { icon: gpsPulseIcon, zIndexOffset: 1000 }).addTo(map);
        gpsMarker.bindPopup(`
            <div style="font-family:'Plus Jakarta Sans',sans-serif; font-size:12px; color:#202124;">
                <b style="color:#1a73e8;">Lokasi Anda (GPS)</b><br>
                ${placeDisplay}
                <div style="color:#5f6368; font-size:10px;">Koordinat: ${lat.toFixed(4)}, ${lon.toFixed(4)}</div>
                <div style="color:#5f6368; font-size:10px;">Akurasi: ±${Math.round(accuracy)}m</div>
            </div>
        `);
    } else {
        gpsMarker.setLatLng([lat, lon]);
        gpsMarker.getPopup() && gpsMarker.setPopupContent(`
            <div style="font-family:'Plus Jakarta Sans',sans-serif; font-size:12px; color:#202124;">
                <b style="color:#1a73e8;">Lokasi Anda (GPS)</b><br>
                ${placeDisplay}
                <div style="color:#5f6368; font-size:10px;">Koordinat: ${lat.toFixed(4)}, ${lon.toFixed(4)}</div>
                <div style="color:#5f6368; font-size:10px;">Akurasi: ±${Math.round(accuracy)}m</div>
            </div>
        `);
    }

    if (!gpsCircle) {
        gpsCircle = L.circle([lat, lon], {
            radius: accuracy || 100,
            color: '#1a73e8',
            fillColor: '#1a73e8',
            fillOpacity: 0.1,
            weight: 1
        }).addTo(map);
    } else {
        gpsCircle.setLatLng([lat, lon]);
        gpsCircle.setRadius(accuracy || 100);
    }

    if (pan) {
        map.flyTo([lat, lon], 9, { duration: 1.2 });
    }

    updateRecentQuakesUI();
    checkProximityRisk();
}

function centerToUserLocation() {
    if (hasUserGPS) {
        map.flyTo(userCoords, 10, { duration: 1.2 });
        if (gpsMarker) gpsMarker.openPopup();
    } else {
        requestFreshGPS(true);
    }
}

function focusUserGPS() {
    centerToUserLocation();
    if (isPanelCollapsed) toggleSidebar();
}

// ==================== HAVERSINE DISTANCE CALCULATOR ====================
function calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

// ==================== SIDEBAR & MOBILE DRAWER TOGGLE ====================
let isPanelCollapsed = false;
let isMobileDrawerOpen = false;


function toggleSidebar() {
    if (window.innerWidth <= 768) {
        toggleMobileDrawer();
        return;
    }
    const panel = document.getElementById("panelContainer");
    const menuBtn = document.getElementById("railMenuBtn");

    isPanelCollapsed = !isPanelCollapsed;
    if (panel) panel.classList.toggle("collapsed", isPanelCollapsed);
    if (menuBtn) menuBtn.classList.toggle("active", !isPanelCollapsed);
    document.body.classList.toggle("panel-collapsed", isPanelCollapsed);

    setTimeout(() => {
        map.invalidateSize();
        resizeCanvas();
    }, 360);
}

function toggleMobileDrawer(forceOpen) {
    const drawer = document.getElementById("cardsScrollWrap");
    const menuBtn = document.getElementById("railMenuBtn");
    if (!drawer) return;

    if (forceOpen !== undefined) {
        isMobileDrawerOpen = forceOpen;
    } else {
        isMobileDrawerOpen = !isMobileDrawerOpen;
    }

    drawer.classList.toggle("collapsed", !isMobileDrawerOpen);
    if (menuBtn) menuBtn.classList.toggle("active", isMobileDrawerOpen);
}

function openMobileDrawer() {
    toggleMobileDrawer(true);
}

// Tutup otomatis drawer mobile saat klik di luar area menu
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && isMobileDrawerOpen) {
        const drawer = document.getElementById("cardsScrollWrap");
        const menuBtn = document.getElementById("railMenuBtn");
        if (drawer && !drawer.contains(e.target) && menuBtn && !menuBtn.contains(e.target)) {
            toggleMobileDrawer(false);
        }
    }
});

// Tutup otomatis saat peta digeser atau diklik di mobile
map.on('movestart', () => {
    if (window.innerWidth <= 768 && isMobileDrawerOpen) {
        toggleMobileDrawer(false);
    }
});

// ==================== MULTI-SOURCE EARTHQUAKE LOADER (BMKG + USGS) ====================
// GPU Canvas Renderer untuk performa 60 FPS saat pan & zoom
const canvasMarkerRenderer = L.canvas({ padding: 0.5, tolerance: 5 });
const markerGroup = L.layerGroup().addTo(map);

async function loadMapData(silent = false) {
    const loadingEl = document.getElementById("loading");
    if (loadingEl && !silent) loadingEl.style.display = "block";

    const rawQuakes = [];

    // 1. BMKG Realtime AutoGempa (Gempa paling mutakhir BMKG)
    try {
        const resAuto = await fetch("https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json", { cache: "no-store" });
        if (resAuto.ok) {
            const dataAuto = await resAuto.json();
            if (dataAuto && dataAuto.Infogempa && dataAuto.Infogempa.gempa) {
                const g = dataAuto.Infogempa.gempa;
                let lat = 0, lon = 0;
                if (g.Coordinates) {
                    [lat, lon] = g.Coordinates.split(',').map(v => parseFloat(v.trim()));
                } else {
                    lat = parseFloat(g.Lintang) * (g.Lintang.includes("LS") ? -1 : 1);
                    lon = parseFloat(g.Bujur) * (g.Bujur.includes("BB") ? -1 : 1);
                }
                let mag = parseFloat(g.Magnitude) || 0;
                let timeStr = g.Tanggal + " " + g.Jam;
                rawQuakes.push({
                    lat, lon, mag,
                    time: timeStr,
                    iso: g.DateTime,
                    place: g.Wilayah,
                    depth: g.Kedalaman || "-",
                    potensi: g.Potensi || "Tidak berpotensi tsunami",
                    dirasakan: g.Dirasakan || "-",
                    src: "BMKG AutoGempa",
                    priority: 1
                });
            }
        }
    } catch (e) {
        console.warn("BMKG AutoGempa fetch error:", e);
    }

    // 2. BMKG 15 Gempa M 5.0+ Terbaru
    try {
        const resTerkini = await fetch("https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json", { cache: "no-store" });
        if (resTerkini.ok) {
            const dataTerkini = await resTerkini.json();
            if (dataTerkini && dataTerkini.Infogempa && dataTerkini.Infogempa.gempa) {
                dataTerkini.Infogempa.gempa.forEach(g => {
                    let lat = 0, lon = 0;
                    if (g.Coordinates) {
                        [lat, lon] = g.Coordinates.split(',').map(v => parseFloat(v.trim()));
                    } else {
                        lat = parseFloat(g.Lintang) * (g.Lintang.includes("LS") ? -1 : 1);
                        lon = parseFloat(g.Bujur) * (g.Bujur.includes("BB") ? -1 : 1);
                    }
                    let mag = parseFloat(g.Magnitude) || 0;
                    let timeStr = g.Tanggal + " " + g.Jam;
                    rawQuakes.push({
                        lat, lon, mag,
                        time: timeStr,
                        iso: g.DateTime,
                        place: g.Wilayah,
                        depth: g.Kedalaman || "-",
                        potensi: g.Potensi || "Tidak berpotensi tsunami",
                        dirasakan: g.Dirasakan || "-",
                        src: "BMKG M5.0+",
                        priority: 2
                    });
                });
            }
        }
    } catch (e) {
        console.warn("BMKG Gempaterkini fetch error:", e);
    }

    // 3. BMKG 15 Gempa Dirasakan (Termasuk M < 5.0 Lokal / Daratan)
    try {
        const resDirasakan = await fetch("https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json", { cache: "no-store" });
        if (resDirasakan.ok) {
            const dataDirasakan = await resDirasakan.json();
            if (dataDirasakan && dataDirasakan.Infogempa && dataDirasakan.Infogempa.gempa) {
                dataDirasakan.Infogempa.gempa.forEach(g => {
                    let lat = 0, lon = 0;
                    if (g.Coordinates) {
                        [lat, lon] = g.Coordinates.split(',').map(v => parseFloat(v.trim()));
                    } else {
                        lat = parseFloat(g.Lintang) * (g.Lintang.includes("LS") ? -1 : 1);
                        lon = parseFloat(g.Bujur) * (g.Bujur.includes("BB") ? -1 : 1);
                    }
                    let mag = parseFloat(g.Magnitude) || 0;
                    let timeStr = g.Tanggal + " " + g.Jam;
                    rawQuakes.push({
                        lat, lon, mag,
                        time: timeStr,
                        iso: g.DateTime,
                        place: g.Wilayah,
                        depth: g.Kedalaman || "-",
                        potensi: "Gempa Dirasakan",
                        dirasakan: g.Dirasakan || "-",
                        src: "BMKG Dirasakan",
                        priority: 3
                    });
                });
            }
        }
    } catch (e) {
        console.warn("BMKG Gempadirasakan fetch error:", e);
    }

    // 4. Failover Mirror (sesmograp.my.id/?data=1)
    try {
        const resMirror = await fetch("https://sesmograp.my.id/?data=1", { cache: "no-store" });
        if (resMirror.ok) {
            const dataMirror = await resMirror.json();
            if (dataMirror.bmkg && dataMirror.bmkg.Infogempa && dataMirror.bmkg.Infogempa.gempa) {
                dataMirror.bmkg.Infogempa.gempa.forEach(g => {
                    let lat = 0, lon = 0;
                    if (g.Coordinates) {
                        [lat, lon] = g.Coordinates.split(',').map(v => parseFloat(v.trim()));
                    } else {
                        lat = parseFloat(g.Lintang) * (g.Lintang.includes("LS") ? -1 : 1);
                        lon = parseFloat(g.Bujur) * (g.Bujur.includes("BB") ? -1 : 1);
                    }
                    let mag = parseFloat(g.Magnitude) || 0;
                    let timeStr = g.Tanggal + " " + g.Jam;
                    rawQuakes.push({
                        lat, lon, mag,
                        time: timeStr,
                        iso: g.DateTime,
                        place: g.Wilayah,
                        depth: g.Kedalaman || "-",
                        potensi: g.Potensi || "Tidak berpotensi tsunami",
                        src: "BMKG Mirror",
                        priority: 4
                    });
                });
            }
        }
    } catch (e) { }

    // 5. USGS Real-time API (Rentang 30 Hari Terakhir Wilayah Indonesia)
    try {
        const now = new Date();
        const pastDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        const startTimeStr = pastDate.toISOString().split('T')[0];
        const usgsUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${startTimeStr}&minmagnitude=1.0&minlatitude=-11&maxlatitude=6&minlongitude=95&maxlongitude=141`;

        const resUSGS = await fetch(usgsUrl);
        if (resUSGS.ok) {
            const dataUSGS = await resUSGS.json();
            if (dataUSGS.features && dataUSGS.features.length > 0) {
                dataUSGS.features.forEach(f => {
                    let [lon, lat, depth] = f.geometry.coordinates;
                    let timeStr = new Date(f.properties.time).toLocaleString('id-ID');
                    let mag = parseFloat(f.properties.mag) || 0;
                    let place = f.properties.place || "Wilayah Indonesia";
                    rawQuakes.push({
                        lat, lon, mag,
                        time: timeStr,
                        iso: new Date(f.properties.time).toISOString(),
                        place: place,
                        depth: `${Math.round(depth || 10)} km`,
                        src: "USGS",
                        priority: 5
                    });
                });
            }
        }
    } catch (err) {
        console.warn("USGS fetch warning:", err);
    }

    // Deduplikasi Pintar (Gabungkan entri yang berdekatan koordinat & waktu)
    const uniqueQuakes = [];
    rawQuakes.forEach(item => {
        if (!item.lat || !item.lon || isNaN(item.lat) || isNaN(item.lon)) return;

        const isDuplicate = uniqueQuakes.some(existing => {
            const dist = calcDistance(existing.lat, existing.lon, item.lat, item.lon);
            const timeSame = existing.time === item.time || (existing.iso && item.iso && existing.iso.slice(0, 13) === item.iso.slice(0, 13));
            return dist < 35 && (timeSame || Math.abs(existing.mag - item.mag) < 0.3);
        });

        if (!isDuplicate) {
            uniqueQuakes.push(item);
        }
    });

    // Urutkan gempa berdasarkan waktu ISO (terbaru di atas)
    uniqueQuakes.sort((a, b) => {
        let tA = a.iso ? Date.parse(a.iso) : 0;
        let tB = b.iso ? Date.parse(b.iso) : 0;
        return tB - tA;
    });

    // Masukkan ke quakesArray dan pasang marker di Leaflet
    quakesArray = uniqueQuakes;
    quakesArray.forEach((q, idx) => {
        addEarthquakeMarker(q, idx === 0);
    });

    updateRecentQuakesUI();
    checkProximityRisk();
    if (loadingEl) loadingEl.style.display = "none";
}

function addEarthquakeMarker(q, isLatest = false) {
    let { lat, lon, mag, time, place, src, depth, potensi, dirasakan } = q;
    let size = Math.max(3.5, mag * 2.2);
    let color = mag >= 5 ? '#ea4335' : (mag >= 3 ? '#fbbc04' : '#80868b');
    let dist = hasUserGPS ? calcDistance(userCoords[0], userCoords[1], lat, lon) : null;

    let marker;
    if (isLatest) {
        // Animasi Radar Gelombang Seismik untuk 1 Lokasi Gempa Paling Mutakhir
        const quakePulseIcon = L.divIcon({
            className: 'custom-quake-pulse-icon',
            html: `
                <div class="quake-pulse-marker" title="Gempa Paling Mutakhir">
                    <div class="quake-pulse-wave-1" style="background:${color}55; border-color:${color};"></div>
                    <div class="quake-pulse-wave-2" style="background:${color}25; border-color:${color}aa;"></div>
                    <div class="quake-pulse-core" style="background:${color}; box-shadow:0 0 12px ${color};"></div>
                </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        marker = L.marker([lat, lon], {
            icon: quakePulseIcon,
            zIndexOffset: 800
        }).addTo(markerGroup);
    } else {
        marker = L.circleMarker([lat, lon], {
            renderer: canvasMarkerRenderer,
            radius: size,
            color: color,
            weight: 1.5,
            fillColor: color,
            fillOpacity: 0.65
        }).addTo(markerGroup);
    }

    let popupContent = `
        <div style="font-family:'Plus Jakarta Sans',sans-serif; color:#202124; font-size:12px; min-width:180px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-weight:800; color:${color}; font-size:13px;">${src} ${isLatest ? '⚡ [MUTAKHIR]' : ''}</span>
                <span style="background:${color}; color:#fff; font-weight:800; padding:1px 6px; border-radius:4px; font-size:11px;">M ${mag.toFixed(1)}</span>
            </div>
            <div style="color:#5f6368; font-size:10px; margin-bottom:6px;">🕒 ${time}</div>
            <div style="line-height:1.3; margin-bottom:4px;">📍 <b>${place}</b></div>
            <div style="font-size:10px; color:#5f6368;">Kedalaman: <b>${depth || '-'}</b></div>
            ${dirasakan && dirasakan !== '-' ? `<div style="font-size:10px; color:#e37400; margin-top:2px;">⚠️ Dirasakan: <b>${dirasakan}</b></div>` : ''}
            ${potensi ? `<div style="font-size:10px; color:#137333; margin-top:2px;">🛡️ ${potensi}</div>` : ''}
            ${dist !== null ? `<div style="font-size:10px; color:#1a73e8; margin-top:5px; font-weight:700;">📏 Jarak: ${dist} km dari lokasi Anda</div>` : ''}
            <div style="font-size:9px; color:#80868b; margin-top:3px;">Koordinat: ${lat.toFixed(2)}, ${lon.toFixed(2)}</div>
        </div>
    `;

    marker.bindPopup(popupContent);
}

// ==================== SEARCH & FILTERING ====================
function handleSearch(val) {
    searchQuery = val.trim().toLowerCase();
    const clearBtn = document.getElementById("searchClearBtn");
    if (clearBtn) clearBtn.style.display = searchQuery ? "flex" : "none";
    updateRecentQuakesUI();
}

function clearSearch() {
    const input = document.getElementById("searchInput");
    if (input) input.value = "";
    handleSearch("");
}

// ==================== CHIPS SLIDER CONTROLS ====================
function initChipsSliderInteractions() {
    const row = document.getElementById("filterChipsRow");
    if (!row) return;

    // 1. Mouse Wheel Scroll Horizontal
    row.addEventListener("wheel", (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            row.scrollLeft += e.deltaY;
        }
    }, { passive: false });

    // 2. Mouse Drag-to-Scroll
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    row.addEventListener("mousedown", (e) => {
        isDown = true;
        startX = e.pageX - row.offsetLeft;
        scrollLeft = row.scrollLeft;
    });

    window.addEventListener("mouseup", () => {
        isDown = false;
    });

    row.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - row.offsetLeft;
        const walk = (x - startX) * 1.4;
        row.scrollLeft = scrollLeft - walk;
    });
}

function filterQuakes(type, chipEl) {
    currentFilter = type;
    if (chipEl) {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chipEl.classList.add('active');
        if (typeof chipEl.scrollIntoView === 'function') {
            chipEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }
    updateRecentQuakesUI();
    if (window.innerWidth > 768 && isPanelCollapsed) {
        toggleSidebar();
    } else if (window.innerWidth <= 768) {
        openMobileDrawer();
    }
}

function updateRecentQuakesUI() {
    const listEl = document.getElementById("recentQuakesList");
    const badgeEl = document.getElementById("quakeCountBadge");
    if (!listEl) return;

    let filtered = quakesArray.filter(q => {
        if (searchQuery && !q.place.toLowerCase().includes(searchQuery)) return false;
        if (currentFilter === 'm3' && q.mag < 3.0) return false;
        if (currentFilter === 'm5' && q.mag < 5.0) return false;
        if (currentFilter === 'near') {
            let dist = calcDistance(userCoords[0], userCoords[1], q.lat, q.lon);
            if (dist > 500) return false;
        }
        return true;
    });

    if (badgeEl) badgeEl.innerText = `${filtered.length} terdeteksi`;

    if (filtered.length === 0) {
        if (!isStarted && quakesArray.length === 0) {
            listEl.innerHTML = `
                <div style="font-size:11.5px; color:var(--text-secondary); text-align:center; padding:24px 16px; line-height:1.6;">
                    <div style="font-size:26px; margin-bottom:8px;">📡</div>
                    <b style="color:var(--text-primary); font-size:12.5px;">Sistem Siaga Gempa</b><br>
                    Tekan tombol <span style="color:var(--accent-blue); font-weight:700;">START SENSOR</span> untuk mengaktifkan pemantauan dan memuat data gempa real-time BMKG & USGS.
                </div>
            `;
        } else {
            listEl.innerHTML = '<div style="font-size:11px; color:var(--text-muted); text-align:center; padding:16px;">Tidak ada data gempa sesuai filter</div>';
        }
        return;
    }

    listEl.innerHTML = filtered.slice(0, 20).map(q => {
        let magClass = q.mag >= 5 ? 'mag-red' : (q.mag >= 3 ? 'mag-orange' : 'mag-gray');
        let dist = hasUserGPS ? calcDistance(userCoords[0], userCoords[1], q.lat, q.lon) : null;
        return `
            <div class="quake-card-item" onclick="focusQuake(${q.lat}, ${q.lon})">
                <div class="quake-mag-badge ${magClass}">M ${q.mag.toFixed(1)}</div>
                <div class="quake-item-details">
                    <div class="quake-item-place">${q.place}</div>
                    <div class="quake-item-sub">
                        <span>${q.time}</span>
                        ${dist !== null ? `<span class="quake-dist">• 📏 ${dist} km</span>` : ''}
                    </div>
                </div>
                <div style="font-size:14px; color:var(--text-muted); font-weight:bold;">›</div>
            </div>
        `;
    }).join('');
}

function focusQuake(lat, lon) {
    map.flyTo([lat, lon], 9, { duration: 1.2 });
    markerGroup.eachLayer(layer => {
        let pos = layer.getLatLng();
        if (Math.abs(pos.lat - lat) < 0.02 && Math.abs(pos.lng - lon) < 0.02) {
            layer.openPopup();
        }
    });
    if (window.innerWidth <= 768) {
        toggleMobileDrawer(false);
    }
}

function checkProximityRisk() {
    const dot = document.getElementById("statusDot");
    const text = document.getElementById("riskStatusText");
    if (!text) return;

    if (!hasUserGPS) {
        if (dot) dot.className = "status-dot";
        text.innerText = "Kondisi sekitar terpantau stabil & normal";
        return;
    }

    let closeQuake = quakesArray.find(q => {
        let dist = calcDistance(userCoords[0], userCoords[1], q.lat, q.lon);
        return q.mag >= 5.0 && dist < 350;
    });

    if (closeQuake) {
        if (dot) dot.className = "status-dot warning";
        let dist = calcDistance(userCoords[0], userCoords[1], closeQuake.lat, closeQuake.lon);
        text.innerHTML = `<b style="color:var(--accent-red)">Waspada:</b> Gempa M${closeQuake.mag} ${dist}km dari Anda!`;
    } else {
        if (dot) dot.className = "status-dot";
        text.innerText = "Kondisi sekitar terpantau stabil & normal";
    }
}

// ==================== AUDIO ENGINE (BEEP) ====================
function playBeep(intensity) {
    if (!isStarted || isMuted) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();

        let osc = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220 + (intensity * 45), audioCtx.currentTime);

        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } catch (e) { }
}

// ==================== SENSOR ENGINE ====================
function initSystem() {
    if (isStarted) return;
    isStarted = true;
    const btn = document.getElementById("btnStart");
    if (btn) {
        btn.innerText = "SENSOR AKTIF";
        btn.classList.add("active");
    }

    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { }

    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(r => {
                if (r === 'granted') {
                    window.addEventListener("devicemotion", handleMotion);
                }
            })
            .catch(console.error);
    } else if (typeof window.DeviceMotionEvent !== 'undefined') {
        window.addEventListener("devicemotion", handleMotion);
    }

    setTimeout(() => {
        if (!hasHardwareMotion && !simInterval) {
            startAmbientSimulation();
        }
    }, 1200);

    // Refresh data tanpa force prompt
    // Refresh data pertama kali saat sensor dimulai
    loadMapData(false);

    // Auto-Sync Berkala Halus di Latar Belakang (Setiap 60 Detik tanpa kedip / tanpa popup)
    if (!window.seismoAutoSyncTimer) {
        window.seismoAutoSyncTimer = setInterval(() => {
            if (document.visibilityState === 'visible' && isStarted) {
                loadMapData(true);
            }
        }, 60000);
    }
}

function processSensorValue(val) {
    let now = new Date();
    let entry = { val: val, ts: now.toLocaleTimeString() };

    historyLog.push(entry);
    if (historyLog.length > 5000) historyLog.shift();

    if (Math.abs(val) > 8) playBeep(Math.abs(val));

    const sensorBox = document.getElementById("sensorBox");
    if (isAlarmOn && Math.abs(val) > 20) {
        if (sensorBox) sensorBox.classList.add("alarm-flash");
        if (navigator.vibrate) navigator.vibrate(200);
    } else {
        if (sensorBox) sensorBox.classList.remove("alarm-flash");
    }

    if (!isReplaying) {
        sData.push(entry);
        if (sData.length > 200) sData.shift();
        draw(sData);
        const tsLabel = document.getElementById("ts_label");
        if (tsLabel) tsLabel.innerText = entry.ts;
        updateTimelineUI();
    }
}

function handleMotion(e) {
    hasHardwareMotion = true;
    if (simInterval) {
        clearInterval(simInterval);
        simInterval = null;
    }

    let z = (e.accelerationIncludingGravity && e.accelerationIncludingGravity.z) ? e.accelerationIncludingGravity.z : 0;
    baseZ = (filterAlpha * z) + ((1 - filterAlpha) * baseZ);
    let val = (z - baseZ) * 40;
    processSensorValue(val);
}

function startAmbientSimulation() {
    let t = 0;
    simInterval = setInterval(() => {
        if (hasHardwareMotion) {
            clearInterval(simInterval);
            return;
        }
        t += 0.15;
        let microTremor = (Math.sin(t * 1.7) * 1.5) + (Math.sin(t * 3.2) * 0.8) + ((Math.random() - 0.5) * 1.2);
        processSensorValue(microTremor);
    }, 50);
}

// ==================== WAVEFORM CANVAS DRAWING ====================
function draw(data) {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const centerY = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Baseline Center
    ctx.strokeStyle = currentTheme === 'light' ? "#333333" : "#222222";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.stroke();

    if (!data || data.length === 0) return;

    ctx.strokeStyle = isReplaying ? "#00ffff" : "#1a73e8";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const step = w / 200;
    data.forEach((d, i) => {
        let x = i * step;
        let y = centerY - (d.val || 0);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

// ==================== REPLAY TIMELINE ====================
let isReplaying = false;
let replayIndex = 0;
const timeline = document.getElementById("timeline");

function getReplaySlice() {
    return historyLog.slice(replayIndex, replayIndex + 200);
}

if (timeline) {
    timeline.addEventListener("input", (e) => {
        isReplaying = true;
        replayIndex = parseInt(e.target.value);
        let slice = getReplaySlice();
        if (slice.length > 0) {
            const modeEl = document.getElementById("mode_label");
            const tsLabel = document.getElementById("ts_label");
            if (modeEl) modeEl.innerText = "REPLAY MODE";
            if (tsLabel) tsLabel.innerText = slice[slice.length - 1].ts;
            draw(slice);
        }
    });

    timeline.addEventListener("change", () => {
        setTimeout(() => {
            isReplaying = false;
            const modeEl = document.getElementById("mode_label");
            if (modeEl) modeEl.innerText = "LIVE MONITOR";
        }, 3000);
    });
}

function updateTimelineUI() {
    if (!timeline) return;
    timeline.disabled = false;
    let maxVal = historyLog.length - 200 > 0 ? historyLog.length - 200 : 0;
    timeline.max = maxVal;
    if (!isReplaying) timeline.value = maxVal;
}

function toggleMute() {
    isMuted = !isMuted;
    const btn = document.getElementById("btnMute");
    if (btn) btn.innerText = isMuted ? "MUTE: ON" : "MUTE: OFF";
}

function toggleAlarm() {
    isAlarmOn = !isAlarmOn;
    const btn = document.getElementById("btnAlarm");
    if (btn) {
        btn.innerText = isAlarmOn ? "ALARM: ON" : "ALARM: OFF";
        btn.classList.toggle("active");
    }
}

// ==================== WEATHER & REVERSE GEOCODING (GOOGLE MAPS STYLE) ====================
function formatIndonesianPlace(rawCity, rawLocality, rawSubdivision, lat, lon) {
    let main = "";
    let admin = "";
    let province = "";

    // Deteksi cerdas koordinat & nama area Batam / Kepulauan Riau
    const isBatamArea = (lat >= 0.7 && lat <= 1.35 && lon >= 103.7 && lon <= 104.45) ||
        (rawCity && rawCity.toLowerCase().includes("batam")) ||
        (rawLocality && rawLocality.toLowerCase().includes("batam"));

    if (isBatamArea) {
        return {
            main: "Batam",
            admin: "Kota Batam",
            province: "Kepulauan Riau"
        };
    }

    // Parsing nama kota/kabupaten
    let candidate = rawCity || rawLocality || "";
    if (candidate) {
        if (candidate.startsWith("Kota ")) {
            main = candidate.replace(/^Kota\s+/, "").trim();
            admin = candidate;
        } else if (candidate.startsWith("Kabupaten ")) {
            main = candidate.replace(/^Kabupaten\s+/, "").trim();
            admin = candidate;
        } else if (candidate.endsWith(" City")) {
            main = candidate.replace(/\s+City$/, "").trim();
            admin = "Kota " + main;
        } else if (candidate.endsWith(" Regency")) {
            main = candidate.replace(/\s+Regency$/, "").trim();
            admin = "Kabupaten " + main;
        } else {
            main = candidate;
            admin = "Kota " + candidate;
        }
    }

    // Parsing dan normalisasi nama provinsi resmi Indonesia
    let candidateProv = rawSubdivision || "";
    if (candidateProv) {
        let provLower = candidateProv.toLowerCase();
        if (provLower.includes("riau islands") || provLower === "riau kepulauan") {
            province = "Kepulauan Riau";
        } else if (provLower === "sumatra" || provLower === "sumatera") {
            if (lat > 1.5) province = "Sumatera Utara";
            else if (lat > -0.5) province = "Riau";
            else if (lat > -2.5) province = "Sumatera Barat";
            else province = "Sumatera Selatan";
        } else if (provLower.includes("north sumatra")) {
            province = "Sumatera Utara";
        } else if (provLower.includes("west sumatra")) {
            province = "Sumatera Barat";
        } else if (provLower.includes("south sumatra")) {
            province = "Sumatera Selatan";
        } else if (provLower.includes("jakarta")) {
            province = "DKI Jakarta";
        } else if (provLower.includes("west java")) {
            province = "Jawa Barat";
        } else if (provLower.includes("central java")) {
            province = "Jawa Tengah";
        } else if (provLower.includes("east java")) {
            province = "Jawa Timur";
        } else {
            province = candidateProv;
        }
    }

    if (!main) main = `Area (${lat.toFixed(2)})`;
    if (!admin) admin = `Wilayah ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    if (!province) province = "Indonesia";

    return { main, admin, province };
}

function renderLocationUI(obj, lat, lon) {
    const mainEl = document.getElementById("areaCityMain");
    const adminEl = document.getElementById("areaCityAdmin");
    const provEl = document.getElementById("areaProvince");
    const locEl = document.getElementById("user_loc");

    if (obj) {
        if (mainEl) mainEl.innerText = obj.main || "Batam";
        if (adminEl) adminEl.innerText = obj.admin || "Kota Batam";
        if (provEl) provEl.innerText = obj.province || "Kepulauan Riau";
    }

    if (locEl && lat !== undefined && lon !== undefined) {
        locEl.innerText = `GPS: ${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    }
}

async function fetchLocationName(lat, lon) {
    // 0. Cek Cache Lokal Terlebih Dahulu (Jika koordinat tidak berubah signifikan)
    const cachedObjStr = localStorage.getItem('seismo_user_place_obj');
    const cachedLat = parseFloat(localStorage.getItem('seismo_user_lat'));
    const cachedLon = parseFloat(localStorage.getItem('seismo_user_lon'));
    if (cachedObjStr && cachedLat && cachedLon) {
        const dist = Math.abs(lat - cachedLat) + Math.abs(lon - cachedLon);
        if (dist < 0.03) { // < ~3km
            try {
                const cachedObj = JSON.parse(cachedObjStr);
                userPlaceObj = cachedObj;
                userPlaceName = `${cachedObj.main}, ${cachedObj.admin}, ${cachedObj.province}`;
                renderLocationUI(cachedObj, lat, lon);
                if (gpsMarker) updateGPSMarker(lat, lon, parseFloat(savedAcc) || 50, false);
                return cachedObj;
            } catch (e) { }
        }
    }

    // 1. Provider Utama: BigDataCloud Client API (cepat & bahasa Indonesia)
    try {
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`);
        if (res.ok) {
            const data = await res.json();
            let city = data.city || data.locality || data.principalSubdivision || "";
            let locality = data.locality || "";
            let prov = data.principalSubdivision || "";

            const obj = formatIndonesianPlace(city, locality, prov, lat, lon);
            userPlaceObj = obj;
            userPlaceName = `${obj.main}, ${obj.admin}, ${obj.province}`;

            localStorage.setItem('seismo_user_place_obj', JSON.stringify(obj));
            localStorage.setItem('seismo_user_place', userPlaceName);

            renderLocationUI(obj, lat, lon);
            if (gpsMarker) updateGPSMarker(lat, lon, parseFloat(savedAcc) || 50, false);
            return obj;
        }
    } catch (e) {
        console.warn("BigDataCloud error, trying Nominatim fallback:", e);
    }

    // 2. Provider Cadangan: OpenStreetMap Nominatim
    try {
        const resNom = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=12&addressdetails=1`, {
            headers: { 'Accept-Language': 'id' }
        });
        if (resNom.ok) {
            const dataNom = await resNom.json();
            if (dataNom && dataNom.address) {
                const addr = dataNom.address;
                let city = addr.city || addr.town || addr.municipality || addr.county || addr.state_district || "";
                let locality = addr.suburb || addr.neighbourhood || addr.village || "";
                let prov = addr.state || addr.region || "";

                const obj = formatIndonesianPlace(city, locality, prov, lat, lon);
                userPlaceObj = obj;
                userPlaceName = `${obj.main}, ${obj.admin}, ${obj.province}`;

                localStorage.setItem('seismo_user_place_obj', JSON.stringify(obj));
                localStorage.setItem('seismo_user_place', userPlaceName);

                renderLocationUI(obj, lat, lon);
                if (gpsMarker) updateGPSMarker(lat, lon, parseFloat(savedAcc) || 50, false);
                return obj;
            }
        }
    } catch (e) {
        console.warn("Nominatim reverse geocode error:", e);
    }

    const fallbackObj = formatIndonesianPlace("", "", "", lat, lon);
    renderLocationUI(fallbackObj, lat, lon);
}

function updateLiveClock() {
    const timeEl = document.getElementById("weatherLocalTime");
    if (!timeEl) return;
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    timeEl.innerText = `${hrs}.${mins}`;
}
setInterval(updateLiveClock, 10000);

async function fetchWeather(lat, lon) {
    // Cek Cache Cuaca (TTL: 15 Menit)
    try {
        const cachedWeather = localStorage.getItem('seismo_weather_cache');
        if (cachedWeather) {
            const parsed = JSON.parse(cachedWeather);
            const isFresh = (Date.now() - parsed.timestamp) < (15 * 60 * 1000); // 15 menit
            const isNear = Math.abs(parsed.lat - lat) < 0.1 && Math.abs(parsed.lon - lon) < 0.1;
            if (isFresh && isNear && parsed.data) {
                applyWeatherToUI(parsed.data);
                return;
            }
        }
    } catch (e) { }

    try {
        let w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        if (w.ok) {
            let wj = await w.json();
            if (wj.current_weather) {
                applyWeatherToUI(wj.current_weather);
                localStorage.setItem('seismo_weather_cache', JSON.stringify({
                    lat, lon, timestamp: Date.now(), data: wj.current_weather
                }));
            }
        }
    } catch (e) {
        console.warn("Weather fetch warning:", e);
    }
}

function applyWeatherToUI(weatherData) {
    const condTempEl = document.getElementById("weatherConditionTemp");
    const iconContainer = document.getElementById("weatherGmapIcon");
    let temp = Math.round(weatherData.temperature);
    let code = weatherData.weathercode;
    let desc = "Cerah";
    let iconHtml = '<div class="gmap-sun-circle"></div>';

    if (code >= 1 && code <= 3) {
        desc = "Berawan";
        iconHtml = `
            <svg class="gmap-cloud-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8ab4f8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
            </svg>
        `;
    } else if (code >= 45 && code <= 48) {
        desc = "Kabut";
        iconHtml = `
            <svg class="gmap-cloud-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="2">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="5" y1="8" x2="19" y2="8"></line>
                <line x1="5" y1="16" x2="19" y2="16"></line>
            </svg>
        `;
    } else if (code >= 51 && code <= 67) {
        desc = "Hujan";
        iconHtml = `
            <svg class="gmap-rain-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8ab4f8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 13v8"></path>
                <path d="M8 13v8"></path>
                <path d="M12 15v8"></path>
                <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"></path>
            </svg>
        `;
    } else if (code >= 80) {
        desc = "Hujan Badai";
        iconHtml = `
            <svg class="gmap-rain-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea4335" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
        `;
    }

    if (condTempEl) condTempEl.innerHTML = `${desc} &middot; ${temp} &deg;C`;
    if (iconContainer) iconContainer.innerHTML = iconHtml;
    updateLiveClock();
}

/**
 * Inisialisasi Lokasi Ramah-Cache
 * Menggunakan data tersimpan agar tidak memicu pop-up izin berulang pada file://
 */
function initLocation() {
    updateLiveClock();

    if (savedLat && savedLon) {
        const lat = parseFloat(savedLat);
        const lon = parseFloat(savedLon);
        const acc = parseFloat(savedAcc) || 50;

        userCoords = [lat, lon];
        hasUserGPS = true;

        if (userPlaceObj) {
            renderLocationUI(userPlaceObj, lat, lon);
        } else {
            fetchLocationName(lat, lon);
        }

        updateGPSMarker(lat, lon, acc, false);
        fetchWeather(lat, lon);

        // Jika permission query sudah 'granted', update background tanpa pop-up
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'geolocation' }).then(status => {
                if (status.state === 'granted') {
                    requestFreshGPS(false);
                }
            }).catch(() => { });
        }
    } else {
        const defaultObj = { main: "Jakarta", admin: "DKI Jakarta", province: "Indonesia" };
        renderLocationUI(defaultObj, -6.2088, 106.8456);
        fetchWeather(-6.2088, 106.8456);
    }
}

/**
 * Permintaan GPS eksplisit (Dipanggil saat user mengklik tombol Kompas / GPS)
 */
function requestFreshGPS(panToLocation = true) {
    if (!("geolocation" in navigator)) {
        alert("Browser tidak mendukung geolokasi GPS.");
        return;
    }

    const locEl = document.getElementById("user_loc");
    const mainEl = document.getElementById("areaCityMain");
    if (locEl) locEl.innerText = "GPS: Menghubungkan satelit...";
    if (mainEl && !userPlaceObj) mainEl.innerText = "Mendeteksi...";

    navigator.geolocation.getCurrentPosition(
        pos => {
            const { latitude, longitude, accuracy } = pos.coords;

            // Simpan ke LocalStorage agar permanen
            localStorage.setItem('seismo_user_lat', latitude);
            localStorage.setItem('seismo_user_lon', longitude);
            localStorage.setItem('seismo_user_acc', accuracy);

            userCoords = [latitude, longitude];
            hasUserGPS = true;

            updateGPSMarker(latitude, longitude, accuracy, panToLocation);
            fetchWeather(latitude, longitude);
            fetchLocationName(latitude, longitude);
            updateRecentQuakesUI();
            checkProximityRisk();
        },
        err => {
            console.warn("GPS Error:", err);
            if (locEl) {
                locEl.innerText = hasUserGPS
                    ? `GPS: ${userCoords[0].toFixed(3)}, ${userCoords[1].toFixed(3)}`
                    : `GPS: Izin belum aktif`;
            }
            if (panToLocation && hasUserGPS) {
                map.flyTo(userCoords, 9, { duration: 1.2 });
            }
        },
        { timeout: 10000, enableHighAccuracy: true }
    );
}

function openAppInfo() {
    alert("Monitor Seismik | Gracely\nGoogle Maps Edition dengan Integrasi Real-Time BMKG & USGS Multi-Source.");
}

// ==================== HISTATS ANALYTICS TRACKER ====================
function initHistats() {
    try {
        window._Hasync = window._Hasync || [];
        window._Hasync.push(['Histats.start', '1,5045294,4,0,0,0,00010000']);
        window._Hasync.push(['Histats.fasi', '1']);
        window._Hasync.push(['Histats.track_hits', '']);

        const hs = document.createElement('script');
        hs.type = 'text/javascript';
        hs.async = true;
        hs.src = '//s10.histats.com/js15_as.js';
        (document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(hs);
    } catch (e) {
        console.warn('[Analytics] Histats init warning:', e);
    }
}

// ==================== GOOGLE ANALYTICS (GA4) ====================
function initGoogleAnalytics() {
    try {
        window.dataLayer = window.dataLayer || [];
        function gtag() { window.dataLayer.push(arguments); }
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', 'G-P8H6SWEKK2');

        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=G-P8H6SWEKK2';
        (document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(script);
    } catch (e) {
        console.warn('[Analytics] Google Analytics init warning:', e);
    }
}

// ==================== APP INITIALIZATION ====================

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    applyMapLayer(currentMapLayer);
    initLocation();
    updateLiveClock();
    updateRecentQuakesUI();
    initChipsSliderInteractions();
    initHistats();
    initGoogleAnalytics();
    if (window.innerWidth <= 768) {
        toggleMobileDrawer(false);
    } else {
        document.body.classList.remove("panel-collapsed");
    }
    setTimeout(() => {
        map.invalidateSize();
        resizeCanvas();
    }, 150);
});

// ==================== PWA INSTALL PROMPT CONTROLLER ====================
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] Seismik App ready for installation.');
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    console.log('[PWA] Seismik App successfully installed!');
});


