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

// User Location & LocalStorage Persistence (GPS Asli Pengguna)
const savedLat = localStorage.getItem('seismo_user_lat');
const savedLon = localStorage.getItem('seismo_user_lon');
const savedAcc = localStorage.getItem('seismo_user_acc');
let userPlaceName = localStorage.getItem('seismo_user_place') || 'Batam, Kota Batam, Kepulauan Riau';
let userPlaceObj = null;
try {
    const savedObj = localStorage.getItem('seismo_user_place_obj');
    if (savedObj) userPlaceObj = JSON.parse(savedObj);
} catch (e) { }

// Default GPS pengguna (Batam jika belum ada koordinat GPS terdeteksi)
let userCoords = (savedLat && savedLon) ? [parseFloat(savedLat), parseFloat(savedLon)] : [1.1030, 104.0383];
let hasUserGPS = !!(savedLat && savedLon);

// Wilayah yang sedang dipantau / dilihat di kartu status area (bisa berbeda dari GPS saat cari kota)
let viewedCoords = [...userCoords];
let viewedPlaceObj = userPlaceObj || { main: "Batam", admin: "Kota Batam", province: "Kepulauan Riau" };

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

// ==================== FAULT LINES & MEGATHRUST LAYER ====================
let faultLinesLayerGroup = L.layerGroup();
// Baca preferensi tersimpan dari LocalStorage (default NONAKTIF/false jika belum pernah diaktifkan secara manual)
let isFaultsLayerVisible = localStorage.getItem('seismo_faults_visible') === 'true';

function initFaultLinesLayer() {
    if (typeof FAULT_LINES_DATA === 'undefined') return;

    FAULT_LINES_DATA.forEach(f => {
        const color = f.isMegathrust ? '#ef4444' : '#f97316';
        const weight = f.isMegathrust ? 3.5 : 2.5;
        const dashArray = f.isMegathrust ? '6, 6' : null;

        const polyline = L.polyline(f.coords, {
            color: color,
            weight: weight,
            opacity: 0.85,
            dashArray: dashArray,
            lineCap: 'round',
            lineJoin: 'round'
        });

        const popupContent = `
            <div class="fault-popup-content">
                <div class="fault-popup-title">${f.isMegathrust ? '🌊 ' : '⚡ '}${f.name}</div>
                <div class="fault-popup-sub">📍 Wilayah: ${f.region} • ${f.type}</div>
                <div class="fault-popup-desc">${f.desc}</div>
            </div>
        `;
        polyline.bindPopup(popupContent);
        faultLinesLayerGroup.addLayer(polyline);
    });

    const btn = document.getElementById("layerOptFaults");
    if (isFaultsLayerVisible) {
        faultLinesLayerGroup.addTo(map);
        if (btn) btn.classList.add("active");
    } else {
        if (btn) btn.classList.remove("active");
    }
}

function toggleFaultsLayer() {
    isFaultsLayerVisible = !isFaultsLayerVisible;
    try {
        localStorage.setItem('seismo_faults_visible', isFaultsLayerVisible ? 'true' : 'false');
    } catch (e) { }

    const btn = document.getElementById("layerOptFaults");
    if (isFaultsLayerVisible) {
        map.addLayer(faultLinesLayerGroup);
        if (btn) btn.classList.add("active");
    } else {
        map.removeLayer(faultLinesLayerGroup);
        if (btn) btn.classList.remove("active");
    }
}

// Inisialisasi garis sesar aktif saat boot
initFaultLinesLayer();

// ==================== GPS PULSE MARKER ====================
let gpsMarker = null;
let gpsCircle = null;

