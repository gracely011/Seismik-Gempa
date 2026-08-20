/**
 * SEISMOGRAPH - GOOGLE MAPS EDITION
 * Main Application Logic (Sensor, Maps, Real-time APIs, UI)
 */

function printConsoleBranding() {
    console.log('%cseismik.gracely.my.id', 'color: black; font-size: 60px; font-weight: bold; font-family: "Montserrat", sans-serif;');
    console.log('%cPantau Gempa & Cuaca Indonesia', 'color: black; font-size: 20px; font-weight: bold; font-family: "Montserrat", sans-serif;');
    console.log('%cpetrus_siahaan@gracely.my.id', 'color: black; font-size: 15px; font-weight: bold; font-family: "Montserrat", sans-serif;');
}
printConsoleBranding();

// Auto-overwrite jika ada yang memanggil console.clear()
try {
    const _origClear = typeof console !== 'undefined' && console.clear ? console.clear.bind(console) : null;
    console.clear = function() {
        if (_origClear) _origClear();
        printConsoleBranding();
    };
} catch (e) {}

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
let userPlaceName = localStorage.getItem('seismo_user_place') || 'Lubuk Tukko, Pandan, Kabupaten Tapanuli Tengah, Sumatera Utara';
let userPlaceObj = null;
try {
    const savedObj = localStorage.getItem('seismo_user_place_obj');
    if (savedObj) userPlaceObj = JSON.parse(savedObj);
} catch (e) { }

// Default GPS pengguna (Lubuk Tukko, Pandan, Tapanuli Tengah jika belum ada GPS terdeteksi)
let userCoords = (savedLat && savedLon) ? [parseFloat(savedLat), parseFloat(savedLon)] : [1.688159, 98.823695];
let hasUserGPS = !!(savedLat && savedLon);

// Wilayah yang sedang dipantau / dilihat di kartu status area (bisa berbeda dari GPS saat cari kota)
let viewedCoords = [...userCoords];
let viewedPlaceObj = userPlaceObj || { main: "Lubuk Tukko", admin: "Kec. Pandan, Kab. Tapanuli Tengah", province: "Sumatera Utara" };

let quakesArray = [];
let currentFilter = 'all';
let searchQuery = '';

// LocalStorage Persistent Settings (Default: Tema Terang Google Maps)
let currentTheme = localStorage.getItem('seismo_theme') || 'light';
let currentMapLayer = localStorage.getItem('seismo_layer') || 'light';
let isFaultsLayerVisible = localStorage.getItem('seismo_faults_visible') === 'true';
let isSatelliteLabelsEnabled = localStorage.getItem('seismo_sat_labels') !== '0'; // Default: Aktif (true)

// Google Symbols Icons for Light / Dark Mode (Unicode PUA)
const SYM_MOON = '<span class="google-symbols" id="themeIcon" style="font-size: 24px;">&#xe51c;</span>';
const SYM_SUN = '<span class="google-symbols" id="themeIcon" style="font-size: 24px;">&#xe518;</span>';

function updateThemeIcon(isLight) {
    const indicator = document.getElementById('themeIconIndicator');
    if (indicator) {
        indicator.innerHTML = isLight ? SYM_SUN : SYM_MOON;
    }
}

// ==================== THEME INITIALIZATION ====================
function initTheme() {
    if (currentTheme === 'dark') {
        document.body.classList.remove('theme-light');
        document.body.classList.add('theme-dark');
        updateThemeIcon(false);
        if (currentMapLayer === 'light') currentMapLayer = 'dark';
    } else {
        document.body.classList.remove('theme-dark');
        document.body.classList.add('theme-light');
        updateThemeIcon(true);
        if (currentMapLayer === 'dark') currentMapLayer = 'light';
    }
}

function toggleThemeMode() {
    if (document.body.classList.contains('theme-light')) {
        document.body.classList.remove('theme-light');
        document.body.classList.add('theme-dark');
        localStorage.setItem('seismo_theme', 'dark');
        currentTheme = 'dark';
        updateThemeIcon(false);
        applyMapLayer('dark');
    } else {
        document.body.classList.remove('theme-dark');
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

// ==================== URL VIEWPORT & LAYER SYNCHRONIZATION (GOOGLE MAPS STYLE) ====================
let isSyncingFromHash = false;
let hashUpdateTimer = null;
const VALID_MAP_LAYERS = ['light', 'sat', 'terrain', 'dark'];

function parseMapUrlHash() {
    try {
        const hash = window.location.hash || '';
        // Mendukung format: #/@lat,lng,zoomz, #/@lat,lng,zoomz/sat, #/@lat,lng,zoomz/sat+faults, #/@lat,lng,zoomz?layer=sat, dsb.
        const match = hash.match(/^#\/?@?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z?(?:[\/?](.+))?$/);
        if (!match) return null;

        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        const zoom = Math.round(parseFloat(match[3]));

        if (isNaN(lat) || isNaN(lng) || isNaN(zoom)) return null;
        if (lat < -90 || lat > 90) return null;
        if (lng < -180 || lng > 180) return null;
        if (zoom < 2 || zoom > 19) return null;

        let layer = null;
        let faults = null;

        const extra = (match[4] || '').toLowerCase();
        if (extra) {
            if (extra.includes('sat')) layer = 'sat';
            else if (extra.includes('terrain') || extra.includes('medan') || extra.includes('topo')) layer = 'terrain';
            else if (extra.includes('dark') || extra.includes('gelap')) layer = 'dark';
            else if (extra.includes('light') || extra.includes('standar') || extra.includes('default')) layer = 'light';

            if (extra.includes('fault') || extra.includes('sesar') || extra.includes('megathrust')) {
                faults = true;
            }
        }

        return { lat, lng, zoom, layer, faults };
    } catch (e) {
        return null;
    }
}

function updateUrlHashFromMap() {
    if (isSyncingFromHash || typeof map === 'undefined' || !map || document.body.classList.contains('print-preview-mode')) return;

    if (hashUpdateTimer) clearTimeout(hashUpdateTimer);
    hashUpdateTimer = setTimeout(() => {
        try {
            if (document.body.classList.contains('print-preview-mode')) return;
            const center = map.getCenter();
            const zoom = Math.round(map.getZoom());
            const latStr = center.lat.toFixed(6);
            const lngStr = center.lng.toFixed(6);

            let suffix = '';
            const layer = currentMapLayer || 'light';
            const isFaults = !!(typeof isFaultsLayerVisible !== 'undefined' && isFaultsLayerVisible);

            if (layer !== 'light' || isFaults) {
                if (layer !== 'light' && isFaults) {
                    suffix = `/${layer}+faults`;
                } else if (layer !== 'light') {
                    suffix = `/${layer}`;
                } else if (isFaults) {
                    suffix = `/+faults`;
                }
            }

            const newHash = `#/@${latStr},${lngStr},${zoom}z${suffix}`;

            if (window.location.hash !== newHash) {
                if (window.history && window.history.replaceState) {
                    try {
                        window.history.replaceState(null, '', newHash);
                    } catch (err) {
                        window.location.replace(newHash);
                    }
                } else {
                    window.location.replace(newHash);
                }
            }
        } catch (e) {
            console.warn('[MapURL] Update hash error:', e);
        }
    }, 120);
}

function initMapUrlSync() {
    if (typeof map === 'undefined' || !map) return;

    map.on('moveend', () => {
        if (document.body.classList.contains('print-preview-mode')) {
            if (typeof updatePrePrintStateFromCurrent === 'function') updatePrePrintStateFromCurrent();
            return;
        }
        updateUrlHashFromMap();
    });

    map.on('zoomend', () => {
        if (document.body.classList.contains('print-preview-mode')) {
            if (typeof updatePrePrintStateFromCurrent === 'function') updatePrePrintStateFromCurrent();
            return;
        }
        updateUrlHashFromMap();
    });

    window.addEventListener('hashchange', () => {
        if (document.body.classList.contains('print-preview-mode')) return;
        const parsed = parseMapUrlHash();
        if (!parsed) return;

        const currentCenter = map.getCenter();
        const currentZoom = Math.round(map.getZoom());

        const isSameLat = Math.abs(currentCenter.lat - parsed.lat) < 0.00001;
        const isSameLng = Math.abs(currentCenter.lng - parsed.lng) < 0.00001;
        const isSameZoom = currentZoom === parsed.zoom;

        isSyncingFromHash = true;

        if (!isSameLat || !isSameLng || !isSameZoom) {
            map.setView([parsed.lat, parsed.lng], parsed.zoom, { animate: true });
        }

        if (parsed.layer && parsed.layer !== currentMapLayer && typeof applyMapLayer === 'function') {
            applyMapLayer(parsed.layer);
        }

        if (parsed.faults !== null && typeof isFaultsLayerVisible !== 'undefined' && parsed.faults !== isFaultsLayerVisible && typeof toggleFaultsLayer === 'function') {
            toggleFaultsLayer();
        }

        setTimeout(() => {
            isSyncingFromHash = false;
        }, 300);
    });

    // Inisialisasi hash pada URL saat pertama kali dimuat
    updateUrlHashFromMap();
}

// ==================== MAP & TILES ====================
const initialHashView = parseMapUrlHash();
if (initialHashView) {
    if (initialHashView.layer && VALID_MAP_LAYERS.includes(initialHashView.layer)) {
        currentMapLayer = initialHashView.layer;
    }
    if (initialHashView.faults !== null) {
        isFaultsLayerVisible = initialHashView.faults;
    }
}
const initialCenter = initialHashView ? [initialHashView.lat, initialHashView.lng] : userCoords;
const initialZoom = initialHashView ? initialHashView.zoom : (hasUserGPS ? 14 : 13);

const map = L.map("map", {
    zoomControl: false,
    zoomAnimation: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
    zoomSnap: 0.1,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 120,
    inertia: true,
    inertiaDeceleration: 3000
}).setView(initialCenter, initialZoom);

// ==================== APP SHELL & MAP PRELOADER OVERLAY ====================
let isMapLoaderHidden = false;

function hideMapLoader() {
    if (isMapLoaderHidden) return;
    isMapLoaderHidden = true;

    const loader = document.getElementById('map-loader');
    if (!loader) return;

    loader.classList.add('fade-out');
    setTimeout(() => {
        if (loader && loader.parentNode) {
            loader.parentNode.removeChild(loader);
        }
    }, 420);
}

// Batas waktu aman (Safety fallback timeout) agar overlay tidak macet jika koneksi internet lambat
setTimeout(hideMapLoader, 2200);

// Konfigurasi Buffer dan Transisi Ubin Peta Ringan & Cepat
const tileCommonOptions = {
    keepBuffer: 4,
    updateWhenIdle: true,
    updateWhenZooming: true
};

const tileLayersCache = {};
let activeTileLayerInstance = null;

function getTileLayer(layerName) {
    if (!tileLayersCache[layerName]) {
        if (layerName === 'sat') {
            tileLayersCache.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                ...tileCommonOptions,
                maxZoom: 18,
                attribution: '&copy; Esri &copy; Earthstar Geographics'
            });
        } else if (layerName === 'terrain') {
            tileLayersCache.terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                ...tileCommonOptions,
                maxZoom: 17,
                attribution: '&copy; OpenTopoMap &copy; OpenStreetMap'
            });
        } else if (layerName === 'dark') {
            tileLayersCache.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                ...tileCommonOptions,
                maxZoom: 19,
                subdomains: 'abcd',
                attribution: '&copy; CartoDB &copy; OpenStreetMap'
            });
        } else {
            tileLayersCache.light = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                ...tileCommonOptions,
                maxZoom: 19,
                subdomains: 'abcd',
                attribution: '&copy; CartoDB &copy; OpenStreetMap'
            });
        }
    }
    return tileLayersCache[layerName];
}