const gpsPulseIcon = L.divIcon({
    className: 'custom-gps-icon',
    html: '<div class="gps-pulse-marker"><div class="gps-pulse-wave"></div><div class="gps-pulse-core"></div></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

// Marker Pin Merah Khusus Wilayah Pencarian / Pantauan (Bukan GPS Pengguna)
let searchPlaceMarker = null;

const searchPlaceIcon = L.divIcon({
    className: 'custom-search-pin-icon',
    html: `
        <div style="display:flex; flex-direction:column; align-items:center; transform:translateY(-100%);">
            <svg style="width:30px; height:30px; filter:drop-shadow(0 3px 6px rgba(0,0,0,0.45));" viewBox="0 0 24 24" fill="#ea4335">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
        </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30]
});

function createAreaPopupHTML(obj, lat, lon) {
    const main = obj?.main || "Wilayah";
    const admin = obj?.admin || `Wilayah ${lat.toFixed(2)}`;
    const prov = obj?.province || "Indonesia";

    const tempText = document.getElementById("weatherConditionTemp")?.innerText || "Cerah · 28 °C";
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hrs}.${mins}`;

    const places = getSavedPlaces();
    const isSaved = places.some(p => Math.abs(p.lat - lat) < 0.05 && Math.abs(p.lon - lon) < 0.05);

    const safeMain = escapeQuotes(main);
    const safeAdmin = escapeQuotes(admin);
    const safeProv = escapeQuotes(prov);

    return `
        <div class="popup-area-card">
            <div class="popup-area-header">
                <div class="popup-area-title-group">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                        <div class="popup-area-city-main">${main}</div>
                        <button class="popup-btn-bookmark ${isSaved ? 'active' : ''}" onclick="toggleSavePlaceFromPopup('${safeMain}', '${safeAdmin}', '${safeProv}', ${lat}, ${lon}, event)" title="${isSaved ? 'Hapus dari Disimpan' : 'Simpan Wilayah Ini'}">
                            <svg class="gmap-icon" style="width:14px; height:14px;" viewBox="0 0 24 24" fill="currentColor">
                                ${isSaved ? '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>' : '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>'}
                            </svg>
                        </button>
                    </div>
                    <div class="popup-area-sub-line">${admin}</div>
                    <div class="popup-area-sub-line">${prov}</div>
                    <div class="popup-area-gps-coord">GPS: ${lat.toFixed(3)}, ${lon.toFixed(3)}</div>
                </div>
                <div class="popup-area-right">
                    <div class="popup-weather-box">
                        <div class="popup-weather-cond-temp">${tempText}</div>
                        <div class="popup-weather-time mono">${timeStr}</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function toggleSavePlaceFromPopup(name, admin, prov, lat, lon, e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    let places = getSavedPlaces();
    const existingIndex = places.findIndex(p => Math.abs(p.lat - lat) < 0.05 && Math.abs(p.lon - lon) < 0.05);

    if (existingIndex >= 0) {
        places.splice(existingIndex, 1);
        savePlacesList(places);
    } else {
        const tempText = document.getElementById("weatherConditionTemp")?.innerText || "28°C";
        places.unshift({
            id: 'place_' + Date.now(),
            name: name,
            admin: admin,
            province: prov,
            lat: lat,
            lon: lon,
            temp: tempText
        });
        savePlacesList(places);
    }

    renderSavedPlacesUI();
    updateBookmarkIconState();

    if (searchPlaceMarker && searchPlaceMarker.getPopup() && searchPlaceMarker.isPopupOpen()) {
        const placeObj = { main: name, admin: admin, province: prov };
        searchPlaceMarker.setPopupContent(createAreaPopupHTML(placeObj, lat, lon));
    }
}

function showPlacePinMarker(lat, lon, name) {
    if (!searchPlaceMarker) {
        searchPlaceMarker = L.marker([lat, lon], { icon: searchPlaceIcon, zIndexOffset: 950 }).addTo(map);
    } else {
        searchPlaceMarker.setLatLng([lat, lon]);
    }

    let placeObj = viewedPlaceObj;
    if (!placeObj || placeObj.main !== name) {
        const match = INDONESIA_CITIES_DB.find(c => Math.abs(c.lat - lat) < 0.05 && Math.abs(c.lon - lon) < 0.05);
        if (match) {
            placeObj = { main: match.name, admin: match.admin, province: match.province };
        } else {
            placeObj = { main: name, admin: `Kota ${name}`, province: "Indonesia" };
        }
    }

    searchPlaceMarker.bindPopup(createAreaPopupHTML(placeObj, lat, lon), {
        maxWidth: 320,
        className: 'custom-area-popup'
    }).openPopup();
}

function updateGPSMarker(lat, lon, accuracy = 50, pan = false) {
    userCoords = [lat, lon];
    hasUserGPS = true;

    let placeObj = userPlaceObj || { main: "Batam", admin: "Kota Batam", province: "Kepulauan Riau" };
    const popupHtml = createAreaPopupHTML({
        main: `📍 ${placeObj.main}`,
        admin: `Lokasi Anda (GPS) • ±${Math.round(accuracy)}m`,
        province: placeObj.province
    }, lat, lon);

    if (!gpsMarker) {
        gpsMarker = L.marker([lat, lon], { icon: gpsPulseIcon, zIndexOffset: 1000 }).addTo(map);
        gpsMarker.bindPopup(popupHtml, { maxWidth: 320 });
    } else {
        gpsMarker.setLatLng([lat, lon]);
        gpsMarker.getPopup() && gpsMarker.setPopupContent(popupHtml);
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
        viewedCoords = [...userCoords];
        if (userPlaceObj) {
            renderLocationUI(userPlaceObj, userCoords[0], userCoords[1]);
            fetchWeather(userCoords[0], userCoords[1]);
        }
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
let currentNavTab = 'monitor'; // 'monitor' | 'saved' | 'recent'

function toggleSidebar() {
    if (window.innerWidth <= 768) {
        toggleMobileDrawer();
        return;
    }
    const panel = document.getElementById("mainPanel") || document.getElementById("panelContainer");
    const menuBtn = document.getElementById("railMenuBtn");

    isPanelCollapsed = !isPanelCollapsed;
    if (panel) panel.classList.toggle("collapsed", isPanelCollapsed);
    if (menuBtn && currentNavTab === 'monitor') menuBtn.classList.toggle("active", !isPanelCollapsed);
    document.body.classList.toggle("panel-collapsed", isPanelCollapsed);

    setTimeout(() => {
        map.invalidateSize();
        resizeCanvas();
    }, 360);
}

function switchNavTab(tabName) {
    // Jika mengklik tab yang sama, buka/tutup panel
    if (tabName === currentNavTab) {
        if (window.innerWidth <= 768) {
            toggleMobileDrawer();
        } else {
            toggleSidebar();
        }
        return;
    }

    currentNavTab = tabName;

    // Perbarui status aktif pada tombol navigasi rail
    const menuBtn = document.getElementById("railMenuBtn");
    const savedBtn = document.getElementById("railBtnSaved");
    const recentBtn = document.getElementById("railBtnRecent");

    if (menuBtn) menuBtn.classList.toggle("active", tabName === 'monitor');
    if (savedBtn) savedBtn.classList.toggle("active", tabName === 'saved');
    if (recentBtn) recentBtn.classList.toggle("active", tabName === 'recent');

    // Tampilkan panel tab yang sesuai
    const tabMonitor = document.getElementById("viewMonitor");
    const tabSaved = document.getElementById("viewSaved");
    const tabRecent = document.getElementById("viewRecent");

    if (tabMonitor) tabMonitor.style.display = tabName === 'monitor' ? 'flex' : 'none';
    if (tabSaved) tabSaved.style.display = tabName === 'saved' ? 'flex' : 'none';
    if (tabRecent) tabRecent.style.display = tabName === 'recent' ? 'flex' : 'none';

    // Refresh konten tab
    if (tabName === 'saved') {
        renderSavedPlacesUI();
        renderBookmarkedQuakesUI();
    } else if (tabName === 'recent') {
        renderRecentSearchesUI();
        render24hTimelineUI();
    }

    // Pastikan panel/drawer terbuka
    if (window.innerWidth <= 768) {
        toggleMobileDrawer(true);
    } else {
        if (isPanelCollapsed) {
            toggleSidebar();
        }
    }
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
    if (menuBtn && currentNavTab === 'monitor') menuBtn.classList.toggle("active", isMobileDrawerOpen);
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

    const safePlace = escapeQuotes(place);
    const safeTime = escapeQuotes(time);
    const safeDepth = escapeQuotes(depth || '10 km');
    const safePotensi = escapeQuotes(potensi || 'Tidak berpotensi tsunami');

    let popupContent = `
        <div class="quake-popup-box">
            <div class="quake-popup-header">
                <div class="quake-popup-src" style="color:${color};">
                    <span>${src}</span>
                    ${isLatest ? '<span style="font-size:10px; background:rgba(234,67,53,0.15); color:#ea4335; padding:1px 5px; border-radius:4px; font-weight:800;">⚡ MUTAKHIR</span>' : ''}
                </div>
                <div class="quake-popup-mag-badge" style="background:${color};">M ${mag.toFixed(1)}</div>
            </div>
            <div class="quake-popup-time">
                <svg style="width:12px; height:12px;" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/></svg>
                <span>${time}</span>
            </div>
            <div class="quake-popup-place">📍 ${place}</div>
            <div class="quake-popup-meta-row">Kedalaman: <b>${depth || '-'}</b></div>
            ${dirasakan && dirasakan !== '-' ? `<div class="quake-popup-alert-felt">⚠️ Dirasakan: <b>${dirasakan}</b></div>` : ''}
            ${potensi ? `<div class="quake-popup-alert-potensi">🛡️ ${potensi}</div>` : ''}
            ${dist !== null ? `<div class="quake-popup-dist">📏 Jarak: ${dist} km dari lokasi Anda</div>` : ''}
            <div class="quake-popup-coord">Koordinat: ${lat.toFixed(2)}, ${lon.toFixed(2)}</div>
            <div class="quake-popup-divider">
                <div class="quake-popup-share-label">
                    <svg style="width:11px; height:11px;" viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/></svg>
                    Bagikan Info Gempa:
                </div>
                <div class="quake-popup-share-grid">
                    <button class="btn-share-icon btn-share-wa" onclick="shareQuakeTo('wa', '${safePlace}', ${mag}, '${safeTime}', '${safeDepth}', '${safePotensi}', event)" title="Bagikan ke WhatsApp">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.58c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.41-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.12-.24-.19-.49-.31z"/></svg>
                    </button>
                    <button class="btn-share-icon btn-share-tg" onclick="shareQuakeTo('tg', '${safePlace}', ${mag}, '${safeTime}', '${safeDepth}', '${safePotensi}', event)" title="Bagikan ke Telegram">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.05-.49-.83-.27-1.49-.42-1.43-.88.03-.24.38-.49 1.03-.75 4.04-1.76 6.74-2.92 8.09-3.48 3.85-1.6 4.64-1.88 5.17-1.89.12 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.21-.04.37z"/></svg>
                    </button>
                    <button class="btn-share-icon btn-share-fb" onclick="shareQuakeTo('fb', '${safePlace}', ${mag}, '${safeTime}', '${safeDepth}', '${safePotensi}', event)" title="Bagikan ke Facebook">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95C18.05 21.45 22 17.19 22 12z"/></svg>
                    </button>
                    <button class="btn-share-icon btn-share-threads" onclick="shareQuakeTo('threads', '${safePlace}', ${mag}, '${safeTime}', '${safeDepth}', '${safePotensi}', event)" title="Bagikan ke Threads">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24c-3.535 0-6.425-1.205-8.36-3.483C1.942 18.29.986 15.112 1 11.233c.014-4.037 1.05-7.25 3.08-9.544C6.113-.604 9.023-.003 12.186 0c3.167 0 6.077.604 8.106 1.689 2.03 2.294 3.066 5.507 3.08 9.544.014 3.879-.942 7.057-2.826 9.284C18.611 22.795 15.721 24 12.186 24zm.446-4.665c1.884 0 3.32-.58 4.307-1.74.986-1.16 1.48-2.8 1.48-4.92 0-2.12-.494-3.76-1.48-4.92-.987-1.16-2.423-1.74-4.307-1.74s-3.32.58-4.307 1.74c-.986 1.16-1.48 2.8-1.48 4.92 0 2.12.494 3.76 1.48 4.92.987 1.16 2.423 1.74 4.307 1.74z"/></svg>
                    </button>
                    <button class="btn-share-icon btn-share-sms" onclick="shareQuakeTo('sms', '${safePlace}', ${mag}, '${safeTime}', '${safeDepth}', '${safePotensi}', event)" title="Bagikan via SMS">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9 11H7V9h2v2zm4 0h-2V9h2v2zm4 0h-2V9h2v2z"/></svg>
                    </button>
                    <button class="btn-share-icon btn-share-copy" onclick="shareQuakeTo('copy', '${safePlace}', ${mag}, '${safeTime}', '${safeDepth}', '${safePotensi}', event)" title="Salin Tautan / Lainnya">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/></svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    marker.bindPopup(popupContent);
}

// ==================== MULTI-PLATFORM SHARE QUAKE INFO ====================
function shareQuakeTo(platform, place, mag, time, depth, potensi, e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    const magVal = typeof mag === 'number' ? mag.toFixed(1) : parseFloat(mag).toFixed(1);
    const text = `⚠️ *INFORMASI GEMPA BUMI*\n📍 *Lokasi:* ${place}\n💥 *Magnitudo:* M ${magVal}\n🕒 *Waktu:* ${time}\n🌊 *Kedalaman:* ${depth} | ${potensi || 'Tidak berpotensi tsunami'}\n\n🌐 *Pantau Langsung Live Seismograf:*\nhttps://seismik.gracely.my.id/`;
    const shareUrl = 'https://seismik.gracely.my.id/';

    switch (platform) {
        case 'wa': {
            const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
            window.open(waUrl, '_blank');
            break;
        }
        case 'tg': {
            const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`;
            window.open(tgUrl, '_blank');
            break;
        }
        case 'fb': {
            const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(text)}`;
            window.open(fbUrl, '_blank');
            break;
        }
        case 'threads': {
            const thUrl = `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`;
            window.open(thUrl, '_blank');
            break;
        }
        case 'sms': {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            const smsPrefix = isIOS ? 'sms:&body=' : 'sms:?body=';
            window.location.href = `${smsPrefix}${encodeURIComponent(text)}`;
            break;
        }
        case 'copy':
        default: {
            if (navigator.share) {
                navigator.share({
                    title: `Info Gempa M ${magVal} - ${place}`,
                    text: text,
                    url: shareUrl
                }).catch(() => { });
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(text).then(() => {
                    showToastNotification('📋 Informasi gempa berhasil disalin ke clipboard!');
                }).catch(() => {
                    showToastNotification('Gagal menyalin teks.');
                });
            } else {
                showToastNotification('📋 Informasi gempa siap dibagikan!');
            }
            break;
        }
    }
}

function shareQuakeInfo(place, mag, time, depth, potensi, e) {
    shareQuakeTo('wa', place, mag, time, depth, potensi, e);
}

// ==================== INDONESIAN CITIES DATABASE & GEOCODING ====================
const INDONESIA_CITIES_DB = [
    // Sumatera
    { name: "Sibolga", admin: "Kota Sibolga", province: "Sumatera Utara", lat: 1.7428, lon: 98.7792 },
    { name: "Medan", admin: "Kota Medan", province: "Sumatera Utara", lat: 3.5952, lon: 98.6722 },
    { name: "Pekanbaru", admin: "Kota Pekanbaru", province: "Riau", lat: 0.5071, lon: 101.4478 },
    { name: "Padang", admin: "Kota Padang", province: "Sumatera Barat", lat: -0.9471, lon: 100.4172 },
    { name: "Batam", admin: "Kota Batam", province: "Kepulauan Riau", lat: 1.1030, lon: 104.0383 },
    { name: "Tanjungpinang", admin: "Kota Tanjungpinang", province: "Kepulauan Riau", lat: 0.9167, lon: 104.4583 },
    { name: "Banda Aceh", admin: "Kota Banda Aceh", province: "Aceh", lat: 5.5483, lon: 95.3238 },
    { name: "Palembang", admin: "Kota Palembang", province: "Sumatera Selatan", lat: -2.9761, lon: 104.7754 },
    { name: "Bandar Lampung", admin: "Kota Bandar Lampung", province: "Lampung", lat: -5.4500, lon: 105.2667 },
    { name: "Jambi", admin: "Kota Jambi", province: "Jambi", lat: -1.6101, lon: 103.6131 },
    { name: "Bengkulu", admin: "Kota Bengkulu", province: "Bengkulu", lat: -3.8004, lon: 102.2655 },
    { name: "Pangkalpinang", admin: "Kota Pangkalpinang", province: "Kep. Bangka Belitung", lat: -2.1333, lon: 106.1167 },
    { name: "Pematangsiantar", admin: "Kota Pematangsiantar", province: "Sumatera Utara", lat: 2.9583, lon: 99.0667 },
    { name: "Bukittinggi", admin: "Kota Bukittinggi", province: "Sumatera Barat", lat: -0.3056, lon: 100.3692 },
    { name: "Dumai", admin: "Kota Dumai", province: "Riau", lat: 1.6667, lon: 101.4500 },

    // Jawa
    { name: "Jakarta", admin: "DKI Jakarta", province: "DKI Jakarta", lat: -6.2088, lon: 106.8456 },
    { name: "Bandung", admin: "Kota Bandung", province: "Jawa Barat", lat: -6.9175, lon: 107.6191 },
    { name: "Surabaya", admin: "Kota Surabaya", province: "Jawa Timur", lat: -7.2575, lon: 112.7521 },
    { name: "Semarang", admin: "Kota Semarang", province: "Jawa Tengah", lat: -6.9667, lon: 110.4167 },
    { name: "Yogyakarta", admin: "Kota Yogyakarta", province: "D.I. Yogyakarta", lat: -7.7956, lon: 110.3695 },
    { name: "Bekasi", admin: "Kota Bekasi", province: "Jawa Barat", lat: -6.2383, lon: 106.9756 },
    { name: "Depok", admin: "Kota Depok", province: "Jawa Barat", lat: -6.4025, lon: 106.7942 },
    { name: "Tangerang", admin: "Kota Tangerang", province: "Banten", lat: -6.1783, lon: 106.6319 },
    { name: "Tangerang Selatan", admin: "Kota Tangerang Selatan", province: "Banten", lat: -6.2886, lon: 106.7179 },
    { name: "Bogor", admin: "Kota Bogor", province: "Jawa Barat", lat: -6.5971, lon: 106.8060 },
    { name: "Surakarta (Solo)", admin: "Kota Surakarta", province: "Jawa Tengah", lat: -7.5755, lon: 110.8243 },
    { name: "Malang", admin: "Kota Malang", province: "Jawa Timur", lat: -7.9797, lon: 112.6304 },
    { name: "Cirebon", admin: "Kota Cirebon", province: "Jawa Barat", lat: -6.7320, lon: 108.5523 },
    { name: "Serang", admin: "Kota Serang", province: "Banten", lat: -6.1104, lon: 106.1640 },

    // Bali & Nusa Tenggara
    { name: "Denpasar", admin: "Kota Denpasar", province: "Bali", lat: -8.6705, lon: 115.2126 },
    { name: "Mataram", admin: "Kota Mataram", province: "Nusa Tenggara Barat", lat: -8.5833, lon: 116.1167 },
    { name: "Kupang", admin: "Kota Kupang", province: "Nusa Tenggara Timur", lat: -10.1772, lon: 123.6070 },
    { name: "Labuan Bajo", admin: "Kabupaten Manggarai Barat", province: "Nusa Tenggara Timur", lat: -8.4964, lon: 119.8877 },
    { name: "Ruteng", admin: "Kabupaten Manggarai", province: "Nusa Tenggara Timur", lat: -8.6134, lon: 120.4721 },

    // Kalimantan
    { name: "Pontianak", admin: "Kota Pontianak", province: "Kalimantan Barat", lat: -0.0263, lon: 109.3425 },
    { name: "Banjarmasin", admin: "Kota Banjarmasin", province: "Kalimantan Selatan", lat: -3.3167, lon: 114.5900 },
    { name: "Balikpapan", admin: "Kota Balikpapan", province: "Kalimantan Timur", lat: -1.2379, lon: 116.8529 },
    { name: "Samarinda", admin: "Kota Samarinda", province: "Kalimantan Timur", lat: -0.5022, lon: 117.1536 },
    { name: "Palangka Raya", admin: "Kota Palangka Raya", province: "Kalimantan Tengah", lat: -2.2167, lon: 113.9167 },
    { name: "Tarakan", admin: "Kota Tarakan", province: "Kalimantan Utara", lat: 3.3000, lon: 117.6333 },
    { name: "Nusantara (IKN)", admin: "Ibu Kota Nusantara", province: "Kalimantan Timur", lat: -0.9744, lon: 116.7089 },

    // Sulawesi, Maluku & Papua
    { name: "Makassar", admin: "Kota Makassar", province: "Sulawesi Selatan", lat: -5.1477, lon: 119.4327 },
    { name: "Manado", admin: "Kota Manado", province: "Sulawesi Utara", lat: 1.4748, lon: 124.8421 },
    { name: "Palu", admin: "Kota Palu", province: "Sulawesi Tengah", lat: -0.9000, lon: 119.8707 },
    { name: "Kendari", admin: "Kota Kendari", province: "Sulawesi Tenggara", lat: -3.9985, lon: 122.5126 },
    { name: "Gorontalo", admin: "Kota Gorontalo", province: "Gorontalo", lat: 0.5435, lon: 123.0568 },
    { name: "Mamuju", admin: "Kabupaten Mamuju", province: "Sulawesi Barat", lat: -2.6778, lon: 118.8878 },
    { name: "Ambon", admin: "Kota Ambon", province: "Maluku", lat: -3.6547, lon: 128.1906 },
    { name: "Ternate", admin: "Kota Ternate", province: "Maluku Utara", lat: 0.7833, lon: 127.3667 },
    { name: "Jayapura", admin: "Kota Jayapura", province: "Papua", lat: -2.5337, lon: 140.7181 },
    { name: "Sorong", admin: "Kota Sorong", province: "Papua Barat Daya", lat: -0.8762, lon: 131.2558 },
    { name: "Manokwari", admin: "Kabupaten Manokwari", province: "Papua Barat", lat: -0.8615, lon: 134.0620 },
    { name: "Merauke", admin: "Kabupaten Merauke", province: "Papua Selatan", lat: -8.4991, lon: 140.4019 }
];

let searchDebounceTimer = null;

function handleSearch(val) {
    searchQuery = (val || "").trim();
    const clearBtn = document.getElementById("searchClearBtn");
    if (clearBtn) clearBtn.style.display = searchQuery ? "flex" : "none";

    // 1. Filter data gempa yang sedang dimuat
    updateRecentQuakesUI();

    // 2. Query saran kota untuk dropdown otomatis
    clearTimeout(searchDebounceTimer);
    if (!searchQuery || searchQuery.length < 2) {
        hideSearchSuggestions();
        return;
    }

    searchDebounceTimer = setTimeout(() => {
        performCitySearch(searchQuery);
    }, 150);
}

function handleSearchKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        triggerSearchCity();
    } else if (e.key === 'Escape') {
        hideSearchSuggestions();
    }
}

function triggerSearchCity() {
    const input = document.getElementById("searchInput");
    const val = input ? input.value.trim() : "";
    if (!val) return;

    const q = val.toLowerCase();
    const match = INDONESIA_CITIES_DB.find(c =>
        c.name.toLowerCase() === q ||
        c.admin.toLowerCase() === q ||
        c.name.toLowerCase().includes(q)
    );

    if (match) {
        selectSearchCity(match.name, match.admin, match.province, match.lat, match.lon);
    } else {
        fetchOnlineGeocode(val, false);
    }
}

function performCitySearch(query) {
    const q = query.toLowerCase();
    const localMatches = INDONESIA_CITIES_DB.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.admin.toLowerCase().includes(q) ||
        c.province.toLowerCase().includes(q)
    ).slice(0, 5);

    if (localMatches.length > 0) {
        renderSearchSuggestions(localMatches);
    } else {
        fetchOnlineGeocode(query, true);
    }
}

async function fetchOnlineGeocode(query, renderOnly = false) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=id&limit=5&addressdetails=1`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.length > 0) {
                const results = data.map(item => {
                    const addr = item.address || {};
                    let name = addr.city || addr.town || addr.municipality || addr.county || item.name || query;
                    let prov = addr.state || addr.region || "Indonesia";
                    let admin = addr.county || addr.city_district || ("Kota " + name);
                    return {
                        name: name,
                        admin: admin,
                        province: prov,
                        lat: parseFloat(item.lat),
                        lon: parseFloat(item.lon)
                    };
                });

                if (renderOnly) {
                    renderSearchSuggestions(results);
                } else {
                    const top = results[0];
                    selectSearchCity(top.name, top.admin, top.province, top.lat, top.lon);
                }
                return;
            }
        }
    } catch (e) {
        console.warn("Online geocode error:", e);
    }

    if (renderOnly) hideSearchSuggestions();
}

function renderSearchSuggestions(cities) {
    const dropdown = document.getElementById("searchSuggestionsDropdown");
    if (!dropdown) return;

    if (!cities || cities.length === 0) {
        hideSearchSuggestions();
        return;
    }

    dropdown.innerHTML = cities.map(c => `
        <div class="search-suggestion-item" onclick="selectSearchCity('${escapeQuotes(c.name)}', '${escapeQuotes(c.admin)}', '${escapeQuotes(c.province)}', ${c.lat}, ${c.lon})">
            <div class="suggestion-icon">
                <svg class="gmap-icon" style="width:16px; height:16px;" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            </div>
            <div class="suggestion-text-group">
                <div class="suggestion-main-name">${c.name}</div>
                <div class="suggestion-sub-name">${c.admin}, ${c.province}</div>
            </div>
        </div>
    `).join('');

    dropdown.style.display = "flex";
}

function hideSearchSuggestions() {
    const dropdown = document.getElementById("searchSuggestionsDropdown");
    if (dropdown) dropdown.style.display = "none";
}

function selectSearchCity(name, admin, prov, lat, lon) {
    hideSearchSuggestions();

    const input = document.getElementById("searchInput");
    if (input) input.value = name;
    const clearBtn = document.getElementById("searchClearBtn");
    if (clearBtn) clearBtn.style.display = "flex";

    // Pindah fokus peta ke kota yang dicari
    map.flyTo([lat, lon], 10, { duration: 1.2 });
    viewedCoords = [lat, lon];

    // Perbarui objek lokasi dan kartu area (tanpa menimpa GPS asli pengguna)
    const placeObj = { main: name, admin: admin, province: prov };
    viewedPlaceObj = placeObj;
    renderLocationUI(placeObj, lat, lon);

    // Tampilkan Pin Merah lokasi pencarian
    showPlacePinMarker(lat, lon, name);

    // Ambil cuaca kota tersebut secara real-time
    fetchWeather(lat, lon);

    // Periksa risiko gempa di sekitar kota tersebut
    checkProximityRisk();

    // Catat ke Riwayat Penelusuran (Tab Terbaru)
    addRecentSearch(name, lat, lon);

    // Pastikan berada di Tab Monitor untuk melihat detail kota
    if (currentNavTab !== 'monitor') {
        switchNavTab('monitor');
    }
}

function clearSearch() {
    const input = document.getElementById("searchInput");
    if (input) input.value = "";
    hideSearchSuggestions();
    handleSearch("");
}

// Tutup dropdown saran saat klik di luar kotak pencarian
document.addEventListener('click', (e) => {
    const wrap = document.getElementById("searchBoxCard");
    const dropdown = document.getElementById("searchSuggestionsDropdown");
    if (dropdown && dropdown.style.display !== 'none' && wrap && !wrap.contains(e.target) && !dropdown.contains(e.target)) {
        hideSearchSuggestions();
    }
});

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
        let isBookmarked = isQuakeBookmarked(q);
        let safePlace = escapeQuotes(q.place);
        let humanTime = formatQuakeTime(q);
        return `
            <div class="quake-card-item" onclick="focusQuake(${q.lat}, ${q.lon})">
                <div class="quake-mag-badge ${magClass}">M ${q.mag.toFixed(1)}</div>
                <div class="quake-item-details">
                    <div class="quake-item-place">${q.place}</div>
                    <div class="quake-item-sub">
                        <span>🕒 ${humanTime}</span>
                        ${dist !== null ? `<span class="quake-dist">• 📏 ${dist} km</span>` : ''}
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 2px;">
                    <button class="btn-quake-share" onclick="shareQuakeInfo('${safePlace}', ${q.mag}, '${humanTime || q.time}', '${q.depth || '10 km'}', '${escapeQuotes(q.potensi || 'Tidak berpotensi tsunami')}', event)" title="Bagikan Info Gempa (WhatsApp)">
                        <svg class="gmap-icon" style="width:15px; height:15px;" viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/></svg>
                    </button>
                    <button class="btn-item-delete" style="color:${isBookmarked ? 'var(--accent-blue)' : 'var(--text-muted)'};" onclick="toggleBookmarkQuake({lat:${q.lat}, lon:${q.lon}, mag:${q.mag}, place:'${safePlace}', time:'${q.time}', depth:'${q.depth || '-'}'}, event)" title="${isBookmarked ? 'Hapus Bookmark' : 'Tandai Gempa'}">
                        <svg class="gmap-icon" style="width:16px; height:16px;" viewBox="0 0 24 24" fill="currentColor">
                            ${isBookmarked ? '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>' : '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>'}
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function formatQuakeTime(q) {
    if (!q) return "-";
    let ts = q.iso ? new Date(q.iso).getTime() : null;
    if (!ts || isNaN(ts)) {
        return q.time || "-";
    }

    const now = Date.now();
    const diffMs = now - ts;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    const d = new Date(ts);
    const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const monthStr = months[d.getMonth()];

    const today = new Date();
    const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear();

    if (diffMins >= 0 && diffMins < 60) {
        return `${diffMins} mnt lalu (${timeStr})`;
    } else if (isToday) {
        return `Hari ini, ${timeStr} (${diffHours}j lalu)`;
    } else if (isYesterday) {
        return `Kemarin, ${timeStr}`;
    } else {
        return `${day} ${monthStr}, ${timeStr}`;
    }
}