// Lapisan Label Transparan Resmi Esri (Nama Kota, Jalan, Batas Wilayah)
const satelliteLabelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    ...tileCommonOptions,
    maxZoom: 18,
    pane: 'overlayPane',
    attribution: '&copy; Esri &copy; OpenStreetMap'
});

function toggleSatelliteLabels(enabled) {
    if (typeof enabled === 'boolean') {
        isSatelliteLabelsEnabled = enabled;
    } else {
        isSatelliteLabelsEnabled = !isSatelliteLabelsEnabled;
    }

    try {
        localStorage.setItem('seismo_sat_labels', isSatelliteLabelsEnabled ? '1' : '0');
    } catch (e) {}

    updateSatelliteLabelsUI();
    updateSatelliteLabelsLayer();
}

function updateSatelliteLabelsUI() {
    const deskChk = document.getElementById('desktopSatLabelCheckbox');
    const mobChk = document.getElementById('mobSatLabelCheckbox');
    if (deskChk) deskChk.checked = isSatelliteLabelsEnabled;
    if (mobChk) mobChk.checked = isSatelliteLabelsEnabled;

    const deskRow = document.getElementById('layerPopupSuboptions');
    const mobRow = document.getElementById('mobSatLabelRow')?.closest('.mobile-sheet-checkboxes');
    if (deskRow) deskRow.style.display = (currentMapLayer === 'sat') ? 'flex' : 'none';
    if (mobRow) mobRow.style.display = (currentMapLayer === 'sat') ? 'flex' : 'none';
}

function updateSatelliteLabelsLayer() {
    if (typeof map === 'undefined' || !map) return;

    if (currentMapLayer === 'sat' && isSatelliteLabelsEnabled) {
        if (!map.hasLayer(satelliteLabelsLayer)) {
            satelliteLabelsLayer.addTo(map);
        }
    } else {
        if (map.hasLayer(satelliteLabelsLayer)) {
            map.removeLayer(satelliteLabelsLayer);
        }
    }
}

const MAP_LAYERS_ORDER = ['light', 'sat', 'terrain', 'dark'];

function applyMapLayer(layerName) {
    const targetLayer = getTileLayer(layerName);
    if (activeTileLayerInstance && activeTileLayerInstance !== targetLayer && map.hasLayer(activeTileLayerInstance)) {
        map.removeLayer(activeTileLayerInstance);
    }
    if (!map.hasLayer(targetLayer)) {
        targetLayer.addTo(map);
        if (!isMapLoaderHidden) {
            targetLayer.once('load', hideMapLoader);
        }
    }
    activeTileLayerInstance = targetLayer;

    const card = document.getElementById("layerCard");
    const badge = document.getElementById("layerBadgeText");
    if (badge) badge.innerText = "Lapisan";

    // Update active highlight on desktop popup drawer options
    document.querySelectorAll('.layer-option-item').forEach(el => el.classList.remove('active'));
    // Update active highlight on mobile bottom sheet options (kecuali faults)
    document.querySelectorAll('.mobile-sheet-item').forEach(el => {
        if (el.id !== 'mobLayerOptFaults') el.classList.remove('active');
    });

    if (layerName === 'sat') {
        // Thumbnail menampilkan preview lapisan berikutnya (Medan)
        if (card) card.style.backgroundImage = "url('https://a.tile.opentopomap.org/4/8/6.png')";
        const opt = document.getElementById("layerOptSat");
        if (opt) opt.classList.add('active');
        const mobOpt = document.getElementById("mobLayerOptSat");
        if (mobOpt) mobOpt.classList.add('active');
    } else if (layerName === 'terrain') {
        // Thumbnail menampilkan preview lapisan berikutnya (Gelap)
        if (card) card.style.backgroundImage = "url('https://a.basemaps.cartocdn.com/dark_all/4/8/6.png')";
        const opt = document.getElementById("layerOptTerrain");
        if (opt) opt.classList.add('active');
        const mobOpt = document.getElementById("mobLayerOptTerrain");
        if (mobOpt) mobOpt.classList.add('active');
    } else if (layerName === 'dark') {
        // Thumbnail menampilkan preview lapisan berikutnya (Standar)
        if (card) card.style.backgroundImage = "url('https://a.basemaps.cartocdn.com/rastertiles/voyager/4/8/6.png')";
        const opt = document.getElementById("layerOptDark");
        if (opt) opt.classList.add('active');
        const mobOpt = document.getElementById("mobLayerOptDark");
        if (mobOpt) mobOpt.classList.add('active');
    } else {
        // default: light / standar
        // Thumbnail menampilkan preview lapisan berikutnya (Satelit) persis seperti Google Maps
        if (card) card.style.backgroundImage = "url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/8/13')";
        const opt = document.getElementById("layerOptLight");
        if (opt) opt.classList.add('active');
        const mobOpt = document.getElementById("mobLayerOptLight");
        if (mobOpt) mobOpt.classList.add('active');
    }

    currentMapLayer = layerName;
    localStorage.setItem('seismo_layer', layerName);
    updateSatelliteLabelsLayer();
    updateSatelliteLabelsUI();
    setTimeout(() => { map.invalidateSize(); }, 50);
    if (typeof updateUrlHashFromMap === 'function') updateUrlHashFromMap();
}

function openLayerBottomSheet() {
    const backdrop = document.getElementById("mobileLayerBackdrop");
    const sheet = document.getElementById("mobileLayerBottomSheet");
    if (backdrop && sheet) {
        backdrop.classList.add("show");
        sheet.classList.add("show");
    }
}

function closeLayerBottomSheet() {
    const backdrop = document.getElementById("mobileLayerBackdrop");
    const sheet = document.getElementById("mobileLayerBottomSheet");
    if (backdrop && sheet) {
        backdrop.classList.remove("show");
        sheet.classList.remove("show");
    }
}

function handleLayerCardClick(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (window.innerWidth <= 768) {
        openLayerBottomSheet();
    } else {
        cycleNextMapLayer(e);
    }
}

function selectMapLayer(layerName) {
    applyMapLayer(layerName);
    const popup = document.getElementById("layerPopupMenu");
    if (popup) popup.classList.remove('show');
    // NOTE: Tidak menutup bottom sheet otomatis di mobile agar pengguna leluasa melihat peta & memilih detail lain
}

function cycleNextMapLayer(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    const currentIndex = MAP_LAYERS_ORDER.indexOf(currentMapLayer);
    const nextIndex = (currentIndex + 1) % MAP_LAYERS_ORDER.length;
    const nextLayer = MAP_LAYERS_ORDER[nextIndex];
    applyMapLayer(nextLayer);
}