function escapeQuotes(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
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

// ==================== DISIMPAN (SAVED PLACES & CUSTOM WATCHLIST) ====================
const DEFAULT_SAVED_PLACES = [
    { id: 'sibolga', name: 'Sibolga', admin: 'Kota Sibolga', province: 'Sumatera Utara', lat: 1.7428, lon: 98.7792, temp: '28°C' },
    { id: 'pekanbaru', name: 'Pekanbaru', admin: 'Kota Pekanbaru', province: 'Riau', lat: 0.5071, lon: 101.4478, temp: '29°C' },
    { id: 'batam', name: 'Batam', admin: 'Kota Batam', province: 'Kepulauan Riau', lat: 1.1030, lon: 104.0383, temp: '28°C' },
    { id: 'padang', name: 'Padang', admin: 'Kota Padang', province: 'Sumatera Barat', lat: -0.9471, lon: 100.4172, temp: '27°C' },
    { id: 'jakarta', name: 'Jakarta', admin: 'DKI Jakarta', province: 'Indonesia', lat: -6.2088, lon: 106.8456, temp: '30°C' }
];

function getSavedPlaces() {
    try {
        const data = localStorage.getItem('seismo_saved_places');
        if (data) return JSON.parse(data);
    } catch (e) { }
    return DEFAULT_SAVED_PLACES;
}

function savePlacesList(places) {
    try {
        localStorage.setItem('seismo_saved_places', JSON.stringify(places));
    } catch (e) { }
}

function toggleSaveCurrentArea() {
    const cityName = viewedPlaceObj?.main || document.getElementById("areaCityMain")?.innerText || "Wilayah Terpilih";
    const adminName = viewedPlaceObj?.admin || document.getElementById("areaCityAdmin")?.innerText || "";
    const provName = viewedPlaceObj?.province || document.getElementById("areaProvince")?.innerText || "";
    const lat = viewedCoords[0];
    const lon = viewedCoords[1];
    const tempText = document.getElementById("weatherConditionTemp")?.innerText || "28°C";

    let places = getSavedPlaces();
    const existingIndex = places.findIndex(p => Math.abs(p.lat - lat) < 0.05 && Math.abs(p.lon - lon) < 0.05);

    const btnIcon = document.getElementById("bookmarkAreaIcon");
    const btnEl = document.getElementById("btnBookmarkArea");

    if (existingIndex >= 0) {
        places.splice(existingIndex, 1);
        savePlacesList(places);
        if (btnEl) btnEl.classList.remove("active");
        if (btnIcon) btnIcon.innerHTML = '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>';
    } else {
        const newPlace = {
            id: 'place_' + Date.now(),
            name: cityName,
            admin: adminName,
            province: provName,
            lat: lat,
            lon: lon,
            temp: tempText
        };
        places.unshift(newPlace);
        savePlacesList(places);
        if (btnEl) btnEl.classList.add("active");
        if (btnIcon) btnIcon.innerHTML = '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>';
    }

    renderSavedPlacesUI();
}

function updateBookmarkIconState() {
    const lat = viewedCoords[0];
    const lon = viewedCoords[1];
    const places = getSavedPlaces();
    const isSaved = places.some(p => Math.abs(p.lat - lat) < 0.05 && Math.abs(p.lon - lon) < 0.05);

    const btnIcon = document.getElementById("bookmarkAreaIcon");
    const btnEl = document.getElementById("btnBookmarkArea");
    if (btnEl) btnEl.classList.toggle("active", isSaved);
    if (btnIcon) {
        btnIcon.innerHTML = isSaved
            ? '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>'
            : '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>';
    }
}

function removeSavedPlace(id, e) {
    if (e) e.stopPropagation();
    let places = getSavedPlaces().filter(p => p.id !== id);
    savePlacesList(places);
    renderSavedPlacesUI();
    updateBookmarkIconState();
}

function flyToSavedPlace(lat, lon, name) {
    map.flyTo([lat, lon], 10, { duration: 1.2 });
    viewedCoords = [lat, lon];

    // Temukan detail kota dari database lokal atau format nama
    const match = INDONESIA_CITIES_DB.find(c => Math.abs(c.lat - lat) < 0.05 && Math.abs(c.lon - lon) < 0.05);
    if (match) {
        viewedPlaceObj = { main: match.name, admin: match.admin, province: match.province };
        renderLocationUI(viewedPlaceObj, lat, lon);
    } else {
        fetchLocationNameForView(lat, lon);
    }

    // Tampilkan Pin Merah wilayah pantauan (bukan GPS marker)
    showPlacePinMarker(lat, lon, name);

    fetchWeather(lat, lon);
    checkProximityRisk();
    addRecentSearch(name, lat, lon);

    if (window.innerWidth <= 768) {
        toggleMobileDrawer(false);
    }
}

function renderSavedPlacesUI() {
    const container = document.getElementById("savedPlacesList");
    const badge = document.getElementById("savedPlacesCountBadge");
    if (!container) return;

    const places = getSavedPlaces();
    if (badge) badge.innerText = `${places.length} disimpan`;

    if (places.length === 0) {
        container.innerHTML = `
            <div style="font-size:11px; color:var(--text-muted); text-align:center; padding:16px;">
                Belum ada wilayah pantauan yang disimpan.<br>
                Klik tombol <b>＋ Simpan Wilayah Ini</b> untuk menambahkan.
            </div>
        `;
        return;
    }

    container.innerHTML = places.map(p => {
        let nearestDist = null;
        let nearestMag = 0;
        quakesArray.forEach(q => {
            let d = calcDistance(p.lat, p.lon, q.lat, q.lon);
            if (nearestDist === null || d < nearestDist) {
                nearestDist = d;
                nearestMag = q.mag;
            }
        });

        let isWarning = nearestDist !== null && nearestDist <= 150 && nearestMag >= 4.5;
        let statusLabel = isWarning
            ? `⚠️ Gempa M${nearestMag.toFixed(1)} (${nearestDist} km)`
            : (nearestDist !== null ? `🟢 Terpantau Aman (${nearestDist} km)` : `🟢 Terpantau Aman`);

        let safeName = escapeQuotes(p.name);
        return `
            <div class="saved-place-card" onclick="flyToSavedPlace(${p.lat}, ${p.lon}, '${safeName}')">
                <div class="saved-place-info">
                    <div class="saved-place-name">📍 ${p.name}</div>
                    <div class="saved-place-sub">
                        <span class="saved-place-status-dot ${isWarning ? 'warning' : ''}"></span>
                        <span>${statusLabel}</span>
                    </div>
                </div>
                <div class="saved-place-right">
                    <div class="saved-place-weather">${p.temp || '28°C'}</div>
                    <button class="btn-item-delete" onclick="removeSavedPlace('${p.id}', event)" title="Hapus dari Disimpan">
                        <svg class="gmap-icon" style="width:14px; height:14px;" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== GEMPA DITANDAI (BOOKMARKED QUAKES) ====================
function getBookmarkedQuakes() {
    try {
        const data = localStorage.getItem('seismo_bookmarked_quakes');
        if (data) return JSON.parse(data);
    } catch (e) { }
    return [];
}

function isQuakeBookmarked(quakeObj) {
    const id = `${quakeObj.lat.toFixed(2)}_${quakeObj.lon.toFixed(2)}_${quakeObj.time}`;
    return getBookmarkedQuakes().some(b => b.id === id);
}

function saveBookmarkedQuakes(list) {
    try {
        localStorage.setItem('seismo_bookmarked_quakes', JSON.stringify(list));
    } catch (e) { }
}

function toggleBookmarkQuake(quakeObj, e) {
    if (e) e.stopPropagation();
    let bookmarks = getBookmarkedQuakes();
    const id = `${quakeObj.lat.toFixed(2)}_${quakeObj.lon.toFixed(2)}_${quakeObj.time}`;
    const idx = bookmarks.findIndex(b => b.id === id);

    if (idx >= 0) {
        bookmarks.splice(idx, 1);
    } else {
        bookmarks.unshift({
            id: id,
            lat: quakeObj.lat,
            lon: quakeObj.lon,
            mag: quakeObj.mag,
            place: quakeObj.place,
            time: quakeObj.time,
            depth: quakeObj.depth
        });
    }
    saveBookmarkedQuakes(bookmarks);
    renderBookmarkedQuakesUI();
    updateRecentQuakesUI();
}

function renderBookmarkedQuakesUI() {
    const container = document.getElementById("bookmarkedQuakesList");
    const badge = document.getElementById("bookmarkedQuakesCountBadge");
    if (!container) return;

    const bookmarks = getBookmarkedQuakes();
    if (badge) badge.innerText = `${bookmarks.length} ditandai`;

    if (bookmarks.length === 0) {
        container.innerHTML = `
            <div style="font-size:11px; color:var(--text-muted); text-align:center; padding:16px;">
                Belum ada gempa yang ditandai.<br>
                Klik ikon bookmark pada kartu gempa untuk menyimpannya di sini.
            </div>
        `;
        return;
    }

    container.innerHTML = bookmarks.map(q => {
        let magClass = q.mag >= 5 ? 'mag-red' : (q.mag >= 3 ? 'mag-orange' : 'mag-gray');
        let safePlace = escapeQuotes(q.place);
        return `
            <div class="quake-card-item" onclick="focusQuake(${q.lat}, ${q.lon})">
                <div class="quake-mag-badge ${magClass}">M ${q.mag.toFixed(1)}</div>
                <div class="quake-item-details">
                    <div class="quake-item-place">${q.place}</div>
                    <div class="quake-item-sub">
                        <span>🕒 ${q.time}</span>
                        <span>• Kedalaman ${q.depth}</span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 2px;">
                    <button class="btn-quake-share" onclick="shareQuakeInfo('${safePlace}', ${q.mag}, '${escapeQuotes(q.time)}', '${escapeQuotes(q.depth || '10 km')}', 'Tidak berpotensi tsunami', event)" title="Bagikan Info Gempa (WhatsApp)">
                        <svg class="gmap-icon" style="width:15px; height:15px;" viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/></svg>
                    </button>
                    <button class="btn-item-delete" style="color:var(--accent-red);" onclick="toggleBookmarkQuake({lat:${q.lat}, lon:${q.lon}, time:'${q.time}'}, event)" title="Hapus Bookmark">
                        <svg class="gmap-icon" style="width:14px; height:14px;" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== TERBARU (RECENT SEARCHES & 24H FEED) ====================
function getRecentSearches() {
    try {
        const data = localStorage.getItem('seismo_recent_searches');
        if (data !== null) return JSON.parse(data);
    } catch (e) { }
    return [
        { name: "Sibolga", lat: 1.7428, lon: 98.7792, time: "Hari ini" },
        { name: "Pekanbaru", lat: 0.5071, lon: 101.4478, time: "Hari ini" }
    ];
}

function addRecentSearch(name, lat, lon) {
    if (!name) return;
    let list = getRecentSearches();
    list = list.filter(item => item.name.toLowerCase() !== name.toLowerCase());
    list.unshift({
        name: name,
        lat: lat,
        lon: lon,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    if (list.length > 10) list.pop();
    try {
        localStorage.setItem('seismo_recent_searches', JSON.stringify(list));
    } catch (e) { }
    renderRecentSearchesUI();
}

function clearRecentSearches() {
    try {
        localStorage.setItem('seismo_recent_searches', JSON.stringify([]));
    } catch (e) { }
    renderRecentSearchesUI();
}

function renderRecentSearchesUI() {
    const container = document.getElementById("recentSearchesList");
    const badge = document.getElementById("recentSearchesCountBadge");
    if (!container) return;

    const searches = getRecentSearches();
    if (badge) badge.innerText = `${searches.length} riwayat`;

    if (searches.length === 0) {
        container.innerHTML = `
            <div style="font-size:11px; color:var(--text-muted); text-align:center; padding:16px;">
                Belum ada riwayat penelusuran.
            </div>
        `;
        return;
    }

    container.innerHTML = searches.map(s => {
        let safeName = escapeQuotes(s.name);
        return `
            <div class="recent-search-card" onclick="flyToSavedPlace(${s.lat}, ${s.lon}, '${safeName}')">
                <div class="recent-search-left">
                    <svg class="gmap-icon" style="width:14px; height:14px; color:var(--text-muted);" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
                    <div class="recent-search-text">${s.name}</div>
                </div>
                <span class="recent-search-time">${s.time}</span>
            </div>
        `;
    }).join('');
}

let timelineFilter = '24h'; // '24h' | '7d' | 'all'

function setTimelineFilter(filter) {
    timelineFilter = filter;

    const c24 = document.getElementById("chipTimeline24h");
    const c7d = document.getElementById("chipTimeline7d");
    const cAll = document.getElementById("chipTimelineAll");
    if (c24) c24.classList.toggle("active", filter === '24h');
    if (c7d) c7d.classList.toggle("active", filter === '7d');
    if (cAll) cAll.classList.toggle("active", filter === 'all');

    const titleEl = document.getElementById("timelineTitleText");
    if (titleEl) {
        titleEl.innerText = filter === '24h' ? '⏱️ Linimasa Gempa 24 Jam' : (filter === '7d' ? '⏱️ Linimasa Gempa 7 Hari' : '⏱️ Semua Riwayat Gempa');
    }

    render24hTimelineUI();
}

function render24hTimelineUI() {
    const container = document.getElementById("timeline24hList");
    const badge = document.getElementById("timeline24hCountBadge");
    if (!container) return;

    const now = Date.now();
    const filteredQuakes = quakesArray.filter(q => {
        let ts = q.iso ? new Date(q.iso).getTime() : 0;
        if (!ts || isNaN(ts)) return true;
        const diffMs = now - ts;
        if (timelineFilter === '24h') {
            return diffMs <= (24 * 60 * 60 * 1000); // Gempa dalam 24 jam terakhir
        } else if (timelineFilter === '7d') {
            return diffMs <= (7 * 24 * 60 * 60 * 1000); // Gempa 7 hari terakhir
        }
        return true;
    });

    if (badge) badge.innerText = `${filteredQuakes.length} data`;

    if (filteredQuakes.length === 0) {
        let label = timelineFilter === '24h' ? '24 jam terakhir' : 'rentang waktu ini';
        container.innerHTML = `
            <div style="font-size:11px; color:var(--text-muted); text-align:center; padding:16px;">
                Tidak ada gempa tercatat dalam ${label}.
            </div>
        `;
        return;
    }

    container.innerHTML = filteredQuakes.map(q => {
        let magClass = q.mag >= 5 ? 'mag-red' : (q.mag >= 3 ? 'mag-orange' : 'mag-gray');
        let dist = hasUserGPS ? calcDistance(userCoords[0], userCoords[1], q.lat, q.lon) : null;
        let isBookmarked = isQuakeBookmarked(q);
        let safePlace = escapeQuotes(q.place);
        let humanTime = formatQuakeTime(q);
        return `
            <div class="quake-card-item" onclick="focusQuake(${q.lat}, ${q.lon})">
                <div class="quake-mag-badge ${magClass}">M ${q.mag.toFixed(1)}</div>
                <div class="quake-item-details">
                    <div class="quake-item-place">${q.place}</div>
                    <div class="quake-item-sub">
                        <span>🕒 ${humanTime}</span>
                        <span>• Kedalaman ${q.depth}</span>
                        ${dist !== null ? `<span class="quake-dist">• 📏 ${dist} km</span>` : ''}
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 2px;">
                    <button class="btn-quake-share" onclick="shareQuakeInfo('${safePlace}', ${q.mag}, '${humanTime || q.time}', '${q.depth || '10 km'}', '${escapeQuotes(q.potensi || 'Tidak berpotensi tsunami')}', event)" title="Bagikan Info Gempa (WhatsApp)">
                        <svg class="gmap-icon" style="width:15px; height:15px;" viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/></svg>
                    </button>
                    <button class="btn-item-delete" style="color:${isBookmarked ? 'var(--accent-blue)' : 'var(--text-muted)'};" onclick="toggleBookmarkQuake({lat:${q.lat}, lon:${q.lon}, mag:${q.mag}, place:'${safePlace}', time:'${q.time}', depth:'${q.depth || '-'}'}, event)" title="${isBookmarked ? 'Hapus Bookmark' : 'Tandai Gempa'}">
                        <svg class="gmap-icon" style="width:16px; height:16px;" viewBox="0 0 24 24" fill="currentColor">
                            ${isBookmarked ? '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>' : '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>'}
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function checkProximityRisk() {
    const dot = document.getElementById("statusDot");
    const text = document.getElementById("riskStatusText");
    if (!text) return;

    const targetCoords = (viewedCoords && viewedCoords.length === 2) ? viewedCoords : userCoords;

    let closeQuake = quakesArray.find(q => {
        let dist = calcDistance(targetCoords[0], targetCoords[1], q.lat, q.lon);
        return q.mag >= 5.0 && dist < 350;
    });

    if (closeQuake) {
        if (dot) dot.className = "status-dot warning";
        let dist = calcDistance(targetCoords[0], targetCoords[1], closeQuake.lat, closeQuake.lon);
        text.innerHTML = `<b style="color:var(--accent-red)">Waspada:</b> Gempa M${closeQuake.mag} ${dist}km dari wilayah ini!`;
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

    // 1. Validasi Geografis Ketat Berdasarkan Bounding Box Koordinat
    // Sibolga & Tapanuli Tengah (Sumatera Utara)
    if (lat >= 1.55 && lat <= 1.95 && lon >= 98.55 && lon <= 99.05) {
        return { main: "Sibolga", admin: "Kota Sibolga", province: "Sumatera Utara" };
    }

    // Batam / Barelang / Bintan / Kepulauan Riau
    if (lat >= 0.5 && lat <= 1.5 && lon >= 103.4 && lon <= 104.9) {
        let isTPI = (rawCity && rawCity.toLowerCase().includes("tanjung pinang")) || (rawLocality && rawLocality.toLowerCase().includes("tanjung pinang"));
        let isBintan = (rawCity && rawCity.toLowerCase().includes("bintan")) || (rawLocality && rawLocality.toLowerCase().includes("bintan"));
        let isKarimun = (rawCity && rawCity.toLowerCase().includes("karimun")) || (rawLocality && rawLocality.toLowerCase().includes("karimun"));

        if (isTPI) {
            return { main: "Tanjungpinang", admin: "Kota Tanjungpinang", province: "Kepulauan Riau" };
        } else if (isBintan) {
            return { main: "Bintan", admin: "Kabupaten Bintan", province: "Kepulauan Riau" };
        } else if (isKarimun) {
            return { main: "Karimun", admin: "Kabupaten Karimun", province: "Kepulauan Riau" };
        } else {
            return { main: "Batam", admin: "Kota Batam", province: "Kepulauan Riau" };
        }
    }

    // DKI Jakarta
    if (lat >= -6.4 && lat <= -6.0 && lon >= 106.65 && lon <= 107.0) {
        return { main: "Jakarta", admin: "DKI Jakarta", province: "DKI Jakarta" };
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
        if (provLower.includes("riau islands") || provLower.includes("kepulauan riau") || provLower === "riau kepulauan") {
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
        } else if (provLower.includes("yogyakarta") || provLower.includes("jogja")) {
            province = "D.I. Yogyakarta";
        } else if (provLower.includes("bali")) {
            province = "Bali";
        } else {
            province = candidateProv;
        }
    }

    // Cegah anomali: Koordinat di luar pulau Jawa tidak boleh berprovinsi Jawa/Jakarta
    if (lat > -5.0 && (province.toLowerCase().includes("jawa") || province.toLowerCase().includes("jakarta"))) {
        if (lat >= -1.0 && lat <= 2.0 && lon >= 100.0 && lon <= 106.0) {
            province = (lon >= 103.4) ? "Kepulauan Riau" : "Riau";
        } else if (lat > 2.0 && lon <= 100.0) {
            province = "Sumatera Utara";
        } else {
            province = "Indonesia";
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

    updateBookmarkIconState();
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
                const validatedObj = formatIndonesianPlace(cachedObj.main, cachedObj.admin, cachedObj.province, lat, lon);
                userPlaceObj = validatedObj;
                userPlaceName = `${validatedObj.main}, ${validatedObj.admin}, ${validatedObj.province}`;
                viewedPlaceObj = validatedObj;
                renderLocationUI(validatedObj, lat, lon);
                if (gpsMarker) updateGPSMarker(lat, lon, parseFloat(savedAcc) || 50, false);
                return validatedObj;
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
            viewedPlaceObj = obj;

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
                viewedPlaceObj = obj;

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
    userPlaceObj = fallbackObj;
    viewedPlaceObj = fallbackObj;
    renderLocationUI(fallbackObj, lat, lon);
}

// Reverse geocoding khusus saat meninjau wilayah favorit / pencarian (tanpa menimpa GPS asli pengguna)
async function fetchLocationNameForView(lat, lon) {
    try {
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`);
        if (res.ok) {
            const data = await res.json();
            let city = data.city || data.locality || data.principalSubdivision || "";
            let locality = data.locality || "";
            let prov = data.principalSubdivision || "";

            const obj = formatIndonesianPlace(city, locality, prov, lat, lon);
            viewedPlaceObj = obj;
            renderLocationUI(obj, lat, lon);
            return obj;
        }
    } catch (e) { }

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
                viewedPlaceObj = obj;
                renderLocationUI(obj, lat, lon);
                return obj;
            }
        }
    } catch (e) { }

    const fallbackObj = formatIndonesianPlace("", "", "", lat, lon);
    viewedPlaceObj = fallbackObj;
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

    if (searchPlaceMarker && searchPlaceMarker.getPopup() && searchPlaceMarker.isPopupOpen()) {
        searchPlaceMarker.setPopupContent(createAreaPopupHTML(viewedPlaceObj, viewedCoords[0], viewedCoords[1]));
    }
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
        viewedCoords = [lat, lon];
        hasUserGPS = true;

        if (userPlaceObj) {
            viewedPlaceObj = userPlaceObj;
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
        const defaultObj = { main: "Batam", admin: "Kota Batam", province: "Kepulauan Riau" };
        userCoords = [1.1030, 104.0383];
        viewedCoords = [1.1030, 104.0383];
        viewedPlaceObj = defaultObj;
        renderLocationUI(defaultObj, 1.1030, 104.0383);
        fetchWeather(1.1030, 104.0383);
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

// ==================== ABOUT & DEVELOPER MODAL ====================
function openAppInfo() {
    const modal = document.getElementById("modalAppInfo");
    if (modal) {
        modal.style.display = "flex";
    }
}

function closeAppInfo(e) {
    if (e && e.target && e.target !== e.currentTarget) return;
    const modal = document.getElementById("modalAppInfo");
    if (modal) modal.style.display = "none";
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

// ==================== APP INITIALIZATION ====================

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    applyMapLayer(currentMapLayer);
    initLocation();
    updateLiveClock();
    updateRecentQuakesUI();
    initChipsSliderInteractions();
    initHistats();
    updateBookmarkIconState();
    renderSavedPlacesUI();
    renderBookmarkedQuakesUI();
    renderRecentSearchesUI();
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

// ==================== SIMULASI GEMPA (SEISMOGRAPH EXPERIMENT) ====================
let isSimulating = false;
let simShakeTimer = null;

function simulateEarthquake(mag) {
    if (!isStarted) {
        initSystem();
    }

    if (isSimulating) {
        clearInterval(simShakeTimer);
    }
    isSimulating = true;

    // Bunyikan sirene darurat jika alarm aktif dan M >= 5.0
    if (isAlarmOn) {
        playEmergencySiren();
        if (mag >= 5.0) {
            speakAlert(`Peringatan getaran gempa magnitudo ${mag.toFixed(1)} terdeteksi`);
        }
    }

    const durationMs = 8000;
    const startTime = Date.now();
    const peakAmp = mag >= 7 ? 6.5 : (mag >= 5 ? 3.8 : 1.8);

    simShakeTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed > durationMs) {
            clearInterval(simShakeTimer);
            isSimulating = false;
            return;
        }

        // Fase 1: P-wave (0-2s) getaran frekuensi tinggi amplitudo sedang
        // Fase 2: S-wave & Surface wave (2-5s) guncangan puncak
        // Fase 3: Decay coda (5-8s) peluruhan
        let currentAmp = 0;
        if (elapsed < 2000) {
            currentAmp = (peakAmp * 0.4) * Math.sin(elapsed * 0.05);
        } else if (elapsed < 5000) {
            const decay = 1 - ((elapsed - 2000) / 3000) * 0.3;
            currentAmp = peakAmp * decay * (Math.sin(elapsed * 0.03) + 0.5 * Math.sin(elapsed * 0.08));
        } else {
            const decay = 1 - ((elapsed - 5000) / 3000);
            currentAmp = (peakAmp * 0.4) * decay * Math.sin(elapsed * 0.02);
        }

        // Micro jitter
        currentAmp += (Math.random() - 0.5) * (peakAmp * 0.2);

        let simVal = baseZ + currentAmp;
        sData.push(simVal);
        if (sData.length > 300) sData.shift();
        historyLog.push({ ts: Date.now(), v: simVal });
        if (historyLog.length > 1000) historyLog.shift();

        if (!isReplaying) {
            draw(sData);
        }
    }, 30);
}

// ==================== SIRENE PERINGATAN & VOICE ALERT ====================
function playEmergencySiren() {
    if (isMuted) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sawtooth';
        // FM sweeping sirene Ina-TEWS 650Hz s/d 1150Hz
        const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.linearRampToValueAtTime(1150, now + 0.5);
        osc.frequency.linearRampToValueAtTime(650, now + 1.0);
        osc.frequency.linearRampToValueAtTime(1150, now + 1.5);
        osc.frequency.linearRampToValueAtTime(650, now + 2.0);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 2.2);
    } catch (e) { }
}

function speakAlert(text) {
    if (isMuted) return;
    try {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'id-ID';
            utterance.rate = 1.05;
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
        }
    } catch (e) { }
}

// ==================== PANDUAN SIAGA MITIGASI MODAL ====================
function openDisasterGuide() {
    const modal = document.getElementById("modalDisasterGuide");
    if (modal) {
        modal.style.display = "flex";
    }
}

function closeDisasterGuide(e) {
    if (e && e.target && e.target !== e.currentTarget) return;
    const modal = document.getElementById("modalDisasterGuide");
    if (modal) modal.style.display = "none";
}

function handleContactClick(number, name, e) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(number);
        }
    } catch (err) { }
    showToastNotification(`📞 Nomor ${name} (${number}) siap dipanggil / disalin ke clipboard!`);
}

function showToastNotification(msg) {
    let toast = document.getElementById("seismoToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "seismoToast";
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background: #202124;
            color: #ffffff;
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 12px;
            font-weight: 700;
            padding: 10px 18px;
            border-radius: 24px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.15);
            z-index: 1000000;
            opacity: 0;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: none;
        `;
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(20px)";
    }, 2800);
}

// Tutup modal panduan & modal info dengan tombol Esc
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeDisasterGuide();
        closeAppInfo();
    }
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