function toggleMapLayer(e) {
    cycleNextMapLayer(e);
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
                <div class="fault-popup-sub"><span class="icon-pin-svg"></span> Wilayah: ${f.region} • ${f.type}</div>
                <div class="fault-popup-desc">${f.desc}</div>
            </div>
        `;
        polyline.bindPopup(popupContent);
        faultLinesLayerGroup.addLayer(polyline);
    });

    const btn = document.getElementById("layerOptFaults");
    const mobBtn = document.getElementById("mobLayerOptFaults");
    if (isFaultsLayerVisible) {
        faultLinesLayerGroup.addTo(map);
        if (btn) btn.classList.add("active");
        if (mobBtn) mobBtn.classList.add("active");
    } else {
        if (btn) btn.classList.remove("active");
        if (mobBtn) mobBtn.classList.remove("active");
    }
}

function toggleFaultsLayer() {
    isFaultsLayerVisible = !isFaultsLayerVisible;
    try {
        localStorage.setItem('seismo_faults_visible', isFaultsLayerVisible ? 'true' : 'false');
    } catch (e) { }

    const btn = document.getElementById("layerOptFaults");
    const mobBtn = document.getElementById("mobLayerOptFaults");
    if (isFaultsLayerVisible) {
        map.addLayer(faultLinesLayerGroup);
        if (btn) btn.classList.add("active");
        if (mobBtn) mobBtn.classList.add("active");
    } else {
        map.removeLayer(faultLinesLayerGroup);
        if (btn) btn.classList.remove("active");
        if (mobBtn) mobBtn.classList.remove("active");
    }
    if (typeof updateUrlHashFromMap === 'function') updateUrlHashFromMap();
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

function createAreaPopupHTML(obj, lat, lon, accuracyText = '') {
    const rawMain = obj?.main || "Wilayah";
    const main = String(rawMain).replace(/^📍\s*/, '').trim();
    const admin = obj?.admin || `Wilayah ${lat.toFixed(2)}`;
    const prov = obj?.province || "Indonesia";
    const adminFull = admin ? `${admin} · ${prov}` : prov;

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
                        <div class="popup-area-city-main"><span class="google-symbols" style="font-size: 14px; color: #ea4335;">&#xe0c8;</span> ${main}</div>
                        <button class="popup-btn-bookmark ${isSaved ? 'active' : ''}" onclick="toggleSavePlaceFromPopup('${safeMain}', '${safeAdmin}', '${safeProv}', ${lat}, ${lon}, event)" title="${isSaved ? 'Hapus dari Disimpan' : 'Simpan Wilayah Ini'}">
                            <span class="google-symbols" style="font-size: 15px;">
                                ${isSaved ? '&#xe866;' : '&#xe867;'}
                            </span>
                        </button>
                    </div>
                    ${accuracyText ? `<div class="popup-area-sub-line" style="font-weight: 500; color: var(--accent-blue);">${accuracyText}</div>` : ''}
                    <div class="popup-area-sub-line">${adminFull}</div>
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
    const accText = `Lokasi Anda (GPS) • ±${Math.round(accuracy)}m`;
    const popupHtml = createAreaPopupHTML(placeObj, lat, lon, accText);

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

// ==================== SIDEBAR & 3-LEVEL MOBILE DRAWER SYSTEM (0%, 30%, 100%) ====================
let isPanelCollapsed = false;
let isMobileDrawerOpen = false;
let currentDrawerSnapState = '30'; // '0' | '30' | '100'
let currentNavTab = 'monitor'; // 'monitor' | 'saved' | 'contribution' | 'recent'

function setDrawerSnapState(state) {
    if (!['0', '30', '100'].includes(state)) state = '30';
    currentDrawerSnapState = state;
    const drawer = document.getElementById("cardsScrollWrap");
    const menuBtn = document.getElementById("railMenuBtn");
    const savedBtn = document.getElementById("railBtnSaved");
    const infoBtn = document.getElementById("railBtnInfo");
    if (!drawer) return;

    // Bersihkan seluruh class state sebelumnya
    drawer.classList.remove('state-0', 'state-10', 'state-30', 'state-60', 'state-100', 'collapsed');
    document.body.classList.remove('drawer-state-0', 'drawer-state-10', 'drawer-state-30', 'drawer-state-60', 'drawer-state-100', 'mobile-drawer-open');

    // Reset inline styles agar transisi CSS class berjalan mulus
    drawer.style.height = '';
    drawer.style.maxHeight = '';
    drawer.style.transform = '';
    drawer.style.opacity = '';
    const gpsControls = document.getElementById("gmapControlsGroup");
    if (gpsControls) gpsControls.style.bottom = '';

    drawer.classList.add(`state-${state}`);
    document.body.classList.add(`drawer-state-${state}`);

    if (state === '100') {
        document.body.classList.add('mobile-drawer-open');
        isMobileDrawerOpen = true;
    } else {
        isMobileDrawerOpen = false;
    }

    if (menuBtn) menuBtn.classList.toggle("active", currentNavTab === 'monitor' && state !== '0');
    if (savedBtn) savedBtn.classList.toggle("active", currentNavTab === 'saved' && state !== '0');
    if (infoBtn) infoBtn.classList.toggle("active", currentNavTab === 'contribution' && state !== '0');
}

// State preferensi Nav Rail Desktop ("Tampilkan sidebar" di Settings Drawer)
let isNavRailEnabled = (localStorage.getItem('gmap_sidebar_enabled') !== '0');

// State preferensi Mode Gempa Seluruh Dunia (USGS Global Real-time)
let isGlobalQuakeMode = (localStorage.getItem('seismo_global_mode') === '1');

// ==================== DESKTOP SETTINGS DRAWER (MENU SAMPING GOOGLE MAPS) ====================
function openDesktopSettings() {
    const wrap = document.getElementById("gmapSettingsWrapper");
    const sw = document.getElementById("settingsSidebarSwitch");
    const gSw = document.getElementById("settingsGlobalQuakeSwitch");
    if (wrap) wrap.classList.add("open");
    if (sw) sw.setAttribute("aria-checked", isNavRailEnabled ? "true" : "false");
    if (gSw) gSw.setAttribute("aria-checked", isGlobalQuakeMode ? "true" : "false");
}

function closeDesktopSettings() {
    const wrap = document.getElementById("gmapSettingsWrapper");
    if (wrap) wrap.classList.remove("open");
}

function toggleDesktopSettings() {
    const wrap = document.getElementById("gmapSettingsWrapper");
    if (wrap) {
        if (wrap.classList.contains("open")) {
            closeDesktopSettings();
        } else {
            openDesktopSettings();
        }
    }
}

function toggleSidebarFromSettings() {
    if (window.innerWidth <= 768) return;
    isNavRailEnabled = !isNavRailEnabled;
    const sw = document.getElementById("settingsSidebarSwitch");
    if (sw) sw.setAttribute("aria-checked", isNavRailEnabled ? "true" : "false");
    document.body.classList.toggle("nav-rail-disabled", !isNavRailEnabled);
    try { localStorage.setItem("gmap_sidebar_enabled", isNavRailEnabled ? "1" : "0"); } catch(e){}

    const panel = document.getElementById("mainPanel") || document.getElementById("panelContainer");
    if (!isNavRailEnabled) {
        // Saat nav rail dimatikan, mulai dari kondisi floating search bar mandiri (collapsed)
        isPanelCollapsed = true;
        document.body.classList.add("panel-collapsed");
        if (panel) panel.classList.add("collapsed");
    } else {
        // Saat nav rail dihidupkan kembali, buka panel samping normal
        isPanelCollapsed = false;
        document.body.classList.remove("panel-collapsed");
        if (panel) panel.classList.remove("collapsed");
    }
    updateDesktopNavRailActiveState();
    
    // Invalidate map size
    if (typeof map !== 'undefined' && map) {
        setTimeout(() => map.invalidateSize(), 300);
    }
}

function toggleGlobalEarthquakeMode() {
    isGlobalQuakeMode = !isGlobalQuakeMode;
    const gSw = document.getElementById("settingsGlobalQuakeSwitch");
    if (gSw) gSw.setAttribute("aria-checked", isGlobalQuakeMode ? "true" : "false");
    try { localStorage.setItem("seismo_global_mode", isGlobalQuakeMode ? "1" : "0"); } catch(e){}

    if (typeof showNotification === 'function') {
        showNotification(isGlobalQuakeMode 
            ? "Peta Gempa Seluruh Dunia Aktif (USGS Global & BMKG)" 
            : "Mode Gempa Wilayah Indonesia Aktif (BMKG & USGS)");
    }

    // Refresh realtime earthquakes with new scope
    if (typeof loadMapData === 'function') {
        loadMapData(false);
    }
}

function handleSettingsNav(tabName) {
    closeDesktopSettings();
    switchNavTab(tabName);
}

function updatePrePrintStateFromCurrent() {
    if (!map) return;
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    prePrintMapState = {
        bounds: map.getBounds(),
        center: currentCenter,
        zoom: currentZoom,
        layer: currentMapLayer,
        faults: isFaultsLayerVisible,
        aspectRatio: prePrintMapState ? prePrintMapState.aspectRatio : (window.innerWidth / window.innerHeight)
    };

    const footerLeftEl = document.getElementById("printFooterLeft");
    if (footerLeftEl) {
        const latestQuake = Array.isArray(quakesArray) && quakesArray.length > 0 ? quakesArray[0] : null;
        if (latestQuake) {
            const magVal = (latestQuake.mag || 0).toFixed(1);
            const locVal = latestQuake.place || 'Wilayah Indonesia';
            footerLeftEl.textContent = `⚡ Mutakhir: M ${magVal} · ${locVal} (${latestQuake.time || '-'})`;
        } else {
            const activeAreaName = (viewedPlaceObj && viewedPlaceObj.main) ? `${viewedPlaceObj.main}, ${viewedPlaceObj.admin || ''}` : (userPlaceName || 'Indonesia');
            footerLeftEl.textContent = `📍 Area: ${activeAreaName} (${currentCenter.lat.toFixed(3)}, ${currentCenter.lng.toFixed(3)})`;
        }
    }
}

function panPrintMap(direction) {
    if (!map) return;
    const offset = 140;
    if (direction === 'up') map.panBy([0, -offset], { animate: true });
    else if (direction === 'down') map.panBy([0, offset], { animate: true });
    else if (direction === 'left') map.panBy([-offset, 0], { animate: true });
    else if (direction === 'right') map.panBy([offset, 0], { animate: true });
    else if (direction === 'reset') {
        const center = (userMarker && userMarker.getLatLng()) ? userMarker.getLatLng() : [ -0.7893, 113.9213 ];
        map.setView(center, 7, { animate: true });
    }
    setTimeout(updatePrePrintStateFromCurrent, 300);
}

function zoomInPrintMap() {
    if (!map) return;
    map.zoomIn();
    setTimeout(updatePrePrintStateFromCurrent, 300);
}

function zoomOutPrintMap() {
    if (!map) return;
    map.zoomOut();
    setTimeout(updatePrePrintStateFromCurrent, 300);
}

function printMapPage() {
    closeDesktopSettings();
    if (typeof closeLanguageModal === 'function') closeLanguageModal();
    if (typeof closeShareModal === 'function') closeShareModal();
    if (typeof closeLayerBottomSheet === 'function') closeLayerBottomSheet();

    // Hitung aspek rasio riil layar monitor / kontainer peta aktif saat ini secara dinamis
    const activeMapEl = document.getElementById("map");
    const curWidth = (activeMapEl && activeMapEl.clientWidth > 0) ? activeMapEl.clientWidth : window.innerWidth;
    const curHeight = (activeMapEl && activeMapEl.clientHeight > 0) ? activeMapEl.clientHeight : window.innerHeight;
    const dynamicRatio = (curWidth && curHeight && curHeight > 0) ? (curWidth / curHeight) : (16 / 9);

    // Terapkan ke CSS variable dinamis
    document.documentElement.style.setProperty('--print-map-aspect-ratio', `${dynamicRatio.toFixed(4)}`);

    // 1. Rekam koordinat pusat, zoom, dan lapisan aktif yang sedang dilihat di layar
    if (map) {
        prePrintMapState = {
            bounds: map.getBounds(),
            center: map.getCenter(),
            zoom: map.getZoom(),
            layer: currentMapLayer,
            faults: isFaultsLayerVisible,
            aspectRatio: dynamicRatio
        };
    }

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const printTimeStr = `${day}/${month}/${year}, ${hours}.${mins}`;

    const timeEl = document.getElementById("printBrowserTime");
    if (timeEl) timeEl.textContent = printTimeStr;

    const totalQuakes = Array.isArray(quakesArray) ? quakesArray.length : 0;
    const latestQuake = Array.isArray(quakesArray) && quakesArray.length > 0 ? quakesArray[0] : null;

    const syncEl = document.getElementById("printSyncSummary");
    if (syncEl) {
        syncEl.textContent = `${totalQuakes} Gempa Tersinkronisasi (BMKG & USGS)`;
    }

    const footerLeftEl = document.getElementById("printFooterLeft");
    if (footerLeftEl) {
        if (latestQuake) {
            const magVal = (latestQuake.mag || 0).toFixed(1);
            const locVal = latestQuake.place || 'Wilayah Indonesia';
            footerLeftEl.textContent = `⚡ Mutakhir: M ${magVal} · ${locVal} (${latestQuake.time || '-'})`;
        } else {
            const currentCenter = prePrintMapState ? prePrintMapState.center : map.getCenter();
            const activeAreaName = (viewedPlaceObj && viewedPlaceObj.main) ? `${viewedPlaceObj.main}, ${viewedPlaceObj.admin || ''}` : (userPlaceName || 'Indonesia');
            footerLeftEl.textContent = `📍 Area: ${activeAreaName} (${currentCenter.lat.toFixed(3)}, ${currentCenter.lng.toFixed(3)})`;
        }
    }

    const notesInput = document.getElementById("printUserNotesInput");
    if (notesInput) notesInput.value = '';
    const notesPrintedText = document.getElementById("printNotesPrintedText");
    if (notesPrintedText) notesPrintedText.textContent = '';

    // 2. Beralih ke Halaman Pratinjau Cetak Interaktif Google Maps
    document.body.classList.add('print-preview-mode');

    // 3. Kunci seluruh interaksi mouse manual (agar pergeseran peta hanya dikontrol via tombol navigasi cetak)
    if (map) {
        if (map.dragging) map.dragging.disable();
        if (map.touchZoom) map.touchZoom.disable();
        if (map.doubleClickZoom) map.doubleClickZoom.disable();
        if (map.scrollWheelZoom) map.scrollWheelZoom.disable();
        if (map.boxZoom) map.boxZoom.disable();
        if (map.keyboard) map.keyboard.disable();
    }

    // 4. Sesuaikan ukuran kanvas & pertahankan titik pusat & zoom persis seperti yang dilihat pengguna
    setTimeout(() => {
        if (map && prePrintMapState) {
            map.invalidateSize({ animate: false });
            map.setView(prePrintMapState.center, prePrintMapState.zoom, { animate: false });
        }
        if (notesInput) notesInput.focus();
    }, 80);
}

function closePrintPreview() {
    document.body.classList.remove('print-preview-mode');

    // Aktifkan kembali seluruh interaksi peta normal
    if (map) {
        if (map.dragging) map.dragging.enable();
        if (map.touchZoom) map.touchZoom.enable();
        if (map.doubleClickZoom) map.doubleClickZoom.enable();
        if (map.scrollWheelZoom) map.scrollWheelZoom.enable();
        if (map.boxZoom) map.boxZoom.enable();
        if (map.keyboard) map.keyboard.enable();
    }

    setTimeout(() => {
        if (map && prePrintMapState) {
            map.invalidateSize({ animate: false });
            map.setView(prePrintMapState.center, prePrintMapState.zoom, { animate: false });
            prePrintMapState = null;
        }
    }, 80);
}

function executeBrowserPrint() {
    const notesInput = document.getElementById("printUserNotesInput");
    const notesPrintedText = document.getElementById("printNotesPrintedText");
    if (notesInput && notesPrintedText) {
        const text = notesInput.value.trim();
        notesPrintedText.textContent = text ? `Catatan: ${text}` : '';
    }

    window.print();
}

// Keyboard shortcut: Enter untuk Cetak, Escape untuk Batal di Mode Pratinjau
document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('print-preview-mode')) return;
    if (e.key === 'Escape') {
        closePrintPreview();
    } else if (e.key === 'Enter' && e.target && e.target.id === 'printUserNotesInput') {
        e.preventDefault();
        executeBrowserPrint();
    }
});

// Lifecycle Listener browser print
window.addEventListener('beforeprint', () => {
    const notesInput = document.getElementById("printUserNotesInput");
    const notesPrintedText = document.getElementById("printNotesPrintedText");
    if (notesInput && notesPrintedText && !notesPrintedText.textContent) {
        const text = notesInput.value.trim();
        notesPrintedText.textContent = text ? `Catatan: ${text}` : '';
    }
});





function handleMenuBtnClick() {
    if (window.innerWidth > 768) {
        openDesktopSettings();
    } else {
        switchNavTab('monitor');
    }
}

function updateDesktopNavRailActiveState() {
    const menuBtn = document.getElementById("railMenuBtn");
    const savedBtn = document.getElementById("railBtnSaved");
    const infoBtn = document.getElementById("railBtnInfo");
    const recentBtn = document.getElementById("railBtnRecent");
    const guideBtn = document.getElementById("railBtnGuide");

    if (isPanelCollapsed) {
        // Jika sidebar ditutup, bersihkan status aktif dari SEMUA tombol nav rail desktop
        if (menuBtn) menuBtn.classList.remove("active");
        if (savedBtn) savedBtn.classList.remove("active");
        if (infoBtn) infoBtn.classList.remove("active");
        if (recentBtn) recentBtn.classList.remove("active");
        if (guideBtn) guideBtn.classList.remove("active");
    } else {
        // Jika sidebar terbuka, aktifkan tombol sesuai tab aktif
        if (menuBtn) menuBtn.classList.toggle("active", currentNavTab === 'monitor');
        if (savedBtn) savedBtn.classList.toggle("active", currentNavTab === 'saved');
        if (infoBtn) infoBtn.classList.toggle("active", currentNavTab === 'contribution');
        if (recentBtn) recentBtn.classList.toggle("active", currentNavTab === 'recent');
        if (guideBtn) guideBtn.classList.toggle("active", currentNavTab === 'guide');
    }
}

function toggleSidebar(forceOpen = null) {
    if (window.innerWidth <= 768) {
        toggleMobileDrawer();
        return;
    }
    const panel = document.getElementById("mainPanel") || document.getElementById("panelContainer");

    if (forceOpen !== null) {
        isPanelCollapsed = !forceOpen;
    } else {
        isPanelCollapsed = !isPanelCollapsed;
    }

    if (panel) panel.classList.toggle("collapsed", isPanelCollapsed);
    document.body.classList.toggle("panel-collapsed", isPanelCollapsed);

    updateDesktopNavRailActiveState();

    setTimeout(() => {
        if (map) map.invalidateSize();
        if (typeof resizeCanvas === 'function') resizeCanvas();
    }, 360);
}

function switchNavTab(tabName) {
    if (window.innerWidth > 768) {
        // Desktop: Jika sidebar tertutup, klik tab apapun SELALU membuka sidebar ke tab tersebut
        if (isPanelCollapsed) {
            currentNavTab = tabName;
            toggleSidebar(true);
        } else if (tabName === currentNavTab) {
            // Jika klik tab yang sama saat sidebar terbuka, tutup sidebar
            toggleSidebar(false);
            return;
        } else {
            currentNavTab = tabName;
        }
    } else {
        // Mobile behavior
        if (tabName === currentNavTab) {
            if (tabName === 'saved' || tabName === 'contribution' || tabName === 'guide') {
                if (currentDrawerSnapState === '100') {
                    setDrawerSnapState('0');
                } else {
                    setDrawerSnapState('100');
                }
            } else if (tabName === 'monitor') {
                if (currentDrawerSnapState === '0') {
                    setDrawerSnapState('30');
                } else if (currentDrawerSnapState === '30') {
                    setDrawerSnapState('100');
                } else {
                    setDrawerSnapState('30');
                }
            }
            return;
        }
        currentNavTab = tabName;
    }

    // Inisialisasi on-demand tab panduan siaga jika dipilih
    if (tabName === 'guide' && typeof ensureGuideTabDOM === 'function') {
        ensureGuideTabDOM();
    }

    // Tampilkan panel tab yang sesuai
    const tabMonitor = document.getElementById("viewMonitor");
    const tabSaved = document.getElementById("viewSaved");
    const tabContrib = document.getElementById("viewContribution");
    const tabRecent = document.getElementById("viewRecent");
    const tabGuide = document.getElementById("viewGuide");

    if (tabMonitor) tabMonitor.style.display = tabName === 'monitor' ? 'block' : 'none';
    if (tabSaved) tabSaved.style.display = tabName === 'saved' ? 'block' : 'none';
    if (tabContrib) tabContrib.style.display = tabName === 'contribution' ? 'block' : 'none';
    if (tabRecent) tabRecent.style.display = tabName === 'recent' ? 'block' : 'none';
    if (tabGuide) tabGuide.style.display = tabName === 'guide' ? 'block' : 'none';

    // Refresh konten tab
    if (tabName === 'saved') {
        renderSavedPlacesUI();
        renderBookmarkedQuakesUI();
    } else if (tabName === 'recent') {
        renderRecentSearchesUI();
        render24hTimelineUI();
    }

    if (window.innerWidth <= 768) {
        // Perbarui status aktif pada tombol navigasi bawah mobile
        const mobMonitor = document.getElementById("mobileNavBtnMonitor");
        const mobSaved = document.getElementById("mobileNavBtnSaved");
        const mobInfo = document.getElementById("mobileNavBtnInfo");

        if (mobMonitor) mobMonitor.classList.toggle("active", tabName === 'monitor');
        if (mobSaved) mobSaved.classList.toggle("active", tabName === 'saved');
        if (mobInfo) mobInfo.classList.toggle("active", tabName === 'contribution');

        if (tabName === 'saved' || tabName === 'contribution' || tabName === 'guide') {
            setDrawerSnapState('100');
        } else if (tabName === 'monitor') {
            setDrawerSnapState('30');
        }
    } else {
        updateDesktopNavRailActiveState();
    }
}

function ratePlace(stars) {
    showNotification(`Terima kasih! Anda memberikan penilaian ${stars} bintang.`);
}

function skipRating(btn) {
    const card = btn.closest('.rating-prompt-card');
    if (card) {
        card.style.transition = 'opacity 0.25s';
        card.style.opacity = '0';
        setTimeout(() => card.remove(), 250);
    }
}

function answerContrib(btn, answer) {
    const card = btn.closest('.rating-prompt-card');
    showNotification(`Jawaban Anda (${answer}) telah terkirim!`);
    if (card) {
        card.style.transition = 'opacity 0.25s';
        card.style.opacity = '0';
        setTimeout(() => card.remove(), 250);
    }
}

function panToSavedShortcut(type) {
    if (type === 'home') {
        map.flyTo([1.103, 104.038], 13);
        showNotification('Terbang ke lokasi Rumah (Batam)');
    } else {
        showNotification('Fitur penetapan alamat kantor segera hadir!');
    }
}

function toggleMobileDrawer(forceOpen) {
    if (forceOpen === true) {
        setDrawerSnapState('100');
    } else if (forceOpen === false) {
        setDrawerSnapState('0');
    } else {
        if (currentDrawerSnapState === '0') {
            setDrawerSnapState('30');
        } else if (currentDrawerSnapState === '30') {
            setDrawerSnapState('100');
        } else {
            setDrawerSnapState('30');
        }
    }
}

function openMobileDrawer() {
    setDrawerSnapState('100');
}

// Inisialisasi Gesture Sentuh (Touch Drag & Snapping 3 Level: 0%, 30%, 100%)
function initMobileDrawerGestures() {
    const drawer = document.getElementById("cardsScrollWrap");
    const handleBar = document.querySelector(".bottom-sheet-handle-bar");
    if (!drawer || !handleBar) return;

    let startY = 0;
    let startHeight = 0;
    let isDragging = false;

    function onTouchStart(e) {
        if (window.innerWidth > 768) return;
        // Hanya seret jika menyentuh handle bar atau jika scroll drawer ada di paling atas (top: 0)
        if (!handleBar.contains(e.target) && drawer.scrollTop > 5) return;

        startY = e.touches[0].clientY;
        startHeight = drawer.getBoundingClientRect().height;
        isDragging = true;
        drawer.style.transition = 'none';
    }

    function onTouchMove(e) {
        if (!isDragging) return;
        const currentY = e.touches[0].clientY;
        const deltaY = startY - currentY; // Positif = geser naik, Negatif = geser turun

        // Jika drawer di-scroll ke bawah saat konten ada di tengah, biarkan scroll biasa
        if (drawer.scrollTop > 0 && deltaY < 0 && !handleBar.contains(e.target)) {
            isDragging = false;
            drawer.style.transition = '';
            return;
        }

        let newHeight = startHeight + deltaY;
        const minHeight = 0; // Level 0% (Hidden)
        const maxHeight = window.innerHeight - 70; // Level 100% (Setinggi search bar dengan jarak top 10px)

        if (newHeight < minHeight) newHeight = minHeight;
        if (newHeight > maxHeight) newHeight = maxHeight;

        drawer.style.height = `${newHeight}px`;
        drawer.style.maxHeight = `${newHeight}px`;
        drawer.style.opacity = newHeight < 20 ? '0' : '1';
        drawer.style.transform = 'translateY(0)';

        const gpsControls = document.getElementById("gmapControlsGroup");
        if (gpsControls) {
            gpsControls.style.transition = 'none';
            gpsControls.style.bottom = `${newHeight + 70}px`;
        }

        if (e.cancelable && handleBar.contains(e.target)) {
            e.preventDefault();
        }
    }

    function onTouchEnd() {
        if (!isDragging) return;
        isDragging = false;
        drawer.style.transition = '';
        const gpsControls = document.getElementById("gmapControlsGroup");
        if (gpsControls) gpsControls.style.transition = '';

        const finalHeight = drawer.getBoundingClientRect().height;
        const screenH = window.innerHeight;
        const ratio = finalHeight / screenH;

        // Snapping cerdas 3 level (0%, 30%, 100%)
        if (ratio < 0.14) {
            setDrawerSnapState('0');
        } else if (ratio < 0.48) {
            setDrawerSnapState('30');
        } else {
            setDrawerSnapState('100');
        }

        setTimeout(() => {
            drawer.style.height = '';
            drawer.style.maxHeight = '';
            drawer.style.opacity = '';
            drawer.style.transform = '';
            if (gpsControls) gpsControls.style.bottom = '';
        }, 360);
    }

    handleBar.addEventListener('touchstart', onTouchStart, { passive: true });
    drawer.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
}

// Inisialisasi awal saat script dimuat
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initMobileDrawerGestures();
        if (window.innerWidth <= 768) setDrawerSnapState('30');
    });
} else {
    initMobileDrawerGestures();
    if (window.innerWidth <= 768) setDrawerSnapState('30');
}

// Tutup / perkecil otomatis saat peta digeser di mobile jika sedang fullscreen
map.on('movestart', () => {
    if (window.innerWidth <= 768 && currentDrawerSnapState === '100') {
        setDrawerSnapState('30');
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

    // 4. USGS Real-time API (Mode Global Seluruh Dunia vs Wilayah Indonesia)
    try {
        if (isGlobalQuakeMode) {
            // Mode Seluruh Dunia: Ambil Feed Global Real-time USGS (M 2.5+ 24 jam & M 4.5+ 7 hari)
            const [resGlobalDay, resGlobalWeek] = await Promise.allSettled([
                fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"),
                fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson")
            ]);

            const globalFeatures = [];
            if (resGlobalDay.status === 'fulfilled' && resGlobalDay.value.ok) {
                const dataDay = await resGlobalDay.value.json();
                if (dataDay.features) globalFeatures.push(...dataDay.features);
            }
            if (resGlobalWeek.status === 'fulfilled' && resGlobalWeek.value.ok) {
                const dataWeek = await resGlobalWeek.value.json();
                if (dataWeek.features) globalFeatures.push(...dataWeek.features);
            }

            globalFeatures.forEach(f => {
                if (!f.geometry || !f.geometry.coordinates) return;
                let [lon, lat, depth] = f.geometry.coordinates;
                let timeStr = new Date(f.properties.time).toLocaleString('id-ID');
                let mag = parseFloat(f.properties.mag) || 0;
                let place = f.properties.place || "Global Region";
                rawQuakes.push({
                    lat, lon, mag,
                    time: timeStr,
                    iso: new Date(f.properties.time).toISOString(),
                    place: place,
                    depth: `${Math.round(depth || 10)} km`,
                    src: "USGS Global",
                    priority: 5
                });
            });
        } else {
            // Mode Wilayah Indonesia (Default): Rentang 30 Hari Terakhir Khusus Teritori Indonesia
            const now = new Date();
            const pastDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            const startTimeStr = pastDate.toISOString().split('T')[0];
            const usgsUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${startTimeStr}&minmagnitude=1.0&minlatitude=-11&maxlatitude=6&minlongitude=95&maxlongitude=141`;

            const resUSGS = await fetch(usgsUrl);
            if (resUSGS.ok) {
                const dataUSGS = await resUSGS.json();
                if (dataUSGS.features && dataUSGS.features.length > 0) {
                    dataUSGS.features.forEach(f => {
                        if (!f.geometry || !f.geometry.coordinates) return;
                        let [lon, lat, depth] = f.geometry.coordinates;
                        let timeStr = new Date(f.properties.time).toLocaleString('id-ID');
                        let mag = parseFloat(f.properties.mag) || 0;
                        let place = f.properties.place || "";

                        // Filter ketat: Jangan masukkan gempa negara tetangga (Filipina, Malaysia, PNG, dll) saat mode Indonesia
                        const pLow = place.toLowerCase();
                        const isForeign = [
                            "philippines", "mindanao", "sarangani", "davao", "cotabato", "zamboanga", "manila", "visayas", "luzon", "generalsantos",
                            "malaysia", "sabah", "sarawak", "kuala lumpur", "penang", "johor",
                            "papua new guinea", "new britain", "bougainville", "port moresby",
                            "timor-leste", "east timor", "dili",
                            "brunei", "singapore", "australia", "thailand", "vietnam"
                        ].some(country => pLow.includes(country));

                        if (isForeign) return;

                        // Pengecekan batas utara: Mindanao/Sarangani berada di lat > 4.5 dan lon 120-128
                        if (lat > 4.5 && lon >= 120 && lon <= 128 && !pLow.includes("indonesia") && !pLow.includes("talaud") && !pLow.includes("sangihe")) {
                            return;
                        }

                        rawQuakes.push({
                            lat, lon, mag,
                            time: timeStr,
                            iso: new Date(f.properties.time).toISOString(),
                            place: place || "Wilayah Indonesia",
                            depth: `${Math.round(depth || 10)} km`,
                            src: "USGS",
                            priority: 5
                        });
                    });
                }
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

    // Bersihkan marker lama dan render ulang marker di Leaflet
    if (typeof markerGroup !== 'undefined' && markerGroup) {
        markerGroup.clearLayers();
    }

    quakesArray = uniqueQuakes;
    checkForNewEarthquakeEvent(uniqueQuakes);

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
                <span class="google-symbols" style="font-size: 13px;">&#xe8b5;</span>
                <span>${time}</span>
            </div>
            <div class="quake-popup-place"><span class="google-symbols" style="font-size: 14px; color: #ea4335;">&#xe0c8;</span> ${place}</div>
            <div class="quake-popup-meta-row">Kedalaman: <b>${depth || '-'}</b></div>
            ${dirasakan && dirasakan !== '-' ? `<div class="quake-popup-alert-felt">⚠️ Dirasakan: <b>${dirasakan}</b></div>` : ''}
            ${potensi ? `<div class="quake-popup-alert-potensi">🛡️ ${potensi}</div>` : ''}
            ${dist !== null ? `<div class="quake-popup-dist">📏 Jarak: ${dist} km dari lokasi Anda</div>` : ''}
            <div class="quake-popup-coord">Koordinat: ${lat.toFixed(2)}, ${lon.toFixed(2)}</div>
            <div class="quake-popup-divider">
                <div class="quake-popup-share-label">
                    <span class="google-symbols" style="font-size: 13px;">&#xe80d;</span>
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
                        <span class="google-symbols" style="font-size: 16px;">&#xe80d;</span>
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
                <span class="google-symbols" style="font-size: 18px; color: var(--text-muted);">&#xe0c8;</span>
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
                        <span class="google-symbols" style="font-size: 15px;">&#xe80d;</span>
                    </button>
                    <button class="btn-item-delete" style="color:${isBookmarked ? 'var(--accent-blue)' : 'var(--text-muted)'};" onclick="toggleBookmarkQuake({lat:${q.lat}, lon:${q.lon}, mag:${q.mag}, place:'${safePlace}', time:'${q.time}', depth:'${q.depth || '-'}'}, event)" title="${isBookmarked ? 'Hapus Bookmark' : 'Tandai Gempa'}">
                        <span class="google-symbols" style="font-size: 16px;">
                            ${isBookmarked ? '&#xe866;' : '&#xe867;'}
                        </span>
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
        if (btnIcon) btnIcon.innerHTML = '&#xe867;';
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
        if (btnIcon) btnIcon.innerHTML = '&#xe866;';
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
        btnIcon.innerHTML = isSaved ? '&#xe866;' : '&#xe867;';
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
                    <div class="saved-place-name"><span class="icon-pin-svg"></span> ${p.name}</div>
                    <div class="saved-place-sub">
                        <span class="saved-place-status-dot ${isWarning ? 'warning' : ''}"></span>
                        <span>${statusLabel}</span>
                    </div>
                </div>
                <div class="saved-place-right">
                    <div class="saved-place-weather">${p.temp || '28°C'}</div>
                    <button class="btn-item-delete" onclick="removeSavedPlace('${p.id}', event)" title="Hapus dari Disimpan">
                        <span class="google-symbols" style="font-size: 15px;">&#xe872;</span>
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
                        <span class="google-symbols" style="font-size: 15px;">&#xe80d;</span>
                    </button>
                    <button class="btn-item-delete" style="color:var(--accent-red);" onclick="toggleBookmarkQuake({lat:${q.lat}, lon:${q.lon}, time:'${q.time}'}, event)" title="Hapus Bookmark">
                        <span class="google-symbols" style="font-size: 15px;">&#xe872;</span>
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
                    <span class="google-symbols" style="font-size: 15px; color:var(--text-muted);">&#xe8b5;</span>
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
                        <span class="google-symbols" style="font-size: 15px;">&#xe80d;</span>
                    </button>
                    <button class="btn-item-delete" style="color:${isBookmarked ? 'var(--accent-blue)' : 'var(--text-muted)'};" onclick="toggleBookmarkQuake({lat:${q.lat}, lon:${q.lon}, mag:${q.mag}, place:'${safePlace}', time:'${q.time}', depth:'${q.depth || '-'}'}, event)" title="${isBookmarked ? 'Hapus Bookmark' : 'Tandai Gempa'}">
                        <span class="google-symbols" style="font-size: 16px;">
                            ${isBookmarked ? '&#xe866;' : '&#xe867;'}
                        </span>
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
        text.innerHTML = `<b style="color:var(--accent-red)">Waspada:</b> Gempa M ${closeQuake.mag} &middot; Jarak ${dist} km dari wilayah ini!`;
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
function formatIndonesianPlace(addrObj, lat, lon) {
    if (!addrObj || typeof addrObj !== 'object') {
        return {
            main: `Area (${lat.toFixed(2)})`,
            admin: `Wilayah ${lat.toFixed(2)}, ${lon.toFixed(2)}`,
            province: "Indonesia"
        };
    }

    // 1. Ekstraksi Tingkat 1: Desa / Kelurahan / Suburb / Lingkungan / Kampung / Dusun
    let village = addrObj.village || addrObj.suburb || addrObj.neighbourhood || addrObj.hamlet || addrObj.quarter || addrObj.residential || addrObj.locality || "";
    
    // 2. Ekstraksi Tingkat 2: Kecamatan / Sub-district (city_district di Indonesia adalah Kecamatan)
    let district = addrObj.district || addrObj.city_district || addrObj.county_subdivision || addrObj.municipality || addrObj.subdistrict || "";
    
    // 3. Ekstraksi Tingkat 3: Kabupaten / Kota / Regency
    let city = addrObj.county || addrObj.city || addrObj.town || addrObj.regency || addrObj.state_district || "";
    
    // 4. Ekstraksi Tingkat 4: Provinsi / State
    let rawProv = addrObj.state || addrObj.province || addrObj.region || addrObj.principalSubdivision || "";

    // Bersihkan nama desa / kelurahan dari awalan administratif
    village = village.replace(/^(Kelurahan|Desa|Gampong|Nagari|Dusun|Pekan)\s+/i, '').trim();

    // Format nama Kecamatan
    let cleanDistrict = district.replace(/^(Kecamatan|Kec\.)\s+/i, '').trim();

    // Format nama Kota / Kabupaten
    let cleanCity = city.trim();
    if (cleanCity) {
        if (/^(Kabupaten|Kab\.)\s+/i.test(cleanCity)) {
            cleanCity = "Kab. " + cleanCity.replace(/^(Kabupaten|Kab\.)\s+/i, '').trim();
        } else if (/^(Kota)\s+/i.test(cleanCity)) {
            cleanCity = "Kota " + cleanCity.replace(/^(Kota)\s+/i, '').trim();
        } else if (cleanCity.endsWith(" Regency")) {
            cleanCity = "Kab. " + cleanCity.replace(/\s+Regency$/i, '').trim();
        } else if (cleanCity.endsWith(" City")) {
            cleanCity = "Kota " + cleanCity.replace(/\s+City$/i, '').trim();
        } else if (!/^(DKI|Daerah|Kab|Kota)/i.test(cleanCity)) {
            cleanCity = "Kota " + cleanCity;
        }
    }

    // Normalisasi Nama Provinsi Resmi Indonesia
    let province = "";
    if (rawProv) {
        let provLower = rawProv.toLowerCase();
        if (provLower.includes("riau islands") || provLower.includes("kepulauan riau") || provLower === "riau kepulauan") {
            province = "Kepulauan Riau";
        } else if (provLower === "sumatra" || provLower === "sumatera") {
            if (lat > 1.5) province = "Sumatera Utara";
            else if (lat > -0.5) province = "Riau";
            else if (lat > -2.5) province = "Sumatera Barat";
            else province = "Sumatera Selatan";
        } else if (provLower.includes("north sumatra") || provLower.includes("sumatera utara")) {
            province = "Sumatera Utara";
        } else if (provLower.includes("west sumatra") || provLower.includes("sumatera barat")) {
            province = "Sumatera Barat";
        } else if (provLower.includes("south sumatra") || provLower.includes("sumatera selatan")) {
            province = "Sumatera Selatan";
        } else if (provLower.includes("jakarta")) {
            province = "DKI Jakarta";
        } else if (provLower.includes("west java") || provLower.includes("jawa barat")) {
            province = "Jawa Barat";
        } else if (provLower.includes("central java") || provLower.includes("jawa tengah")) {
            province = "Jawa Tengah";
        } else if (provLower.includes("east java") || provLower.includes("jawa timur")) {
            province = "Jawa Timur";
        } else if (provLower.includes("yogyakarta") || provLower.includes("jogja")) {
            province = "D.I. Yogyakarta";
        } else if (provLower.includes("bali")) {
            province = "Bali";
        } else if (provLower.includes("aceh")) {
            province = "Aceh";
        } else if (provLower.includes("lampung")) {
            province = "Lampung";
        } else if (provLower.includes("banten")) {
            province = "Banten";
        } else if (provLower.includes("jambi")) {
            province = "Jambi";
        } else if (provLower.includes("bengkulu")) {
            province = "Bengkulu";
        } else if (provLower.includes("bangka") || provLower.includes("belitung")) {
            province = "Kep. Bangka Belitung";
        } else {
            province = rawProv;
        }
    }

    // Validasi pencegahan anomali provinsi pulau Jawa vs luar Jawa
    if (lat > -5.0 && (province.toLowerCase().includes("jawa") || province.toLowerCase().includes("jakarta"))) {
        if (lat >= -1.0 && lat <= 2.0 && lon >= 100.0 && lon <= 106.0) {
            province = (lon >= 103.4) ? "Kepulauan Riau" : "Riau";
        } else if (lat > 1.0 && lon <= 100.0) {
            province = "Sumatera Utara";
        } else {
            province = "Indonesia";
        }
    }

    // Susun Judul Utama (Nama Kelurahan / Desa jika ada, atau Kecamatan, atau Kota)
    let main = village || cleanDistrict || cleanCity || `Area (${lat.toFixed(2)})`;

    // Susun Sub-Judul Administrasi (Kecamatan dan Kabupaten/Kota)
    let admin = "";
    if (village && cleanDistrict && cleanCity) {
        admin = `Kec. ${cleanDistrict}, ${cleanCity}`;
    } else if (village && cleanDistrict) {
        admin = `Kec. ${cleanDistrict}`;
    } else if (village && cleanCity) {
        admin = `${cleanCity}`;
    } else if (cleanDistrict && cleanCity) {
        admin = `Kec. ${cleanDistrict}, ${cleanCity}`;
    } else if (cleanCity) {
        admin = `${cleanCity}`;
    } else {
        admin = `Wilayah ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    }

    if (!province) province = "Indonesia";

    return { main, admin, province };
}

function renderLocationUI(obj, lat, lon) {
    const mainEl = document.getElementById("areaCityMain");
    const adminEl = document.getElementById("areaCityAdmin");
    const locEl = document.getElementById("user_loc");

    if (obj) {
        if (mainEl) mainEl.innerText = obj.main || "Wilayah";
        if (adminEl) {
            const adminText = obj.admin ? `${obj.admin}` : "";
            const provText = obj.province || "Indonesia";
            adminEl.innerText = adminText ? `${adminText} · ${provText}` : provText;
        }
    }

    if (locEl && lat !== undefined && lon !== undefined) {
        locEl.innerText = `GPS: ${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    }

    updateBookmarkIconState();
}

// Helper Fetch dengan AbortController Timeout Otomatis (Mencegah Tab Browser Hang)
async function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return res;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

async function fetchLocationName(lat, lon) {
    // 0. Cek Cache Lokal Terlebih Dahulu (Jika koordinat tidak berubah signifikan < ~500m)
    const cachedObjStr = localStorage.getItem('seismo_user_place_obj');
    const cachedLat = parseFloat(localStorage.getItem('seismo_user_lat'));
    const cachedLon = parseFloat(localStorage.getItem('seismo_user_lon'));
    if (cachedObjStr && cachedLat && cachedLon) {
        const dist = Math.abs(lat - cachedLat) + Math.abs(lon - cachedLon);
        if (dist < 0.005) { // < ~500m
            try {
                const cachedObj = JSON.parse(cachedObjStr);
                userPlaceObj = cachedObj;
                userPlaceName = `${cachedObj.main}, ${cachedObj.admin}, ${cachedObj.province}`;
                viewedPlaceObj = cachedObj;
                renderLocationUI(cachedObj, lat, lon);
                if (gpsMarker) updateGPSMarker(lat, lon, parseFloat(savedAcc) || 50, false);
                return cachedObj;
            } catch (e) { }
        }
    }

    // 1. Provider Utama: OpenStreetMap Nominatim zoom=18 (sangat detail desa, kelurahan, kecamatan)
    try {
        const resNom = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'id' }
        }, 3000);
        if (resNom.ok) {
            const dataNom = await resNom.json();
            if (dataNom && dataNom.address) {
                const obj = formatIndonesianPlace(dataNom.address, lat, lon);
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
        console.warn("Nominatim reverse geocode error/timeout, trying BigDataCloud fallback:", e);
    }

    // 2. Provider Cadangan: BigDataCloud Client API (cepat & bahasa Indonesia)
    try {
        const res = await fetchWithTimeout(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`, {}, 3000);
        if (res.ok) {
            const data = await res.json();
            let addrObj = {
                locality: data.locality || "",
                city: data.city || "",
                state: data.principalSubdivision || ""
            };
            if (Array.isArray(data.localityInfo?.administrative)) {
                data.localityInfo.administrative.forEach(adm => {
                    if (adm.adminLevel === 7 || adm.adminLevel === 8) addrObj.village = adm.name;
                    else if (adm.adminLevel === 6) addrObj.district = adm.name;
                    else if (adm.adminLevel === 4 || adm.adminLevel === 5) addrObj.county = adm.name;
                });
            }

            const obj = formatIndonesianPlace(addrObj, lat, lon);
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
        console.warn("BigDataCloud reverse geocode error/timeout:", e);
    }

    const fallbackObj = formatIndonesianPlace(null, lat, lon);
    userPlaceObj = fallbackObj;
    viewedPlaceObj = fallbackObj;
    renderLocationUI(fallbackObj, lat, lon);
}

// Reverse geocoding khusus saat meninjau wilayah favorit / pencarian (tanpa menimpa GPS asli pengguna)
async function fetchLocationNameForView(lat, lon) {
    // 1. OpenStreetMap Nominatim zoom=18
    try {
        const resNom = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'id' }
        }, 3000);
        if (resNom.ok) {
            const dataNom = await resNom.json();
            if (dataNom && dataNom.address) {
                const obj = formatIndonesianPlace(dataNom.address, lat, lon);
                viewedPlaceObj = obj;
                renderLocationUI(obj, lat, lon);
                return obj;
            }
        }
    } catch (e) { }

    // 2. BigDataCloud Fallback
    try {
        const res = await fetchWithTimeout(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`, {}, 3000);
        if (res.ok) {
            const data = await res.json();
            let addrObj = {
                locality: data.locality || "",
                city: data.city || "",
                state: data.principalSubdivision || ""
            };
            if (Array.isArray(data.localityInfo?.administrative)) {
                data.localityInfo.administrative.forEach(adm => {
                    if (adm.adminLevel === 7 || adm.adminLevel === 8) addrObj.village = adm.name;
                    else if (adm.adminLevel === 6) addrObj.district = adm.name;
                    else if (adm.adminLevel === 4 || adm.adminLevel === 5) addrObj.county = adm.name;
                });
            }

            const obj = formatIndonesianPlace(addrObj, lat, lon);
            viewedPlaceObj = obj;
            renderLocationUI(obj, lat, lon);
            return obj;
        }
    } catch (e) { }

    const fallbackObj = formatIndonesianPlace(null, lat, lon);
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
        let w = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`, {}, 3000);
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
    } else if (code >= 71 && code <= 86) {
        desc = "Salju / Es";
        iconHtml = `
            <svg class="gmap-cloud-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8ab4f8" stroke-width="2">
                <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"></path>
                <line x1="8" y1="16" x2="8.01" y2="16"></line>
                <line x1="8" y1="20" x2="8.01" y2="20"></line>
                <line x1="12" y1="18" x2="12.01" y2="18"></line>
                <line x1="12" y1="22" x2="12.01" y2="22"></line>
                <line x1="16" y1="16" x2="16.01" y2="16"></line>
                <line x1="16" y1="20" x2="16.01" y2="20"></line>
            </svg>
        `;
    } else if (code >= 95) {
        desc = "Badai Petir";
        iconHtml = `
            <svg class="gmap-storm-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbc04" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"></path>
                <polyline points="13 11 9 17 15 17 11 23"></polyline>
            </svg>
        `;
    }

    if (condTempEl) condTempEl.innerText = `${desc} · ${temp} °C`;
    if (iconContainer) iconContainer.innerHTML = iconHtml;
}

function updateBookmarkIconState() {
    const btn = document.getElementById("areaBookmarkBtn");
    const icon = document.getElementById("areaBookmarkIcon");
    if (!btn || !icon) return;

    const places = getSavedPlaces();
    const isSaved = places.some(p => Math.abs(p.lat - viewedCoords[0]) < 0.05 && Math.abs(p.lon - viewedCoords[1]) < 0.05);

    if (isSaved) {
        btn.classList.add("active");
        btn.title = "Tersimpan di Wilayah Favorit";
        icon.innerHTML = '&#xe866;'; // Filled bookmark
    } else {
        btn.classList.remove("active");
        btn.title = "Simpan Wilayah Ini";
        icon.innerHTML = '&#xe867;'; // Outline bookmark
    }

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
        const defaultObj = { main: "Lubuk Tukko", admin: "Kec. Pandan, Kab. Tapanuli Tengah", province: "Sumatera Utara" };
        userCoords = [1.688159, 98.823695];
        viewedCoords = [1.688159, 98.823695];
        viewedPlaceObj = defaultObj;
        renderLocationUI(defaultObj, 1.688159, 98.823695);
        fetchWeather(1.688159, 98.823695);
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
            viewedCoords = [latitude, longitude];
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
        { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 }
    );
}

// ==================== HISTATS ANALYTICS TRACKER ====================
function initHistats() {
    if (location.protocol === 'file:') return;
    try {
        window._Hasync = window._Hasync || [];
        window._Hasync.push(['Histats.start', '1,5045294,4,0,0,0,00010000']);
        window._Hasync.push(['Histats.fasi', '1']);
        window._Hasync.push(['Histats.track_hits', '']);

        const hs = document.createElement('script');
        hs.type = 'text/javascript';
        hs.async = true;
        hs.src = 'https://s10.histats.com/js15_as.js';
        (document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(hs);
    } catch (e) {
        console.warn('[Analytics] Histats init warning:', e);
    }
}

// ==================== APP INITIALIZATION (INSTANT UI FIRST) ====================

function bootApp() {
    // 1. Instan Visual UI & Tema Terang Bawaan (Milidetik ke-0)
    initTheme();
    applyMapLayer(currentMapLayer);
    initMapUrlSync();
    updateLiveClock();
    initChipsSliderInteractions();
    updateBookmarkIconState();
    renderSavedPlacesUI();
    renderBookmarkedQuakesUI();
    renderRecentSearchesUI();
    updateRecentQuakesUI();
    updateAutoBroadcastUI();
    applyLanguage(currentAppLanguage);

    if (window.innerWidth <= 768) {
        toggleMobileDrawer(false);
    } else {
        if (!isNavRailEnabled) {
            document.body.classList.add("nav-rail-disabled");
            isPanelCollapsed = true;
            document.body.classList.add("panel-collapsed");
            const panel = document.getElementById("mainPanel") || document.getElementById("panelContainer");
            if (panel) panel.classList.add("collapsed");
        } else {
            document.body.classList.remove("nav-rail-disabled");
            document.body.classList.remove("panel-collapsed");
            const panel = document.getElementById("mainPanel") || document.getElementById("panelContainer");
            if (panel) panel.classList.remove("collapsed");
        }
    }

    // 2. Invalidate Map & Resize Canvas
    setTimeout(() => {
        if (typeof map !== 'undefined' && map) map.invalidateSize();
        resizeCanvas();
    }, 40);

    // 3. UI Interactions (Instant)
    const searchInputEl = document.getElementById("searchInput");
    const searchBoxCardEl = document.getElementById("searchBoxCard");

    function switchToMonitorAndExpand() {
        if (window.innerWidth > 768) {
            if (currentNavTab !== 'monitor') {
                switchNavTab('monitor');
            }
            if (isPanelCollapsed) {
                toggleSidebar(true);
            }
            const wrap = document.getElementById("cardsScrollWrap");
            if (wrap) wrap.scrollTop = 0;
        }
    }

    if (searchInputEl) {
        searchInputEl.addEventListener("focus", switchToMonitorAndExpand);
        searchInputEl.addEventListener("click", (e) => {
            e.stopPropagation();
            switchToMonitorAndExpand();
        });
    }

    if (searchBoxCardEl) {
        searchBoxCardEl.addEventListener("click", (e) => {
            if (window.innerWidth > 768) {
                if (!e.target.closest('#searchMenuBtn') && !e.target.closest('#searchSubmitBtn')) {
                    switchToMonitorAndExpand();
                    if (searchInputEl) searchInputEl.focus();
                }
            }
        });
    }

    // Listener klik di luar area (Click Outside) untuk menutup cards-scroll-wrap saat mode nav-rail mati
    document.addEventListener("pointerdown", (e) => {
        if (window.innerWidth <= 768) return;
        if (!isNavRailEnabled && !isPanelCollapsed) {
            const panel = document.getElementById("mainPanel") || document.getElementById("panelContainer");
            const settingsDrawer = document.getElementById("gmapSettingsWrapper");
            const isInsidePanel = panel && panel.contains(e.target);
            const isInsideSettings = settingsDrawer && settingsDrawer.contains(e.target);
            const isInsideModal = e.target.closest('.modal-backdrop') || e.target.closest('.leaflet-popup') || e.target.closest('.toast');

            if (!isInsidePanel && !isInsideSettings && !isInsideModal) {
                toggleSidebar(false);
                if (searchInputEl) searchInputEl.blur();
            }
        }
    });

    // Listener tombol ESC keyboard untuk menutup Settings Drawer dan Modal
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeDesktopSettings();
            closeShareModal();
            closeLanguageModal();
            if (!isNavRailEnabled && !isPanelCollapsed) {
                toggleSidebar(false);
                if (searchInputEl) searchInputEl.blur();
            }
        }
    });

    // 4. Background Secondary Network Services (POST-LOAD DEFER - setelah window onload)
    const runPostLoadServices = () => {
        setTimeout(() => {
            initLocation();
            initHistats();
        }, 150);
    };

    if (document.readyState === 'complete') {
        runPostLoadServices();
    } else {
        window.addEventListener('load', runPostLoadServices, { once: true });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", bootApp);
} else {
    bootApp();
}

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
        if (mag >= 5.0 && !isAutoBroadcastOn) {
            speakAlert(`Peringatan getaran gempa magnitudo ${mag.toFixed(1)} terdeteksi`);
        }
    }

    // Jika mode siaran otomatis sedang ON, jalankan uji coba siaran suara simulasi
    if (isAutoBroadcastOn && !isMuted) {
        broadcastQuakeEvent({
            mag: mag,
            place: viewedPlaceObj?.main ? `Wilayah ${viewedPlaceObj.main}` : "Wilayah Indonesia",
            depth: `${Math.round(mag * 4)} km`,
            potensi: mag >= 7.0 ? "Berpotensi tsunami (Uji Simulasi)" : "Tidak berpotensi tsunami",
            time: "Baru saja",
            lat: viewedCoords[0],
            lon: viewedCoords[1]
        }, true);
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

// ==================== MODE SIAGA SIARAN SUARA GEMPA REAL-TIME (AUTO BROADCAST) ====================
let isAutoBroadcastOn = localStorage.getItem('seismo_auto_broadcast') === 'true';
let lastKnownQuakeSignature = localStorage.getItem('seismo_last_sig') || '';
let isBroadcastingAlert = false;

function updateAutoBroadcastUI() {
    const btn = document.getElementById("btnAutoBroadcast");
    const txt = document.getElementById("autoBroadcastText");
    const icon = document.getElementById("autoBroadcastIcon");
    if (!btn || !txt) return;

    if (isAutoBroadcastOn) {
        btn.classList.add("active-mode");
        txt.innerText = "SIARAN OTOMATIS: ON";
        btn.title = "Mode Siaga Aktif: Suara otomatis menyiarkan gempa baru seketika saat terdeteksi (Klik untuk Nonaktifkan)";
        if (icon) {
            icon.innerHTML = '&#xe050;';
        }
    } else {
        btn.classList.remove("active-mode");
        btn.classList.remove("speaking");
        txt.innerText = "SIARAN OTOMATIS: OFF";
        btn.title = "Mode Siaga Nonaktif: Klik untuk Aktifkan Siaran Suara Otomatis";
        if (icon) {
            icon.innerHTML = '&#xe7f0;';
        }
    }
}

function toggleAutoBroadcastAlert() {
    isAutoBroadcastOn = !isAutoBroadcastOn;
    try {
        localStorage.setItem('seismo_auto_broadcast', isAutoBroadcastOn ? 'true' : 'false');
    } catch (e) { }

    updateAutoBroadcastUI();

    if (isAutoBroadcastOn) {
        // Inisialisasi Audio Context agar tidak diblokir autoplay policy
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
        } catch (e) { }

        // Simpan signature gempa yang sedang ada saat ini sebagai baseline (agar tidak menyiarkan gempa lama)
        if (quakesArray && quakesArray.length > 0) {
            const latest = quakesArray[0];
            lastKnownQuakeSignature = (latest.iso || latest.time) + '_' + latest.lat.toFixed(2) + '_' + latest.lon.toFixed(2);
            try { localStorage.setItem('seismo_last_sig', lastKnownQuakeSignature); } catch (e) { }
        }

        showToastNotification("🔊 Siaran Suara Otomatis: AKTIF (Siaga Gempa Baru)");
        speakAlert("Mode siaga siaran suara gempa otomatis diaktifkan. Sistem akan otomatis bersuara saat ada gempa baru terdeteksi.");
    } else {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        isBroadcastingAlert = false;
        showToastNotification("📢 Siaran Suara Otomatis: NONAKTIF");
        speakAlert("Mode siaga suara dinonaktifkan.");
    }
}

function checkForNewEarthquakeEvent(uniqueQuakes) {
    if (!uniqueQuakes || uniqueQuakes.length === 0) return;

    const latest = uniqueQuakes[0];
    const currentSig = (latest.iso || latest.time) + '_' + latest.lat.toFixed(2) + '_' + latest.lon.toFixed(2);

    if (!lastKnownQuakeSignature) {
        // Inisialisasi awal saat buka aplikasi agar gempa lama tidak disiarkan ulang
        lastKnownQuakeSignature = currentSig;
        try { localStorage.setItem('seismo_last_sig', currentSig); } catch (e) { }
        return;
    }

    // Terdeteksi gempa baru secara real-time!
    if (currentSig !== lastKnownQuakeSignature) {
        lastKnownQuakeSignature = currentSig;
        try { localStorage.setItem('seismo_last_sig', currentSig); } catch (e) { }

        if (isAutoBroadcastOn && !isMuted) {
            broadcastQuakeEvent(latest, true);
        }
    }
}

function broadcastQuakeEvent(q, isAutoTrigger = false) {
    if (!q || isMuted) return;

    const btn = document.getElementById("btnAutoBroadcast");
    const txt = document.getElementById("autoBroadcastText");

    const mag = q.mag ? q.mag.toFixed(1) : "0";
    let placeSpeech = q.place || "Wilayah Indonesia";

    // Optimasi teks tempat untuk pelafalan suara Indonesia yang fasih
    placeSpeech = placeSpeech
        .replace(/\bkm\b/gi, 'kilometer')
        .replace(/\bS of\b/gi, 'Selatan')
        .replace(/\bN of\b/gi, 'Utara')
        .replace(/\bW of\b/gi, 'Barat')
        .replace(/\bE of\b/gi, 'Timur')
        .replace(/\bSW of\b/gi, 'Barat Daya')
        .replace(/\bNW of\b/gi, 'Barat Laut')
        .replace(/\bSE of\b/gi, 'Tenggara')
        .replace(/\bNE of\b/gi, 'Timur Laut');

    let depthSpeech = q.depth ? String(q.depth).replace(/\bkm\b/gi, 'kilometer') : "10 kilometer";
    let timeSpeech = q.time || "baru saja";
    let potensiSpeech = q.potensi || "Tidak berpotensi tsunami";

    const latDeg = Math.abs(q.lat).toFixed(2);
    const lonDeg = Math.abs(q.lon).toFixed(2);
    const latDir = q.lat >= 0 ? "Lintang Utara" : "Lintang Selatan";
    const lonDir = q.lon >= 0 ? "Bujur Timur" : "Bujur Barat";
    const coordSpeech = `${latDeg} derajat ${latDir}, dan ${lonDeg} derajat ${lonDir}`;

    const dist = hasUserGPS ? calcDistance(userCoords[0], userCoords[1], q.lat, q.lon) : null;

    // 1. Bunyikan sirene peringatan awal
    playEmergencySiren();

    // 2. Arahkan peta ke lokasi gempa
    focusQuake(q.lat, q.lon);

    // 3. Rangkai naskah siaran suara
    let speechText = isAutoTrigger ? `Peringatan gempa bumi baru terdeteksi! ` : `Peringatan gempa bumi terkini! `;
    speechText += `Gempa bermagnitudo ${mag} mengguncang ${placeSpeech}. `;
    speechText += `Waktu kejadian: ${timeSpeech}. `;
    speechText += `Kedalaman gempa: ${depthSpeech}. `;
    speechText += `Koordinat pusat gempa: ${coordSpeech}. `;
    speechText += `Status: ${potensiSpeech}. `;
    if (dist !== null) {
        speechText += `Pusat gempa berjarak sekitar ${dist} kilometer dari lokasi Anda saat ini. `;
    }
    speechText += `Warga dihimbau tetap tenang dan waspada terhadap kemungkinan gempa susulan.`;

    // 4. Update visual tombol
    isBroadcastingAlert = true;
    if (btn) {
        btn.classList.add("speaking");
        if (txt) txt.innerText = "MENYIARKAN SUARA...";
        const icon = document.getElementById("autoBroadcastIcon");
        if (icon) icon.innerHTML = '&#xe047;';
    }

    // 5. Eksekusi SpeechSynthesis
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.lang = 'id-ID';
        utterance.rate = 0.98;
        utterance.pitch = 1.0;

        const resetBtnState = () => {
            isBroadcastingAlert = false;
            if (btn) btn.classList.remove("speaking");
            updateAutoBroadcastUI();
        };

        utterance.onend = resetBtnState;
        utterance.onerror = resetBtnState;

        // Beri jeda 1.2 detik agar sirene peringatan awal terdengar sebelum suara berbicara
        setTimeout(() => {
            if (isBroadcastingAlert) {
                window.speechSynthesis.speak(utterance);
            }
        }, 1200);
    } else {
        showToastNotification("Perangkat tidak mendukung suara sintesis web.");
        isBroadcastingAlert = false;
        if (btn) btn.classList.remove("speaking");
        updateAutoBroadcastUI();
    }
}

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


