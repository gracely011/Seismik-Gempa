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

// Google Symbols Inline SVG untuk Mode Terang / Gelap (Standar Google Maps)
const SVG_THEME_MOON = `<svg viewBox="0 -960 960 960" width="24" height="24" fill="currentColor"><path d="M380-160q133 0 226.5-93.5T700-480q0-133-93.5-226.5T380-800h-21q-10 0-19 2 57 66 88.5 147.5T460-480q0 89-31.5 170.5T340-162q9 2 19 2h21Zm0 80q-53 0-103.5-13.5T180-134q93-54 146.5-146T380-480q0-108-53.5-200T180-826q46-27 96.5-40.5T380-880q83 0 156 31.5T663-763q54 54 85.5 127T780-480q0 83-31.5 156T663-197q-54 54-127 85.5T380-80Zm80-400Z"/></svg>`;
const SVG_THEME_SUN = `<svg viewBox="0 -960 960 960" width="24" height="24" fill="currentColor"><path d="M480-360q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0 80q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-650l-101-97 57-59 96 100-52 56Zm492 496-97-101 53-55 101 97-57 59Zm-98-550 97-101 59 57-100 96-56-52ZM154-154l98-102 56 54-95 102-59-54Z"/></svg>`;

function updateThemeIcon(isLight) {
    const iconEl = document.getElementById('settingsThemeIcon');
    const labelEl = document.getElementById('settingsThemeLabel');
    const lang = (typeof currentAppLanguage !== 'undefined' ? currentAppLanguage : (localStorage.getItem('seismik_lang') || 'id'));

    if (isLight) {
        // Saat aplikasi berada dalam Mode Terang: tampilkan tombol untuk beralih ke Mode Gelap
        if (iconEl) iconEl.innerHTML = SVG_THEME_MOON;
        if (labelEl) labelEl.textContent = (lang === 'en' ? 'Dark mode' : 'Mode Gelap');
    } else {
        // Saat aplikasi berada dalam Mode Gelap: tampilkan tombol untuk beralih ke Mode Terang
        if (iconEl) iconEl.innerHTML = SVG_THEME_SUN;
        if (labelEl) labelEl.textContent = (lang === 'en' ? 'Light mode' : 'Mode Terang');
    }

    const indicator = document.getElementById('themeIconIndicator');
    if (indicator) {
        indicator.innerHTML = isLight ? SVG_THEME_SUN : SVG_THEME_MOON;
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
    attributionControl: false,
    zoomControl: false,
    zoomAnimation: true,
    zoomAnimationThreshold: 4,
    fadeAnimation: true,
    markerZoomAnimation: true,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 100,
    wheelDebounceTime: 40,
    inertia: true,
    inertiaDeceleration: 3400,
    inertiaMaxSpeed: 2000
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

// Konfigurasi Buffer dan Transisi Ubin Peta Ringan & Cepat (Super Smooth 60 FPS Continuous)
const tileCommonOptions = {
    maxZoom: 20,
    tileSize: 256,
    zoomOffset: 0,
    keepBuffer: 4,
    updateWhenIdle: false,
    updateWhenZooming: true,
    updateInterval: 50
};

const tileLayersCache = {};
let activeTileLayerInstance = null;

// ==================== SECRET GOOGLE MAPS ENGINE (MT-CLUSTER PROXYLESS) ====================
let isGmapsFeatureUnlocked = (localStorage.getItem('_sg_vstate') === '1');
let isGoogleMapsEngineActive = (localStorage.getItem('_sg_engine') === '1');

// Tile Generator Resmi Google Maps MT-Cluster dengan parameter Web Client (hl=id, gl=ID)
function getGoogleMapsTileLayer(lyrsCode, isDark = false) {
    const cacheKey = `gmap_${lyrsCode}_${isDark ? 'dark' : 'normal'}`;
    if (!tileLayersCache[cacheKey]) {
        tileLayersCache[cacheKey] = L.tileLayer(`https://mt{s}.google.com/vt/lyrs=${lyrsCode}&hl=id&gl=ID&x={x}&y={y}&z={z}`, {
            subdomains: ['0', '1', '2', '3'],
            maxZoom: 20,
            tileSize: 256,
            keepBuffer: 4,
            updateWhenIdle: false,
            updateWhenZooming: true,
            updateInterval: 50,
            crossOrigin: true,
            className: isDark ? 'gmap-dark-filter-tile' : ''
        });
    }
    return tileLayersCache[cacheKey];
}

// ==================== GOOGLE OVERLAYS: LALU LINTAS, TRANSIT, BERSEPEDA ====================
let isTrafficLayerActive = (localStorage.getItem('seismo_traffic_active') === '1');
let trafficTileLayer = null;

let isTransitLayerActive = (localStorage.getItem('seismo_transit_active') === '1');
let transitTileLayer = null;

let isBikeLayerActive = (localStorage.getItem('seismo_bike_active') === '1');
let bikeTileLayer = null;

let is3DBuildingsActive = (localStorage.getItem('seismo_3d_active') === '1');
let buildingsTileLayer = null;

let isStreetViewActive = (localStorage.getItem('seismo_sv_active') === '1');
let streetViewCoverageLayer = null;

let isWildfireActive = (localStorage.getItem('seismo_wildfire_active') === '1');
let wildfireTileLayer = null;

let isAirQualityActive = (localStorage.getItem('seismo_aq_active') === '1');
let airQualityTileLayer = null;

function toggleTrafficLayer() {
    isTrafficLayerActive = !isTrafficLayerActive;
    try { localStorage.setItem('seismo_traffic_active', isTrafficLayerActive ? '1' : '0'); } catch(e){}
    
    if (isTrafficLayerActive) {
        if (!trafficTileLayer) {
            trafficTileLayer = L.tileLayer(`https://mt{s}.google.com/vt/lyrs=h,traffic&hl=id&gl=ID&x={x}&y={y}&z={z}`, {
                subdomains: ['0', '1', '2', '3'],
                maxZoom: 20,
                keepBuffer: 3,
                updateWhenIdle: true,
                pane: 'overlayPane',
                zIndex: 450
            });
        }
        if (map && !map.hasLayer(trafficTileLayer)) {
            map.addLayer(trafficTileLayer);
        }
        showToastNotification("🚦 Lapisan Lalu Lintas Google (Live Traffic) Aktif");
    } else {
        if (map && trafficTileLayer && map.hasLayer(trafficTileLayer)) {
            map.removeLayer(trafficTileLayer);
        }
        showToastNotification("🚦 Lapisan Lalu Lintas Dinonaktifkan");
    }
    updateLayerDetailUI();
}

function toggleTransitLayer() {
    isTransitLayerActive = !isTransitLayerActive;
    try { localStorage.setItem('seismo_transit_active', isTransitLayerActive ? '1' : '0'); } catch(e){}
    
    if (isTransitLayerActive) {
        if (!transitTileLayer) {
            transitTileLayer = L.tileLayer(`https://mt{s}.google.com/vt/lyrs=m,transit&hl=id&gl=ID&x={x}&y={y}&z={z}`, {
                subdomains: ['0', '1', '2', '3'],
                maxZoom: 20,
                keepBuffer: 3,
                updateWhenIdle: true,
                pane: 'overlayPane',
                zIndex: 440
            });
        }
        if (map && !map.hasLayer(transitTileLayer)) {
            map.addLayer(transitTileLayer);
        }
        showToastNotification("🚇 Lapisan Transportasi Umum Google Aktif");
    } else {
        if (map && transitTileLayer && map.hasLayer(transitTileLayer)) {
            map.removeLayer(transitTileLayer);
        }
        showToastNotification("🚇 Lapisan Transportasi Umum Dinonaktifkan");
    }
    updateLayerDetailUI();
}

function toggleBikeLayer() {
    isBikeLayerActive = !isBikeLayerActive;
    try { localStorage.setItem('seismo_bike_active', isBikeLayerActive ? '1' : '0'); } catch(e){}
    
    if (isBikeLayerActive) {
        if (!bikeTileLayer) {
            bikeTileLayer = L.tileLayer(`https://mt{s}.google.com/vt/lyrs=m,bike&hl=id&gl=ID&x={x}&y={y}&z={z}`, {
                subdomains: ['0', '1', '2', '3'],
                maxZoom: 20,
                keepBuffer: 3,
                updateWhenIdle: true,
                pane: 'overlayPane',
                zIndex: 445
            });
        }
        if (map && !map.hasLayer(bikeTileLayer)) {
            map.addLayer(bikeTileLayer);
        }
        showToastNotification("🚴 Lapisan Jalur Bersepeda Google Aktif");
    } else {
        if (map && bikeTileLayer && map.hasLayer(bikeTileLayer)) {
            map.removeLayer(bikeTileLayer);
        }
        showToastNotification("🚴 Lapisan Jalur Bersepeda Dinonaktifkan");
    }
    updateLayerDetailUI();
}

function toggle3DBuildingsLayer() {
    is3DBuildingsActive = !is3DBuildingsActive;
    try { localStorage.setItem('seismo_3d_active', is3DBuildingsActive ? '1' : '0'); } catch(e){}
    
    if (is3DBuildingsActive) {
        if (!buildingsTileLayer) {
            buildingsTileLayer = L.tileLayer(`https://mt{s}.google.com/vt/lyrs=r,app:ikb&hl=id&gl=ID&x={x}&y={y}&z={z}`, {
                subdomains: ['0', '1', '2', '3'],
                maxZoom: 20,
                keepBuffer: 3,
                updateWhenIdle: true,
                pane: 'overlayPane',
                zIndex: 435
            });
        }
        if (map && !map.hasLayer(buildingsTileLayer)) {
            map.addLayer(buildingsTileLayer);
        }
        showToastNotification("🏢 Lapisan Bangunan Vertikal 3D Aktif");
    } else {
        if (map && buildingsTileLayer && map.hasLayer(buildingsTileLayer)) {
            map.removeLayer(buildingsTileLayer);
        }
        showToastNotification("🏢 Lapisan Bangunan Vertikal Dinonaktifkan");
    }
    updateLayerDetailUI();
}

function toggleStreetViewLayer() {
    isStreetViewActive = !isStreetViewActive;
    try { localStorage.setItem('seismo_sv_active', isStreetViewActive ? '1' : '0'); } catch(e){}
    
    if (isStreetViewActive) {
        if (!streetViewCoverageLayer) {
            streetViewCoverageLayer = L.tileLayer(`https://mt{s}.google.com/vt/lyrs=m,sv_coverage&hl=id&gl=ID&x={x}&y={y}&z={z}`, {
                subdomains: ['0', '1', '2', '3'],
                maxZoom: 20,
                keepBuffer: 3,
                updateWhenIdle: true,
                pane: 'overlayPane',
                zIndex: 455
            });
        }
        if (map && !map.hasLayer(streetViewCoverageLayer)) {
            map.addLayer(streetViewCoverageLayer);
        }
        showToastNotification("🚶 Lapisan Cakupan Google Street View Aktif (Jalur Biru)");
    } else {
        if (map && streetViewCoverageLayer && map.hasLayer(streetViewCoverageLayer)) {
            map.removeLayer(streetViewCoverageLayer);
        }
        showToastNotification("🚶 Lapisan Street View Dinonaktifkan");
    }
    updateLayerDetailUI();
}

function toggleWildfireLayer() {
    isWildfireActive = !isWildfireActive;
    try { localStorage.setItem('seismo_wildfire_active', isWildfireActive ? '1' : '0'); } catch(e){}
    
    if (isWildfireActive) {
        if (!wildfireTileLayer) {
            wildfireTileLayer = L.tileLayer('https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/{z}/{x}/{y}', {
                subdomains: ['a', 'b', 'c'],
                maxZoom: 18,
                pane: 'overlayPane',
                zIndex: 460,
                opacity: 0.85
            });
        }
        if (map && !map.hasLayer(wildfireTileLayer)) {
            map.addLayer(wildfireTileLayer);
        }
        showToastNotification("🔥 Lapisan Titik Panas Kebakaran Hutan (NASA FIRMS) Aktif");
    } else {
        if (map && wildfireTileLayer && map.hasLayer(wildfireTileLayer)) {
            map.removeLayer(wildfireTileLayer);
        }
        showToastNotification("🔥 Lapisan Kebakaran Hutan Dinonaktifkan");
    }
    updateLayerDetailUI();
}

function toggleAirQualityLayer() {
    isAirQualityActive = !isAirQualityActive;
    try { localStorage.setItem('seismo_aq_active', isAirQualityActive ? '1' : '0'); } catch(e){}
    
    if (isAirQualityActive) {
        if (!airQualityTileLayer) {
            airQualityTileLayer = L.tileLayer('https://tiles.aqicn.org/tiles/usepa-aqi/{z}/{x}/{y}.png?token=demo', {
                maxZoom: 18,
                pane: 'overlayPane',
                zIndex: 465,
                opacity: 0.85
            });
        }
        if (map && !map.hasLayer(airQualityTileLayer)) {
            map.addLayer(airQualityTileLayer);
        }
        showToastNotification("🍃 Lapisan Indeks Kualitas Udara (Air Quality) Aktif");
    } else {
        if (map && airQualityTileLayer && map.hasLayer(airQualityTileLayer)) {
            map.removeLayer(airQualityTileLayer);
        }
        showToastNotification("🍃 Lapisan Kualitas Udara Dinonaktifkan");
    }
    updateLayerDetailUI();
}

function toggleMeasureFromLayer() {
    if (typeof window.toggleMeasureTool === 'function') {
        window.toggleMeasureTool();
    } else {
        const deskMeasureBtn = document.getElementById('layerOptMeasure');
        if (deskMeasureBtn) deskMeasureBtn.classList.toggle('active');
    }
}

function updateLayerDetailUI() {
    const pairs = [
        { desk: 'layerOptTraffic', mob: 'mobLayerOptTraffic', active: isTrafficLayerActive },
        { desk: 'layerOptTransit', mob: 'mobLayerOptTransit', active: isTransitLayerActive },
        { desk: 'layerOptBike', mob: 'mobLayerOptBike', active: isBikeLayerActive },
        { desk: 'layerOpt3D', mob: 'mobLayerOpt3D', active: is3DBuildingsActive },
        { desk: 'layerOptStreetView', mob: 'mobLayerOptStreetView', active: isStreetViewActive },
        { desk: 'layerOptWildfire', mob: 'mobLayerOptWildfire', active: isWildfireActive },
        { desk: 'layerOptAirQuality', mob: 'mobLayerOptAirQuality', active: isAirQualityActive },
        { desk: 'layerOptFaults', mob: 'mobLayerOptFaults', active: isFaultsLayerVisible }
    ];

    pairs.forEach(p => {
        const deskBtn = document.getElementById(p.desk);
        const mobBtn = document.getElementById(p.mob);
        if (deskBtn) deskBtn.classList.toggle('active', !!p.active);
        if (mobBtn) mobBtn.classList.toggle('active', !!p.active);
    });
}

// ==================== DYNAMIC DOM INJECTION & PURGE MODULE (STEALTH) ====================
function injectGoogleMapsVersionUI() {
    // 1. Inject Menu Item into Settings Drawer
    if (!document.getElementById('settingsGmapsVersionItem')) {
        const shareLocItem = document.getElementById('settingsShareLocationItem');
        if (shareLocItem) {
            const html = `
                <li class="AJqepd" id="settingsGmapsVersionItem">
                    <div class="IpXlkd T2ozWe" onclick="toggleGoogleMapsEngineMode()">
                        <span class="tIuFw wch72">
                            <svg viewBox="0 -960 960 960" width="24" height="24" fill="currentColor"><path d="m600-120-240-84-186 72q-20 8-37-4.5T120-170v-560q0-13 7.5-23t20.5-15l212-72 240 84 186-72q20-8 37 4.5t17 33.5v560q0 13-7.5 23T812-192l-212 72Zm-40-98v-468l-160-56v468l160 56Zm80 0 120-40v-474l-120 46v468Zm-440-10 120-46v-468l-120 40v474Zm440-458v468-468Zm-320-56v468-468Z"/></svg>
                        </span>
                        <label class="fontBodyMedium gFio1e" style="font-weight: 500;">Google Maps Version</label>
                        <button role="switch" class="Ud5kdf LdO2ac" id="settingsGmapsVersionSwitch" aria-checked="${isGoogleMapsEngineActive ? 'true' : 'false'}" aria-label="Google Maps Version">
                            <div class="JbUHGd"></div>
                        </button>
                    </div>
                </li>
            `;
            shareLocItem.insertAdjacentHTML('beforebegin', html);
        }
    } else {
        const sw = document.getElementById('settingsGmapsVersionSwitch');
        if (sw) sw.setAttribute('aria-checked', isGoogleMapsEngineActive ? 'true' : 'false');
    }

    // 2. Inject Extra Layer Details into Desktop Layer Popup
    const deskHook = document.getElementById('desktopExtraDetailsHook');
    if (deskHook && !document.getElementById('layerOptTraffic')) {
        deskHook.innerHTML = `
            <div class="layer-option-item ${isTrafficLayerActive ? 'active' : ''}" id="layerOptTraffic" onclick="toggleTrafficLayer()" title="Kondisi Lalu Lintas Live Google">
                <div class="layer-thumb-preview">
                    <svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
                        <defs><clipPath id="sqClipDeskDTraf"><rect width="64" height="64" rx="14"/></clipPath></defs>
                        <g clip-path="url(#sqClipDeskDTraf)">
                            <rect width="64" height="64" fill="#f8f9fa"/>
                            <path d="M-4 32 L68 32" stroke="#dadce0" stroke-width="16"/>
                            <path d="M32 -4 L32 68" stroke="#dadce0" stroke-width="16"/>
                            <path d="M-4 26 L26 26 Q38 26 38 -4" stroke="#34a853" stroke-width="5" fill="none" stroke-linecap="round"/>
                            <path d="M38 68 L38 38 Q38 26 68 26" stroke="#fbbc04" stroke-width="5" fill="none" stroke-linecap="round"/>
                            <path d="M26 68 L26 38 Q26 38 -4 38" stroke="#ea4335" stroke-width="5" fill="none" stroke-linecap="round"/>
                            <path d="M26 -4 L26 26 Q26 38 68 38" stroke="#34a853" stroke-width="5" fill="none" stroke-linecap="round"/>
                        </g>
                    </svg>
                </div>
                <span class="layer-opt-label">Lalu lintas</span>
            </div>
            <div class="layer-option-item ${isTransitLayerActive ? 'active' : ''}" id="layerOptTransit" onclick="toggleTransitLayer()" title="Jalur Transportasi Umum Google">
                <div class="layer-thumb-preview">
                    <svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
                        <defs><clipPath id="sqClipDeskDTrans"><rect width="64" height="64" rx="14"/></clipPath></defs>
                        <g clip-path="url(#sqClipDeskDTrans)">
                            <rect width="64" height="64" fill="#f8f9fa"/>
                            <path d="M-4 22 L68 22" stroke="#7baaf7" stroke-width="4"/>
                            <path d="M-4 32 L68 32" stroke="#8430ce" stroke-width="5"/>
                            <path d="M28 22 L36 32" stroke="#ea4335" stroke-width="3"/>
                            <rect x="12" y="10" width="18" height="18" rx="4" fill="#1a73e8"/>
                            <text x="21" y="24" font-family="'Google Sans', Roboto, sans-serif" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle">M</text>
                            <rect x="34" y="26" width="18" height="18" rx="4" fill="#0288d1"/>
                            <rect x="38" y="30" width="10" height="7" rx="1.5" fill="#ffffff"/>
                            <circle cx="40" cy="40.5" r="1.2" fill="#ffffff"/>
                            <circle cx="46" cy="40.5" r="1.2" fill="#ffffff"/>
                        </g>
                    </svg>
                </div>
                <span class="layer-opt-label">Transportasi</span>
            </div>
            <div class="layer-option-item ${isBikeLayerActive ? 'active' : ''}" id="layerOptBike" onclick="toggleBikeLayer()" title="Jalur Sepeda Google">
                <div class="layer-thumb-preview">
                    <svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
                        <defs><clipPath id="sqClipDeskDBike"><rect width="64" height="64" rx="14"/></clipPath></defs>
                        <g clip-path="url(#sqClipDeskDBike)">
                            <rect width="64" height="64" fill="#e6f4ea"/>
                            <circle cx="20" cy="38" r="9" stroke="#137333" stroke-width="3" fill="none"/>
                            <circle cx="44" cy="38" r="9" stroke="#137333" stroke-width="3" fill="none"/>
                            <circle cx="32" cy="20" r="11" stroke="#34a853" stroke-width="3.5" fill="none" stroke-dasharray="5,3"/>
                            <path d="M20 38 L30 26 L38 26 L44 38 M30 26 L34 38 M27 22 L33 22" stroke="#137333" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        </g>
                    </svg>
                </div>
                <span class="layer-opt-label">Bersepeda</span>
            </div>
            <div class="layer-option-item ${is3DBuildingsActive ? 'active' : ''}" id="layerOpt3D" onclick="toggle3DBuildingsLayer()" title="Bangunan 3D Google">
                <div class="layer-thumb-preview">
                    <svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
                        <defs><clipPath id="sqClipDeskD3D"><rect width="64" height="64" rx="14"/></clipPath></defs>
                        <g clip-path="url(#sqClipDeskD3D)">
                            <rect width="64" height="64" fill="#f8f9fa"/>
                            <path d="M-4 56 Q28 44 68 48 L68 68 L-4 68 Z" fill="#81c995"/>
                            <polygon points="20,18 34,12 44,18 30,24" fill="#e8eaed" stroke="#bdc1c6" stroke-width="0.5"/>
                            <polygon points="20,18 30,24 30,48 20,42" fill="#bdc1c6"/>
                            <polygon points="30,24 44,18 44,42 30,48" fill="#9aa0a6"/>
                            <polygon points="38,28 48,22 56,27 46,33" fill="#e8eaed" stroke="#bdc1c6" stroke-width="0.5"/>
                            <polygon points="38,28 46,33 46,50 38,45" fill="#bdc1c6"/>
                            <polygon points="46,33 56,27 56,44 46,50" fill="#9aa0a6"/>
                        </g>
                    </svg>
                </div>
                <span class="layer-opt-label">3D</span>
            </div>
        `;
    }

    // 3. Inject Full Set of 8 Extra Layer Details into Mobile Bottom Sheet
    const mobHook = document.getElementById('mobileExtraDetailsHook');
    if (mobHook) {
        mobHook.innerHTML = `
            <!-- 1. Transportasi umum -->
            <div class="mobile-sheet-item ${isTransitLayerActive ? 'active' : ''}" id="mobLayerOptTransit" onclick="toggleTransitLayer()">
                <div class="mobile-sheet-thumb">
                    <svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
                        <defs><clipPath id="sqClipMobTrans"><rect width="64" height="64" rx="16"/></clipPath></defs>
                        <g clip-path="url(#sqClipMobTrans)">
                            <rect width="64" height="64" fill="#f8f9fa"/>
                            <path d="M-4 22 L68 22" stroke="#7baaf7" stroke-width="4"/>
                            <path d="M-4 32 L68 32" stroke="#8430ce" stroke-width="5"/>
                            <path d="M28 22 L36 32" stroke="#ea4335" stroke-width="3"/>
                            <rect x="12" y="10" width="18" height="18" rx="4" fill="#1a73e8"/>
                            <text x="21" y="24" font-family="'Google Sans', Roboto, sans-serif" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle">M</text>
                            <rect x="34" y="26" width="18" height="18" rx="4" fill="#0288d1"/>
                            <rect x="38" y="30" width="10" height="7" rx="1.5" fill="#ffffff"/>
                            <circle cx="40" cy="40.5" r="1.2" fill="#ffffff"/>
                            <circle cx="46" cy="40.5" r="1.2" fill="#ffffff"/>
                        </g>
                    </svg>
                </div>
                <span class="mobile-sheet-label">Transportasi umum</span>
            </div>

            <!-- 2. Lalu Lintas -->
            <div class="mobile-sheet-item ${isTrafficLayerActive ? 'active' : ''}" id="mobLayerOptTraffic" onclick="toggleTrafficLayer()">
                <div class="mobile-sheet-thumb">
                    <svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
                        <defs><clipPath id="sqClipMobTraf"><rect width="64" height="64" rx="16"/></clipPath></defs>
                        <g clip-path="url(#sqClipMobTraf)">
                            <rect width="64" height="64" fill="#f8f9fa"/>
                            <path d="M-4 32 L68 32" stroke="#dadce0" stroke-width="16"/>
                            <path d="M32 -4 L32 68" stroke="#dadce0" stroke-width="16"/>
                            <path d="M-4 26 L26 26 Q38 26 38 -4" stroke="#34a853" stroke-width="5" fill="none" stroke-linecap="round"/>
                            <path d="M38 68 L38 38 Q38 26 68 26" stroke="#fbbc04" stroke-width="5" fill="none" stroke-linecap="round"/>
                            <path d="M26 68 L26 38 Q26 38 -4 38" stroke="#ea4335" stroke-width="5" fill="none" stroke-linecap="round"/>
                            <path d="M26 -4 L26 26 Q26 38 68 38" stroke="#34a853" stroke-width="5" fill="none" stroke-linecap="round"/>
                        </g>
                    </svg>
                </div>
                <span class="mobile-sheet-label">Lalu Lintas</span>
            </div>

            <!-- 3. Bersepeda -->
            <div class="mobile-sheet-item ${isBikeLayerActive ? 'active' : ''}" id="mobLayerOptBike" onclick="toggleBikeLayer()">
                <div class="mobile-sheet-thumb">
                    <svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
                        <defs><clipPath id="sqClipMobBike"><rect width="64" height="64" rx="16"/></clipPath></defs>
                        <g clip-path="url(#sqClipMobBike)">
                            <rect width="64" height="64" fill="#e6f4ea"/>
                            <circle cx="20" cy="38" r="9" stroke="#137333" stroke-width="3" fill="none"/>
                            <circle cx="44" cy="38" r="9" stroke="#137333" stroke-width="3" fill="none"/>
                            <circle cx="32" cy="20" r="11" stroke="#34a853" stroke-width="3.5" fill="none" stroke-dasharray="5,3"/>
                            <path d="M20 38 L30 26 L38 26 L44 38 M30 26 L34 38 M27 22 L33 22" stroke="#137333" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        </g>
                    </svg>
                </div>
                <span class="mobile-sheet-label">Bersepeda</span>
            </div>

            <!-- 4. Bangunan vertikal -->
            <div class="mobile-sheet-item ${is3DBuildingsActive ? 'active' : ''}" id="mobLayerOpt3D" onclick="toggle3DBuildingsLayer()">
                <div class="mobile-sheet-thumb">
                    <svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
                        <defs><clipPath id="sqClipMob3D"><rect width="64" height="64" rx="16"/></clipPath></defs>
                        <g clip-path="url(#sqClipMob3D)">
                            <rect width="64" height="64" fill="#f8f9fa"/>
                            <path d="M-4 56 Q28 44 68 48 L68 68 L-4 68 Z" fill="#81c995"/>
                            <polygon points="20,18 34,12 44,18 30,24" fill="#e8eaed" stroke="#bdc1c6" stroke-width="0.5"/>
                            <polygon points="20,18 30,24 30,48 20,42" fill="#bdc1c6"/>
                            <polygon points="30,24 44,18 44,42 30,48" fill="#9aa0a6"/>
                            <polygon points="38,28 48,22 56,27 46,33" fill="#e8eaed" stroke="#bdc1c6" stroke-width="0.5"/>
                            <polygon points="38,28 46,33 46,50 38,45" fill="#bdc1c6"/>
                            <polygon points="46,33 56,27 56,44 46,50" fill="#9aa0a6"/>
                        </g>
                    </svg>
                </div>
                <span class="mobile-sheet-label">Bangunan vertikal</span>
            </div>

            <!-- 5. Street View -->
            <div class="mobile-sheet-item ${isStreetViewActive ? 'active' : ''}" id="mobLayerOptStreetView" onclick="toggleStreetViewLayer()">
                <div class="mobile-sheet-thumb">
                    <svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
                        <defs><clipPath id="sqClipMobSV"><rect width="64" height="64" rx="16"/></clipPath></defs>
                        <g clip-path="url(#sqClipMobSV)">
                            <rect width="64" height="64" fill="#e8f0fe"/>
                            <path d="M-4 38 Q32 30 68 38" stroke="#8ab4f8" stroke-width="8" fill="none"/>
                            <path d="M32 -4 L32 68" stroke="#8ab4f8" stroke-width="8" fill="none"/>
                            <circle cx="32" cy="18" r="4.5" fill="#fbbc04"/>
                            <path d="M28 25 C28 23 36 23 36 25 L38 36 L34 36 L33 48 L31 48 L30 36 L26 36 Z" fill="#fbbc04" stroke="#e37400" stroke-width="0.7"/>
                            <path d="M25 28 L28 32 M39 28 L36 32" stroke="#fbbc04" stroke-width="2.5" stroke-linecap="round"/>
                        </g>
                    </svg>
                </div>
                <span class="mobile-sheet-label">Street View</span>
            </div>

            <!-- 6. Kebakaran hutan -->
            <div class="mobile-sheet-item ${isWildfireActive ? 'active' : ''}" id="mobLayerOptWildfire" onclick="toggleWildfireLayer()">
                <div class="mobile-sheet-thumb">
                    <svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
                        <defs><clipPath id="sqClipMobFire"><rect width="64" height="64" rx="16"/></clipPath></defs>
                        <g clip-path="url(#sqClipMobFire)">
                            <rect width="64" height="64" fill="#f8f9fa"/>
                            <path d="M-4 32 L68 32 M32 -4 L32 68" stroke="#e8eaed" stroke-width="8"/>
                            <circle cx="32" cy="32" r="18" fill="#ea4335"/>
                            <path d="M32 18 C32 18 36 23 36 27 C36 28.5 35.5 29.5 34.5 30.5 C36.5 30 38 32 38 34.5 C38 38 35 41 32 41 C29 41 26 38 26 34.5 C26 31 29 27.5 29 27.5 C29 27.5 30 26 30 24 C30 21.5 32 18 32 18 Z" fill="#ffffff"/>
                        </g>
                    </svg>
                </div>
                <span class="mobile-sheet-label">Kebakaran hutan</span>
            </div>

            <!-- 7. Kualitas Udara -->
            <div class="mobile-sheet-item ${isAirQualityActive ? 'active' : ''}" id="mobLayerOptAirQuality" onclick="toggleAirQualityLayer()">
                <div class="mobile-sheet-thumb">
                    <svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
                        <defs><clipPath id="sqClipMobAQ"><rect width="64" height="64" rx="16"/></clipPath></defs>
                        <g clip-path="url(#sqClipMobAQ)">
                            <rect width="64" height="64" fill="#f8f9fa"/>
                            <path d="M-4 32 L68 32 M32 -4 L32 68" stroke="#e8eaed" stroke-width="8"/>
                            <circle cx="32" cy="32" r="18" fill="#34a853"/>
                            <path d="M22 26 Q27 23 32 26 T42 26" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                            <path d="M22 32 Q27 29 32 32 T42 32" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                            <path d="M22 38 Q27 35 32 38 T42 38" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                        </g>
                    </svg>
                </div>
                <span class="mobile-sheet-label">Kualitas Udara</span>
            </div>
        `;
    }

    const mobDetailsGrid = document.getElementById('mobileLayerDetailsGrid');
    if (mobDetailsGrid) mobDetailsGrid.classList.add('gmaps-active');

    updateLayerDetailUI();
}

function purgeGoogleMapsVersionUI() {
    // 1. Remove Menu Item from Settings Drawer
    const settingsItem = document.getElementById('settingsGmapsVersionItem');
    if (settingsItem) settingsItem.remove();

    // 2. Remove Extra Layer Details from Desktop & Mobile
    const deskHook = document.getElementById('desktopExtraDetailsHook');
    if (deskHook) deskHook.innerHTML = '';
    const mobHook = document.getElementById('mobileExtraDetailsHook');
    if (mobHook) mobHook.innerHTML = '';

    const mobDetailsGrid = document.getElementById('mobileLayerDetailsGrid');
    if (mobDetailsGrid) mobDetailsGrid.classList.remove('gmaps-active');

    // 3. Remove active Google Overlay Layers from Map
    if (map) {
        if (trafficTileLayer && map.hasLayer(trafficTileLayer)) map.removeLayer(trafficTileLayer);
        if (transitTileLayer && map.hasLayer(transitTileLayer)) map.removeLayer(transitTileLayer);
        if (bikeTileLayer && map.hasLayer(bikeTileLayer)) map.removeLayer(bikeTileLayer);
        if (buildingsTileLayer && map.hasLayer(buildingsTileLayer)) map.removeLayer(buildingsTileLayer);
        if (streetViewCoverageLayer && map.hasLayer(streetViewCoverageLayer)) map.removeLayer(streetViewCoverageLayer);
        if (wildfireTileLayer && map.hasLayer(wildfireTileLayer)) map.removeLayer(wildfireTileLayer);
        if (airQualityTileLayer && map.hasLayer(airQualityTileLayer)) map.removeLayer(airQualityTileLayer);
    }
    isTrafficLayerActive = false;
    isTransitLayerActive = false;
    isBikeLayerActive = false;
    is3DBuildingsActive = false;
    isStreetViewActive = false;
    isWildfireActive = false;
    isAirQualityActive = false;
    try {
        localStorage.removeItem('seismo_traffic_active');
        localStorage.removeItem('seismo_transit_active');
        localStorage.removeItem('seismo_bike_active');
        localStorage.removeItem('seismo_3d_active');
        localStorage.removeItem('seismo_sv_active');
        localStorage.removeItem('seismo_wildfire_active');
        localStorage.removeItem('seismo_aq_active');
    } catch(e){}
}

function updateGmapsVersionUI() {
    if (isGmapsFeatureUnlocked) {
        injectGoogleMapsVersionUI();
    } else {
        purgeGoogleMapsVersionUI();
    }
}

function unlockGoogleMapsVersionFeature(silent = false) {
    isGmapsFeatureUnlocked = true;
    try { localStorage.setItem('_sg_vstate', '1'); } catch(e){}
    updateGmapsVersionUI();
    if (!silent && typeof showToastNotification === 'function') {
        showToastNotification("🔓 Menu 'Google Maps Version' Terbuka di Setelan!");
    }
    if (!silent && typeof openDesktopSettings === 'function') {
        openDesktopSettings();
    }
}

function lockGoogleMapsVersionFeature(silent = false) {
    isGmapsFeatureUnlocked = false;
    isGoogleMapsEngineActive = false;
    try {
        localStorage.setItem('_sg_vstate', '0');
        localStorage.setItem('_sg_engine', '0');
    } catch(e){}

    updateGmapsVersionUI();

    // Kembalikan peta ke provider standar
    if (typeof applyMapLayer === 'function') {
        applyMapLayer(currentMapLayer || 'light');
    }

    if (!silent && typeof showToastNotification === 'function') {
        showToastNotification("🔒 Fitur 'Google Maps Version' Telah Dinonaktifkan & Disembunyikan.");
    }
}

function toggleGoogleMapsEngineMode() {
    isGoogleMapsEngineActive = !isGoogleMapsEngineActive;
    try { localStorage.setItem('_sg_engine', isGoogleMapsEngineActive ? '1' : '0'); } catch(e){}
    updateGmapsVersionUI();

    // Terapkan ulang layer aktif dengan engine baru
    if (typeof applyMapLayer === 'function') {
        applyMapLayer(currentMapLayer || 'light');
    }

    if (typeof showToastNotification === 'function') {
        showToastNotification(isGoogleMapsEngineActive 
            ? "🗺️ Engine Peta Asli Google Maps Diaktifkan!" 
            : "🗺️ Engine Peta Standar Diaktifkan");
    }
}

// Handler Secret Tap Mobile (5x ketuk pada judul Setelan)
let secretTapCount = 0;
let secretTapTimer = null;

function handleSecretTap() {
    secretTapCount++;
    if (secretTapTimer) clearTimeout(secretTapTimer);

    if (secretTapCount >= 5) {
        secretTapCount = 0;
        if (!isGmapsFeatureUnlocked) {
            unlockGoogleMapsVersionFeature();
        } else {
            lockGoogleMapsVersionFeature();
        }
        return;
    }

    secretTapTimer = setTimeout(() => {
        secretTapCount = 0;
    }, 2000);
}

// Global Secret Keystroke Listener ("1234ulix12" untuk unlock, "off" untuk lock)
let secretKeyBuffer = '';
const SECRET_UNLOCK_CODE = '1234ulix12';
const SECRET_LOCK_CODE = 'off';

window.addEventListener('keydown', (e) => {
    // Abaikan jika user sedang mengetik di input, textarea, dsb
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
        return;
    }

    if (e.key && e.key.length === 1) {
        secretKeyBuffer += e.key.toLowerCase();
        if (secretKeyBuffer.length > 25) {
            secretKeyBuffer = secretKeyBuffer.slice(-25);
        }

        if (secretKeyBuffer.endsWith(SECRET_UNLOCK_CODE)) {
            secretKeyBuffer = '';
            unlockGoogleMapsVersionFeature();
        } else if (secretKeyBuffer.endsWith(SECRET_LOCK_CODE)) {
            secretKeyBuffer = '';
            lockGoogleMapsVersionFeature();
        }
    }
});

function getTileLayer(layerName) {
    if (isGoogleMapsEngineActive) {
        if (layerName === 'sat') {
            return getGoogleMapsTileLayer(isSatelliteLabelsEnabled ? 'y' : 's');
        } else if (layerName === 'terrain') {
            return getGoogleMapsTileLayer('p');
        } else if (layerName === 'dark') {
            return getGoogleMapsTileLayer('m', true);
        } else {
            return getGoogleMapsTileLayer('m');
        }
    }

    if (!tileLayersCache[layerName]) {
        if (layerName === 'sat') {
            tileLayersCache.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                ...tileCommonOptions,
                maxZoom: 18
            });
        } else if (layerName === 'terrain') {
            tileLayersCache.terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                ...tileCommonOptions,
                maxZoom: 17
            });
        } else if (layerName === 'dark') {
            tileLayersCache.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                ...tileCommonOptions,
                maxZoom: 19,
                subdomains: 'abcd'
            });
        } else {
            tileLayersCache.light = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                ...tileCommonOptions,
                maxZoom: 19,
                subdomains: 'abcd'
            });
        }
    }
    return tileLayersCache[layerName];
}

// Lapisan Label Transparan Resmi Esri (Nama Kota, Jalan, Batas Wilayah)
const satelliteLabelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    ...tileCommonOptions,
    maxZoom: 18,
    pane: 'overlayPane'
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

const LAYER_TRIGGER_SVGS = {
    sat: `<svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <defs>
            <clipPath id="sqClipTrigSat"><rect width="64" height="64"/></clipPath>
            <linearGradient id="satTrigLGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#4a5d4e"/>
                <stop offset="50%" stop-color="#2d3e32"/>
                <stop offset="100%" stop-color="#5c6d54"/>
            </linearGradient>
            <linearGradient id="satTrigFGrad" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stop-color="#697762"/>
                <stop offset="100%" stop-color="#3d4c38"/>
            </linearGradient>
        </defs>
        <g clip-path="url(#sqClipTrigSat)">
            <rect width="64" height="64" fill="url(#satTrigLGrad)"/>
            <path d="M0 0 L40 0 L28 28 L0 20 Z" fill="url(#satTrigFGrad)" opacity="0.9"/>
            <path d="M38 34 L64 26 L64 64 L24 64 Z" fill="#384534" opacity="0.95"/>
            <path d="M0 24 L24 30 L16 64 L0 64 Z" fill="#58674f"/>
            <path d="M-6 48 Q22 42 42 22 Q54 10 70 4" stroke="#2b2d2f" stroke-width="7" fill="none" stroke-linecap="round"/>
            <path d="M-6 48 Q22 42 42 22 Q54 10 70 4" stroke="#686b6e" stroke-width="5" fill="none" stroke-linecap="round"/>
            <path d="M-6 48 Q22 42 42 22 Q54 10 70 4" stroke="#ffffff" stroke-width="1.2" stroke-dasharray="3,3" fill="none"/>
            <path d="M-4 56 Q24 50 48 28 Q58 16 72 10" stroke="#2b2d2f" stroke-width="5.5" fill="none" stroke-linecap="round"/>
            <path d="M-4 56 Q24 50 48 28 Q58 16 72 10" stroke="#686b6e" stroke-width="4" fill="none" stroke-linecap="round"/>
            <path d="M32 66 Q36 44 58 36" stroke="#9aa0a6" stroke-width="2.5" fill="none"/>
        </g>
    </svg>`,
    terrain: `<svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <defs>
            <clipPath id="sqClipTrigTerr"><rect width="64" height="64"/></clipPath>
            <linearGradient id="terrTrigGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#d4dec8"/>
                <stop offset="50%" stop-color="#b6c8a7"/>
                <stop offset="100%" stop-color="#9cb08d"/>
            </linearGradient>
        </defs>
        <g clip-path="url(#sqClipTrigTerr)">
            <rect width="64" height="64" fill="url(#terrTrigGrad)"/>
            <path d="M-10 64 Q10 40 26 44 Q42 48 64 24 L64 64 Z" fill="#889c79" opacity="0.75"/>
            <path d="M-10 42 Q14 26 30 32 Q46 38 68 14 L68 0 L-10 0 Z" fill="#e8eee0" opacity="0.8"/>
            <path d="M12 64 Q28 36 46 34 Q58 32 74 16 L74 64 Z" fill="#758866" opacity="0.6"/>
            <path d="M-6 24 Q18 12 36 18 Q50 24 70 6" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
            <path d="M-8 46 Q18 36 34 40 Q48 44 70 20" stroke="#ffffff" stroke-width="4.5" fill="none" stroke-linecap="round"/>
            <path d="M22 66 Q36 38 52 36 Q62 34 76 22" stroke="#ffffff" stroke-width="3.5" fill="none" stroke-linecap="round"/>
            <path d="M4 64 Q22 48 28 32 Q32 18 30 -4" stroke="#a0b490" stroke-width="1.8" fill="none" stroke-dasharray="2,2"/>
        </g>
    </svg>`,
    dark: `<svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <defs>
            <clipPath id="sqClipTrigDark"><rect width="64" height="64"/></clipPath>
            <linearGradient id="darkTrigGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#1e222d"/>
                <stop offset="50%" stop-color="#151922"/>
                <stop offset="100%" stop-color="#0f1117"/>
            </linearGradient>
        </defs>
        <g clip-path="url(#sqClipTrigDark)">
            <rect width="64" height="64" fill="url(#darkTrigGrad)"/>
            <path d="M-10 64 L-10 16 Q18 22 28 32 Q38 42 46 36 Q54 30 74 38 L74 64 Z" fill="#242b38"/>
            <path d="M-10 -10 L74 -10 L74 20 Q56 12 40 22 Q24 32 10 18 Q0 8 -10 12 Z" fill="#1b202a"/>
            <path d="M-5 45 Q20 38 48 58" stroke="#374151" stroke-width="4.5" fill="none" stroke-linecap="round"/>
            <path d="M26 12 Q32 30 38 66" stroke="#374151" stroke-width="4.5" fill="none" stroke-linecap="round"/>
            <path d="M-6 26 Q18 20 36 34 Q50 44 68 36" stroke="#4f46e5" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.8"/>
            <path d="M14 66 Q20 40 38 24 Q52 12 70 8" stroke="#38bdf8" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.85"/>
        </g>
    </svg>`,
    light: `<svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <defs>
            <clipPath id="sqClipTrigDef"><rect width="64" height="64"/></clipPath>
        </defs>
        <g clip-path="url(#sqClipTrigDef)">
            <rect width="64" height="64" fill="#aadaff"/>
            <path d="M-10 64 L-10 16 Q18 22 28 32 Q38 42 46 36 Q54 30 74 38 L74 64 Z" fill="#cbe6a3"/>
            <path d="M-10 -10 L74 -10 L74 20 Q56 12 40 22 Q24 32 10 18 Q0 8 -10 12 Z" fill="#e8f0d8"/>
            <path d="M8 32 Q14 26 22 34 Q18 44 10 40 Z" fill="#b7df94"/>
            <path d="M42 42 Q50 36 58 44 Q52 56 40 52 Z" fill="#b7df94"/>
            <path d="M-5 45 Q20 38 48 58" stroke="#ffffff" stroke-width="4.5" fill="none" stroke-linecap="round"/>
            <path d="M26 12 Q32 30 38 66" stroke="#ffffff" stroke-width="4.5" fill="none" stroke-linecap="round"/>
            <path d="M-6 26 Q18 20 36 34 Q50 44 68 36" stroke="#ffffff" stroke-width="6.5" fill="none" stroke-linecap="round"/>
            <path d="M-6 26 Q18 20 36 34 Q50 44 68 36" stroke="#8ab4f8" stroke-width="4.5" fill="none" stroke-linecap="round"/>
            <path d="M14 66 Q20 40 38 24 Q52 12 70 8" stroke="#ffffff" stroke-width="6" fill="none" stroke-linecap="round"/>
            <path d="M14 66 Q20 40 38 24 Q52 12 70 8" stroke="#fbbc04" stroke-width="4" fill="none" stroke-linecap="round"/>
        </g>
    </svg>`
};

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
    const cardSvgBg = document.getElementById("layerCardSvgBg");
    const badge = document.getElementById("layerBadgeText");
    if (badge) badge.innerText = "Lapisan";
    if (card) card.style.backgroundImage = 'none';

    // Update active highlight on desktop popup drawer options
    ['layerOptLight', 'layerOptSat', 'layerOptDark', 'layerOptTerrain'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
    // Update active highlight on mobile bottom sheet base layer options
    ['mobLayerOptLight', 'mobLayerOptSat', 'mobLayerOptTerrain', 'mobLayerOptDark'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    if (layerName === 'sat') {
        // Thumbnail menampilkan preview lapisan berikutnya (Medan)
        if (cardSvgBg) cardSvgBg.innerHTML = LAYER_TRIGGER_SVGS.terrain;
        const opt = document.getElementById("layerOptSat");
        if (opt) opt.classList.add('active');
        const mobOpt = document.getElementById("mobLayerOptSat");
        if (mobOpt) mobOpt.classList.add('active');
    } else if (layerName === 'terrain') {
        // Thumbnail menampilkan preview lapisan berikutnya (Gelap)
        if (cardSvgBg) cardSvgBg.innerHTML = LAYER_TRIGGER_SVGS.dark;
        const opt = document.getElementById("layerOptTerrain");
        if (opt) opt.classList.add('active');
        const mobOpt = document.getElementById("mobLayerOptTerrain");
        if (mobOpt) mobOpt.classList.add('active');
    } else if (layerName === 'dark') {
        // Thumbnail menampilkan preview lapisan berikutnya (Standar)
        if (cardSvgBg) cardSvgBg.innerHTML = LAYER_TRIGGER_SVGS.light;
        const opt = document.getElementById("layerOptDark");
        if (opt) opt.classList.add('active');
        const mobOpt = document.getElementById("mobLayerOptDark");
        if (mobOpt) mobOpt.classList.add('active');
    } else {
        // default: light / standar
        // Thumbnail menampilkan preview lapisan berikutnya (Satelit) persis seperti Google Maps
        if (cardSvgBg) cardSvgBg.innerHTML = LAYER_TRIGGER_SVGS.sat;
        const opt = document.getElementById("layerOptLight");
        if (opt) opt.classList.add('active');
        const mobOpt = document.getElementById("mobLayerOptLight");
        if (mobOpt) mobOpt.classList.add('active');
    }

    currentMapLayer = layerName;
    localStorage.setItem('seismo_layer', layerName);
    document.body.classList.toggle('layer-sat-active', layerName === 'sat');
    if (layerName !== 'sat' && (isMap3DActive || currentMapBearing !== 0)) {
        resetMapOrientation();
    }
    updateSatelliteLabelsLayer();
    updateSatelliteLabelsUI();
    if (typeof updateLayerDetailUI === 'function') updateLayerDetailUI();
    setTimeout(() => { map.invalidateSize(); }, 50);
    if (typeof updateUrlHashFromMap === 'function') updateUrlHashFromMap();
    if (typeof updateMeasureTheme === 'function') updateMeasureTheme();
}

// ==================== GOOGLE MAPS 3D TILT & COMPASS CONTROLS ====================
let isMap3DActive = false;
let currentMapBearing = 0;
let currentCompassNeedleAngle = -1080;

// Expand tile loading bounds in all directions to prevent missing tiles on 3D tilt and rotation
if (typeof L !== 'undefined' && L.GridLayer) {
    L.GridLayer.include({
        _getTiledPixelBounds: function (center) {
            const map = this._map;
            const mapZoom = map._animatingZoom ? Math.max(map._animateToZoom, map.getZoom()) : map.getZoom();
            const scale = map.getZoomScale(mapZoom, this._tileZoom);
            const pixelCenter = map.project(center, this._tileZoom).floor();
            const halfSize = map.getSize().divideBy(scale * 2);
            const padMultiplier = 1.25;
            return new L.Bounds(
                pixelCenter.subtract(halfSize.multiplyBy(padMultiplier)),
                pixelCenter.add(halfSize.multiplyBy(padMultiplier))
            );
        }
    });
}

// Rotate drag delta vector by -currentMapBearing to maintain natural 1:1 mouse movement direction
if (typeof L !== 'undefined' && L.Draggable) {
    const origOnMove = L.Draggable.prototype._onMove;
    L.Draggable.prototype._onMove = function (e) {
        if (currentMapBearing !== 0 && this._startPoint) {
            const first = (e.touches && e.touches.length) ? e.touches[0] : e;
            const rawPoint = new L.Point(first.clientX, first.clientY);
            const dx = rawPoint.x - this._startPoint.x;
            const dy = rawPoint.y - this._startPoint.y;
            const rad = (-currentMapBearing * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const rotDx = dx * cos - dy * sin;
            const rotDy = dx * sin + dy * cos;
            
            this._newPos = this._startPos.add(new L.Point(rotDx, rotDy));
            this.fire('predrag');
            L.DomUtil.setPosition(this._element, this._newPos);
            this.fire('drag');
            return;
        }
        origOnMove.call(this, e);
    };
}

// Intercept wheel zoom when 3D or rotation is active to zoom straight into map center smoothly
document.addEventListener('wheel', function (e) {
    if (typeof map === 'undefined' || !map) return;
    if (!isMap3DActive && currentMapBearing === 0) return;
    
    const stage = document.getElementById("map3DStage");
    if (!stage || !stage.contains(e.target)) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const delta = e.deltaY;
    if (Math.abs(delta) < 10) return;
    
    const now = Date.now();
    if (map._lastCustomWheel && now - map._lastCustomWheel < 80) return;
    map._lastCustomWheel = now;
    
    const currentZoom = map.getZoom();
    const step = 0.5;
    if (delta < 0) {
        map.setZoomAround(map.getCenter(), Math.min(map.getMaxZoom(), currentZoom + step));
    } else {
        map.setZoomAround(map.getCenter(), Math.max(map.getMinZoom(), currentZoom - step));
    }
}, { passive: false, capture: true });

function toggleMap3DMode() {
    isMap3DActive = !isMap3DActive;
    const tiltBtn = document.getElementById("gmapTiltBtn");
    const tiltLabel = document.getElementById("gmapTiltLabel");
    
    if (tiltBtn) {
        tiltBtn.setAttribute("aria-checked", isMap3DActive ? "true" : "false");
        tiltBtn.title = isMap3DActive ? "Kembali ke tampilan 2D datar" : "Miringkan tampilan (3D)";
    }
    if (tiltLabel) {
        tiltLabel.textContent = isMap3DActive ? "2D" : "3D";
    }
    
    updateMapTransform();
}

function rotateMap(deltaAngle) {
    // deltaAngle is -90 for left, +90 for right
    currentCompassNeedleAngle += deltaAngle;
    
    currentMapBearing = (currentMapBearing - deltaAngle) % 360;
    if (currentMapBearing < 0) currentMapBearing += 360;
    
    updateMapTransform();
}

function resetMapOrientation() {
    currentMapBearing = 0;
    // Align needle smoothly back to 0° baseline (-1080deg or nearest 360 multiple)
    const remainder = currentCompassNeedleAngle % 360;
    if (remainder !== 0) {
        currentCompassNeedleAngle = currentCompassNeedleAngle - remainder;
    }
    isMap3DActive = false;
    
    const tiltBtn = document.getElementById("gmapTiltBtn");
    const tiltLabel = document.getElementById("gmapTiltLabel");
    
    if (tiltBtn) {
        tiltBtn.setAttribute("aria-checked", "false");
        tiltBtn.title = "Miringkan tampilan (3D)";
    }
    if (tiltLabel) {
        tiltLabel.textContent = "3D";
    }
    
    updateMapTransform();
}

function updateMapTransform() {
    const needle = document.getElementById("gmapCompassNeedle");
    if (needle) {
        needle.style.transform = `rotate(${currentCompassNeedleAngle}deg)`;
        const ariaVal = (360 - currentMapBearing) % 360;
        needle.setAttribute("aria-valuenow", ariaVal.toString());
        if (currentMapBearing === 0) {
            needle.setAttribute("disabled", "");
        } else {
            needle.removeAttribute("disabled");
        }
    }
    
    const stage = document.getElementById("map3DStage");
    const mapEl = document.getElementById("map");
    if (!stage || !mapEl) return;
    
    const isTransformed = isMap3DActive || currentMapBearing !== 0;
    stage.classList.toggle("map-3d-active", isTransformed);
    
    if (isTransformed) {
        const tiltX = isMap3DActive ? 42 : 0;
        const translateY = isMap3DActive ? -35 : 0;
        const scale = isMap3DActive ? 1.15 : 1;
        mapEl.style.transform = `translateY(${translateY}px) scale(${scale}) rotateX(${tiltX}deg) rotateZ(${currentMapBearing}deg)`;
    } else {
        mapEl.style.transform = '';
    }
    
    setTimeout(() => {
        if (typeof map !== 'undefined' && map && typeof map.invalidateSize === 'function') {
            map.invalidateSize();
        }
    }, 60);
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
        maxWidth: 360,
        className: 'custom-area-popup'
    }).openPopup();
}

function formatAccuracyText(acc) {
    if (!acc || isNaN(acc)) return "Lokasi Anda (GPS)";
    const rounded = Math.round(acc);
    if (rounded < 1000) {
        return `Lokasi Anda (GPS) • ±${rounded}m`;
    } else {
        const km = Math.round(rounded / 1000);
        return `Perkiraan Lokasi (Jaringan) • ±${km} km`;
    }
}

function updateGPSMarker(lat, lon, accuracy = 50, pan = false) {
    userCoords = [lat, lon];
    hasUserGPS = true;

    let placeObj = userPlaceObj || { main: "Batam", admin: "Kota Batam", province: "Kepulauan Riau" };
    const accText = formatAccuracyText(accuracy);
    const popupHtml = createAreaPopupHTML(placeObj, lat, lon, accText);

    if (!gpsMarker) {
        gpsMarker = L.marker([lat, lon], { icon: gpsPulseIcon, zIndexOffset: 1000 }).addTo(map);
        gpsMarker.bindPopup(popupHtml, { maxWidth: 360, className: 'custom-area-popup' });
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
    if (typeof updateGmapsVersionUI === 'function') updateGmapsVersionUI();
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

    const savedSpan = document.getElementById("railSavedIconSpan");
    if (savedSpan) savedSpan.classList.toggle("NhBTye", currentNavTab === 'saved' && !isPanelCollapsed);
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

    // 4. USGS Real-time API (Wilayah Indonesia 30 Hari + Feed Global saat isGlobalQuakeMode aktif)
    try {
        // A. SELALU ambil katalog 30 hari khusus teritori Indonesia dari USGS (agar data historis mikro Indonesia 100% lengkap)
        const now = new Date();
        const pastDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        const startTimeStr = pastDate.toISOString().split('T')[0];
        const usgsIndoUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${startTimeStr}&minmagnitude=1.0&minlatitude=-11&maxlatitude=6&minlongitude=95&maxlongitude=141`;

        const fetchPromises = [fetch(usgsIndoUrl)];

        // B. Jika Mode Gempa Seluruh Dunia AKTIF, tambahkan feed USGS Global (24 jam M2.5+ & 7 hari M4.5+)
        if (isGlobalQuakeMode) {
            fetchPromises.push(fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"));
            fetchPromises.push(fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson"));
        }

        const usgsResponses = await Promise.allSettled(fetchPromises);

        // Proses Respons Indonesia 30 Hari
        if (usgsResponses[0] && usgsResponses[0].status === 'fulfilled' && usgsResponses[0].value.ok) {
            const dataIndo = await usgsResponses[0].value.json();
            if (dataIndo.features && dataIndo.features.length > 0) {
                dataIndo.features.forEach(f => {
                    if (!f.geometry || !f.geometry.coordinates) return;
                    let [lon, lat, depth] = f.geometry.coordinates;
                    let timeStr = new Date(f.properties.time).toLocaleString('id-ID');
                    let mag = parseFloat(f.properties.mag) || 0;
                    let place = f.properties.place || "";

                    const pLow = place.toLowerCase();
                    const isForeign = [
                        "philippines", "mindanao", "sarangani", "davao", "cotabato", "zamboanga", "manila", "visayas", "luzon", "generalsantos",
                        "malaysia", "sabah", "sarawak", "kuala lumpur", "penang", "johor",
                        "papua new guinea", "new britain", "bougainville", "port moresby",
                        "timor-leste", "east timor", "dili",
                        "brunei", "singapore", "australia", "thailand", "vietnam"
                    ].some(country => pLow.includes(country));

                    if (isForeign) return;
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
                        priority: 4
                    });
                });
            }
        }

        // Proses Respons Global jika aktif
        if (isGlobalQuakeMode) {
            for (let i = 1; i < usgsResponses.length; i++) {
                if (usgsResponses[i] && usgsResponses[i].status === 'fulfilled' && usgsResponses[i].value.ok) {
                    const dataGlobal = await usgsResponses[i].value.json();
                    if (dataGlobal.features) {
                        dataGlobal.features.forEach(f => {
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
                    }
                }
            }
        }
    } catch (err) {
        console.warn("USGS fetch warning:", err);
    }

    // Deduplikasi Pintar & Penggabungan Multi-Sumber (Prioritas BMKG > USGS)
    // Urutkan rawQuakes berdasarkan prioritas (1=BMKG AutoGempa, 2=BMKG M5+, 3=BMKG Dirasakan, 4=USGS Indo, 5=USGS Global)
    rawQuakes.sort((a, b) => (a.priority || 99) - (b.priority || 99));

    const uniqueQuakes = [];
    rawQuakes.forEach(item => {
        if (!item.lat || !item.lon || isNaN(item.lat) || isNaN(item.lon)) return;

        const existingIdx = uniqueQuakes.findIndex(existing => {
            const dist = calcDistance(existing.lat, existing.lon, item.lat, item.lon);
            const timeSame = existing.time === item.time || (existing.iso && item.iso && Math.abs(new Date(existing.iso).getTime() - new Date(item.iso).getTime()) < 30 * 60 * 1000);
            return dist < 35 && (timeSame || Math.abs(existing.mag - item.mag) < 0.35);
        });

        if (existingIdx === -1) {
            uniqueQuakes.push(item);
        } else {
            // Gabungkan metadata: Jika entri prioritas utama kekurangan informasi tambahan, lengkapi dari feed kedua
            let existing = uniqueQuakes[existingIdx];
            if (!existing.potensi && item.potensi) existing.potensi = item.potensi;
            if ((!existing.dirasakan || existing.dirasakan === '-') && item.dirasakan && item.dirasakan !== '-') {
                existing.dirasakan = item.dirasakan;
            }
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

// ==================== TEXT NORMALIZATION (POTENSI & STATUS GEMPA) ====================
function cleanPotensiText(rawPotensi, isSpeech = false) {
    if (!rawPotensi || typeof rawPotensi !== 'string' || rawPotensi.trim() === '-' || rawPotensi.trim() === '') {
        return isSpeech ? "Gempa ini tidak berpotensi tsunami." : "Tidak berpotensi tsunami";
    }

    let p = rawPotensi.trim();

    // Normalisasi teks aneh birokrasi BMKG: "Gempa ini dirasakan untuk diteruskan pada masyarakat"
    if (/dirasakan untuk diteruskan/i.test(p) || /diteruskan pada masyarakat/i.test(p)) {
        return isSpeech
            ? "Gempa ini dirasakan oleh masyarakat di sekitar pusat gempa dan tidak berpotensi tsunami."
            : "Informasi resmi: Gempa dirasakan oleh masyarakat";
    }

    if (/tidak berpotensi tsunami/i.test(p)) {
        return isSpeech ? "Gempa ini tidak berpotensi tsunami." : "Tidak berpotensi tsunami";
    }

    if (/berpotensi tsunami/i.test(p) && !/tidak/i.test(p)) {
        return isSpeech ? "Peringatan dini: Gempa ini berpotensi menimbulkan tsunami!" : "⚠️ Berpotensi Tsunami";
    }

    return p;
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
    const cleanPotensi = cleanPotensiText(potensi, false);
    const safePotensi = escapeQuotes(cleanPotensi);

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
            ${cleanPotensi ? `<div class="quake-popup-alert-potensi">🛡️ ${cleanPotensi}</div>` : ''}
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
    const cleanPot = cleanPotensiText(potensi, false);
    const text = `⚠️ *INFORMASI GEMPA BUMI*\n📍 *Lokasi:* ${place}\n💥 *Magnitudo:* M ${magVal}\n🕒 *Waktu:* ${time}\n🌊 *Kedalaman:* ${depth} | ${cleanPot}\n\n🌐 *Pantau Langsung Live Seismograf:*\nhttps://seismik.gracely.my.id/`;
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
    const rawVal = (val || "").trim().toLowerCase();
    if (rawVal === SECRET_UNLOCK_CODE) {
        clearSearch();
        unlockGoogleMapsVersionFeature();
        return;
    } else if (rawVal === SECRET_LOCK_CODE) {
        clearSearch();
        lockGoogleMapsVersionFeature();
        return;
    }

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
        const input = document.getElementById("searchInput");
        const val = (input ? input.value : "").trim().toLowerCase();
        if (val === SECRET_UNLOCK_CODE) {
            clearSearch();
            unlockGoogleMapsVersionFeature();
            return;
        } else if (val === SECRET_LOCK_CODE) {
            clearSearch();
            lockGoogleMapsVersionFeature();
            return;
        }
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

// ==================== STATE FILTER CHIPS TAB DISIMPAN ====================
let savedFilterSearch = '';
let savedFilterRegion = 'all';
let savedFilterCategory = 'all';
let savedFilterSort = 'default';
let savedViewMode = 'saved'; // 'saved' atau 'history'
let activeSavedDropdownType = null;

const INDONESIA_REGION_PROVINCES = {
    sumatera: ['aceh', 'sumatera utara', 'sumatera barat', 'riau', 'kepulauan riau', 'jambi', 'sumatera selatan', 'bengkulu', 'lampung', 'bangka belitung', 'sibolga', 'padang', 'pekanbaru', 'medan', 'batam'],
    jawa: ['dki jakarta', 'jakarta', 'jawa barat', 'jawa tengah', 'daerah istimewa yogyakarta', 'yogyakarta', 'jawa timur', 'banten', 'bandung', 'semarang', 'surabaya'],
    kalimantan: ['kalimantan barat', 'kalimantan tengah', 'kalimantan selatan', 'kalimantan timur', 'kalimantan utara', 'pontianak', 'banjarmasin', 'samarinda', 'balikpapan', 'ikn', 'nusantara'],
    sulawesi: ['sulawesi utara', 'sulawesi tengah', 'sulawesi selatan', 'sulawesi tenggara', 'gorontalo', 'sulawesi barat', 'makassar', 'manado', 'palu', 'kendar'],
    balinusra: ['bali', 'nusa tenggara barat', 'nusa tenggara timur', 'denpasar', 'mataram', 'kupang', 'lombok'],
    papuamaluku: ['maluku', 'maluku utara', 'papua', 'papua barat', 'papua selatan', 'papua tengah', 'papua pegunungan', 'papua barat daya', 'ambon', 'ternate', 'jayapura']
};

function matchesRegionFilter(place, regionKey) {
    if (!regionKey || regionKey === 'all') return true;
    const provs = INDONESIA_REGION_PROVINCES[regionKey];
    if (!provs) return true;
    const textToCheck = `${place.province || ''} ${place.admin || ''} ${place.name || ''}`.toLowerCase();
    return provs.some(prov => textToCheck.includes(prov));
}

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

function removeRecentSearch(name, e) {
    if (e) e.stopPropagation();
    let list = getRecentSearches().filter(item => item.name.toLowerCase() !== name.toLowerCase());
    try {
        localStorage.setItem('seismo_recent_searches', JSON.stringify(list));
    } catch (err) { }
    renderSavedPlacesUI();
    renderRecentSearchesUI();
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

// ==================== INTERAKSI FILTER CHIPS DISIMPAN ====================
function toggleSavedInlineSearch() {
    const wrap = document.getElementById("savedInlineSearchWrap");
    const input = document.getElementById("savedInlineSearchInput");
    const chip = document.getElementById("chipSavedSearch");
    if (!wrap || !input) return;

    closeSavedChipsDropdown();

    if (wrap.style.display === "none" || wrap.style.display === "") {
        wrap.style.display = "block";
        if (chip) chip.classList.add("active");
        input.focus();
    } else {
        wrap.style.display = "none";
        if (chip && !savedFilterSearch) chip.classList.remove("active");
    }
}

function handleSavedPlacesSearch(val) {
    savedFilterSearch = (val || '').trim().toLowerCase();
    const clearBtn = document.getElementById("savedSearchClearBtn");
    if (clearBtn) clearBtn.style.display = savedFilterSearch ? "flex" : "none";
    const chip = document.getElementById("chipSavedSearch");
    if (chip) chip.classList.toggle("active", Boolean(savedFilterSearch));
    renderSavedPlacesUI();
}

function clearSavedInlineSearch() {
    const input = document.getElementById("savedInlineSearchInput");
    if (input) input.value = "";
    handleSavedPlacesSearch("");
}

function toggleSavedFilterDropdown(type, btnEl) {
    const dropdown = document.getElementById("savedChipsDropdown");
    if (!dropdown || !btnEl) return;

    if (activeSavedDropdownType === type && dropdown.style.display !== "none") {
        closeSavedChipsDropdown();
        return;
    }

    activeSavedDropdownType = type;
    document.querySelectorAll(".gmap-dropdown-chip").forEach(c => c.classList.remove("open"));
    btnEl.classList.add("open");

    const checkSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="var(--accent-blue)" style="flex-shrink:0;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;

    let itemsHtml = '';
    if (type === 'region') {
        const regions = [
            { id: 'all', label: 'Semua Wilayah' },
            { id: 'sumatera', label: 'Sumatera' },
            { id: 'jawa', label: 'Jawa' },
            { id: 'kalimantan', label: 'Kalimantan' },
            { id: 'sulawesi', label: 'Sulawesi' },
            { id: 'balinusra', label: 'Bali & Nusa Tenggara' },
            { id: 'papuamaluku', label: 'Maluku & Papua' }
        ];
        itemsHtml = regions.map(r => `
            <button class="saved-chips-dropdown-item ${savedFilterRegion === r.id ? 'active' : ''}" onclick="applySavedRegionFilter('${r.id}', '${r.label}')">
                <span>${r.label}</span>
                ${savedFilterRegion === r.id ? checkSvg : ''}
            </button>
        `).join('');
    } else if (type === 'category') {
        const categories = [
            { id: 'all', label: 'Semua Status' },
            { id: 'safe', label: '🟢 Terpantau Aman' },
            { id: 'warning', label: '⚠️ Ada Aktivitas Gempa' }
        ];
        itemsHtml = categories.map(c => `
            <button class="saved-chips-dropdown-item ${savedFilterCategory === c.id ? 'active' : ''}" onclick="applySavedCategoryFilter('${c.id}', '${c.label}')">
                <span>${c.label}</span>
                ${savedFilterCategory === c.id ? checkSvg : ''}
            </button>
        `).join('');
    } else if (type === 'sort') {
        const sorts = [
            { id: 'default', label: 'Default' },
            { id: 'nearest', label: '📍 Terdekat dari Saya' },
            { id: 'newest', label: '🕒 Terbaru Ditambahkan' },
            { id: 'alphabet', label: '🔤 Nama (A - Z)' }
        ];
        itemsHtml = sorts.map(s => `
            <button class="saved-chips-dropdown-item ${savedFilterSort === s.id ? 'active' : ''}" onclick="applySavedSortFilter('${s.id}', '${s.label}')">
                <span>${s.label}</span>
                ${savedFilterSort === s.id ? checkSvg : ''}
            </button>
        `).join('');
    } else if (type === 'history') {
        const views = [
            { id: 'saved', label: '⭐ Tempat Tersimpan' },
            { id: 'history', label: '🕒 Histori Dikunjungi' }
        ];
        itemsHtml = views.map(v => `
            <button class="saved-chips-dropdown-item ${savedViewMode === v.id ? 'active' : ''}" onclick="applySavedViewMode('${v.id}', '${v.label}')">
                <span>${v.label}</span>
                ${savedViewMode === v.id ? checkSvg : ''}
            </button>
        `).join('');
    }

    dropdown.innerHTML = itemsHtml;
    dropdown.style.display = "flex";

    const parent = btnEl.closest('.section-container') || btnEl.parentElement;
    const parentRect = parent.getBoundingClientRect();
    const btnRect = btnEl.getBoundingClientRect();

    let top = btnRect.bottom - parentRect.top + 6;
    let left = btnRect.left - parentRect.left;

    if (left + 190 > parentRect.width) {
        dropdown.style.left = 'auto';
        dropdown.style.right = '6px';
    } else {
        dropdown.style.left = `${Math.max(6, left)}px`;
        dropdown.style.right = 'auto';
    }
    dropdown.style.top = `${top}px`;
}

function closeSavedChipsDropdown() {
    const dropdown = document.getElementById("savedChipsDropdown");
    if (dropdown) dropdown.style.display = "none";
    activeSavedDropdownType = null;
    document.querySelectorAll(".gmap-dropdown-chip").forEach(c => c.classList.remove("open"));
}

function applySavedRegionFilter(regionKey, label) {
    savedFilterRegion = regionKey;
    const labelEl = document.getElementById("chipSavedRegionLabel");
    const chip = document.getElementById("chipSavedRegion");
    if (labelEl) labelEl.innerText = regionKey === 'all' ? 'Wilayah' : label;
    if (chip) chip.classList.toggle("active", regionKey !== 'all');
    closeSavedChipsDropdown();
    renderSavedPlacesUI();
}

function applySavedCategoryFilter(catKey, label) {
    savedFilterCategory = catKey;
    const labelEl = document.getElementById("chipSavedCategoryLabel");
    const chip = document.getElementById("chipSavedCategory");
    if (labelEl) labelEl.innerText = catKey === 'all' ? 'Kategori' : (catKey === 'safe' ? 'Aman' : 'Gempa');
    if (chip) chip.classList.toggle("active", catKey !== 'all');
    closeSavedChipsDropdown();
    renderSavedPlacesUI();
}

function applySavedSortFilter(sortKey, label) {
    savedFilterSort = sortKey;
    const labelEl = document.getElementById("chipSavedSortLabel");
    const chip = document.getElementById("chipSavedSort");
    if (labelEl) labelEl.innerText = sortKey === 'default' ? 'Disimpan' : (label.includes('Terdekat') ? 'Terdekat' : (label.includes('Nama') ? 'A-Z' : 'Terbaru'));
    if (chip) chip.classList.toggle("active", sortKey !== 'default');
    closeSavedChipsDropdown();
    renderSavedPlacesUI();
}

function applySavedViewMode(viewMode, label) {
    savedViewMode = viewMode;
    const labelEl = document.getElementById("chipSavedHistoryLabel");
    const chip = document.getElementById("chipSavedHistory");
    if (labelEl) labelEl.innerText = viewMode === 'history' ? 'Histori' : 'Tersimpan';
    if (chip) chip.classList.toggle("active", viewMode === 'history');
    closeSavedChipsDropdown();
    renderSavedPlacesUI();
}

function initChipsDragScroll() {
    const row = document.getElementById("savedFilterChipsRow");
    if (!row) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let dragDist = 0;

    row.addEventListener('mousedown', (e) => {
        isDown = true;
        dragDist = 0;
        startX = e.pageX - row.offsetLeft;
        scrollLeft = row.scrollLeft;
    });

    window.addEventListener('mouseup', () => {
        if (isDown) {
            isDown = false;
            setTimeout(() => { dragDist = 0; }, 60);
        }
    });

    row.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const x = e.pageX - row.offsetLeft;
        const walk = (x - startX) * 1.5;
        dragDist = Math.abs(walk);
        if (dragDist > 4) {
            e.preventDefault();
            row.scrollLeft = scrollLeft - walk;
        }
    });

    // Support mouse wheel horizontal scroll
    row.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            row.scrollLeft += e.deltaY;
        }
    }, { passive: false });

    // Block button click if user was dragging
    row.addEventListener('click', (e) => {
        if (dragDist > 5) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }, true);
}

// Tutup dropdown filter chips saat klik di luar
document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest('#savedChipsDropdown') && !e.target.closest('.gmap-dropdown-chip')) {
        closeSavedChipsDropdown();
    }
});

function renderSavedPlacesUI() {
    const container = document.getElementById("savedPlacesList");
    const badge = document.getElementById("savedPlacesCountBadge");
    if (!container) return;

    // Ambil data berdasarkan view mode (Saved vs History)
    let rawItems = [];
    if (savedViewMode === 'history') {
        const recentSearches = getRecentSearches();
        rawItems = recentSearches.map((item, idx) => ({
            id: 'hist_' + idx,
            name: item.name,
            admin: '',
            province: '',
            lat: item.lat,
            lon: item.lon,
            temp: '28°C',
            time: item.time || 'Hari ini',
            isHistory: true
        }));
    } else {
        rawItems = getSavedPlaces();
    }

    if (badge) badge.innerText = `${rawItems.length} ${savedViewMode === 'history' ? 'riwayat' : 'disimpan'}`;

    // 1. Filter Pencarian Teks
    let filtered = rawItems.filter(p => {
        if (!savedFilterSearch) return true;
        const text = `${p.name} ${p.admin || ''} ${p.province || ''}`.toLowerCase();
        return text.includes(savedFilterSearch);
    });

    // 2. Filter Wilayah (Pulau/Region)
    filtered = filtered.filter(p => matchesRegionFilter(p, savedFilterRegion));

    // Hitung jarak gempa dan jarak GPS untuk setiap item
    filtered = filtered.map(p => {
        let nearestQuakeDist = null;
        let nearestMag = 0;
        quakesArray.forEach(q => {
            let d = calcDistance(p.lat, p.lon, q.lat, q.lon);
            if (nearestQuakeDist === null || d < nearestQuakeDist) {
                nearestQuakeDist = d;
                nearestMag = q.mag;
            }
        });

        let isWarning = nearestQuakeDist !== null && nearestQuakeDist <= 150 && nearestMag >= 4.5;
        let statusLabel = isWarning
            ? `⚠️ Gempa M${nearestMag.toFixed(1)} (${nearestQuakeDist} km)`
            : (nearestQuakeDist !== null ? `🟢 Terpantau Aman (${nearestQuakeDist} km)` : `🟢 Terpantau Aman`);

        let userDist = (userCoords && userCoords[0]) ? calcDistance(userCoords[0], userCoords[1], p.lat, p.lon) : 999999;

        return {
            ...p,
            nearestQuakeDist,
            nearestMag,
            isWarning,
            statusLabel,
            userDist
        };
    });

    // 3. Filter Kategori Status Gempa
    if (savedFilterCategory === 'safe') {
        filtered = filtered.filter(p => !p.isWarning);
    } else if (savedFilterCategory === 'warning') {
        filtered = filtered.filter(p => p.isWarning);
    }

    // 4. Pengurutan (Sortir)
    if (savedFilterSort === 'nearest') {
        filtered.sort((a, b) => a.userDist - b.userDist);
    } else if (savedFilterSort === 'alphabet') {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (savedFilterSort === 'newest') {
        filtered.reverse();
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="font-size:12px; color:var(--text-muted); text-align:center; padding:18px;">
                ${savedFilterSearch || savedFilterRegion !== 'all' || savedFilterCategory !== 'all'
                    ? 'Tidak ada lokasi yang cocok dengan filter yang dipilih.'
                    : (savedViewMode === 'history'
                        ? 'Belum ada histori lokasi yang dikunjungi.'
                        : 'Belum ada wilayah pantauan yang disimpan.<br>Klik tombol <b>＋ Simpan Wilayah Ini</b> untuk menambahkan.')}
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(p => {
        let safeName = escapeQuotes(p.name);
        let deleteAction = p.isHistory
            ? `removeRecentSearch('${safeName}', event)`
            : `removeSavedPlace('${p.id}', event)`;
        let deleteTitle = p.isHistory ? 'Hapus dari Histori' : 'Hapus dari Disimpan';
        let subText = p.isHistory
            ? `<span class="saved-place-status-dot"></span><span>🕒 ${p.time} · ${p.statusLabel}</span>`
            : `<span class="saved-place-status-dot ${p.isWarning ? 'warning' : ''}"></span><span>${p.statusLabel}</span>`;

        return `
            <div class="saved-place-card" onclick="flyToSavedPlace(${p.lat}, ${p.lon}, '${safeName}')">
                <div class="saved-place-info">
                    <div class="saved-place-name">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="var(--accent-red)"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                        <span>${p.name}</span>
                    </div>
                    <div class="saved-place-sub">
                        ${subText}
                    </div>
                </div>
                <div class="saved-place-right">
                    <div class="saved-place-weather">${p.temp || '28°C'}</div>
                    <button class="btn-item-delete" onclick="${deleteAction}" title="${deleteTitle}">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
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
    initChipsDragScroll();
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
        isPanelCollapsed = false;
        document.body.classList.remove("panel-collapsed");
        const panel = document.getElementById("mainPanel") || document.getElementById("panelContainer");
        if (panel) panel.classList.remove("collapsed");

        if (!isNavRailEnabled) {
            document.body.classList.add("nav-rail-disabled");
        } else {
            document.body.classList.remove("nav-rail-disabled");
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

    // Listener klik di luar area (Click Outside) untuk menutup cards-scroll-wrap pada Desktop
    document.addEventListener("pointerdown", (e) => {
        if (window.innerWidth <= 768) return;
        if (!isPanelCollapsed) {
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

    // Listener tombol ESC keyboard untuk menutup Settings Drawer dan Modal (tanpa menutup sidebar)
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeDesktopSettings();
            closeShareModal();
            closeLanguageModal();
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

async function getQuakeLocationDetail(lat, lon, fallbackPlace) {
    let placeSpeech = (fallbackPlace || "Wilayah Indonesia").trim();

    // Normalisasi singkatan arah mata angin & unit untuk ucapan yang fasih
    placeSpeech = placeSpeech
        .replace(/\bkm\b/gi, 'kilometer')
        .replace(/\bS of\b/gi, 'Selatan')
        .replace(/\bN of\b/gi, 'Utara')
        .replace(/\bW of\b/gi, 'Barat')
        .replace(/\bE of\b/gi, 'Timur')
        .replace(/\bSW of\b/gi, 'Barat Daya')
        .replace(/\bNW of\b/gi, 'Barat Laut')
        .replace(/\bSE of\b/gi, 'Tenggara')
        .replace(/\bNE of\b/gi, 'Timur Laut')
        .replace(/\bTimurLaut\b/gi, 'Timur Laut')
        .replace(/\bBaratDaya\b/gi, 'Barat Daya')
        .replace(/\bBaratLaut\b/gi, 'Barat Laut')
        .replace(/\bTenggara\b/gi, 'Tenggara')
        .replace(/\bKab\.\b/gi, 'Kabupaten ')
        .replace(/\bKec\.\b/gi, 'Kecamatan ');

    // Cek apakah fallbackPlace sudah menyebutkan darat secara eksplisit
    let isExplicitLand = /di darat/i.test(fallbackPlace);
    let isExplicitSea = /di laut/i.test(fallbackPlace);

    let resObj = {
        isLand: isExplicitLand,
        village: "",
        district: "",
        city: "",
        province: "",
        detailNarrative: "",
        placeSpeech: placeSpeech
    };

    // Panggil reverse geocoding cepat dengan timeout 1200ms saat sirene awal berbunyi
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            if (data && data.address) {
                const addr = data.address;
                const formatted = typeof formatIndonesianPlace === 'function' ? formatIndonesianPlace(addr, lat, lon) : null;

                let village = addr.village || addr.suburb || addr.neighbourhood || addr.hamlet || addr.quarter || addr.residential || "";
                let district = addr.district || addr.city_district || addr.county_subdivision || addr.municipality || addr.subdistrict || "";
                let city = addr.county || addr.city || addr.town || addr.regency || "";
                let prov = addr.state || addr.province || addr.region || "";

                village = village.replace(/^(Kelurahan|Desa|Gampong|Nagari|Dusun|Pekan)\s+/i, '').trim();
                district = district.replace(/^(Kecamatan|Kec\.)\s+/i, '').trim();
                city = city.replace(/^(Kabupaten|Kab\.|Kota)\s+/i, '').trim();

                if (formatted && typeof formatted === 'object') {
                    if (formatted.province) prov = formatted.province;
                }

                // Jika ada nama desa, kelurahan, kecamatan, atau kota, berarti koordinat episenter berada di DARATAN
                if (village || district || city) {
                    resObj.isLand = true;
                    resObj.village = village;
                    resObj.district = district;
                    resObj.city = city;
                    resObj.province = prov;

                    let parts = [];
                    if (village) parts.push(`Desa atau Kelurahan ${village}`);
                    if (district) parts.push(`Kecamatan ${district}`);
                    if (city) parts.push(`Kabupaten atau Kota ${city}`);
                    if (prov) parts.push(`Provinsi ${prov}`);

                    resObj.detailNarrative = parts.join(', ');
                }
            }
        }
    } catch (e) {
        // Geocode fallback aman
    }

    if (!resObj.isLand && !isExplicitSea) {
        resObj.isLand = false;
    }

    return resObj;
}

async function broadcastQuakeEvent(q, isAutoTrigger = false) {
    if (!q || isMuted) return;

    const btn = document.getElementById("btnAutoBroadcast");
    const txt = document.getElementById("autoBroadcastText");

    const mag = q.mag ? q.mag.toFixed(1) : "0";
    let depthSpeech = q.depth ? String(q.depth).replace(/\bkm\b/gi, 'kilometer') : "10 kilometer";
    let potensiSpeech = cleanPotensiText(q.potensi, true);

    const dist = hasUserGPS ? calcDistance(userCoords[0], userCoords[1], q.lat, q.lon) : null;

    // 1. Bunyikan sirene peringatan awal
    playEmergencySiren();

    // 2. Arahkan peta ke lokasi gempa
    focusQuake(q.lat, q.lon);

    // 3. Update visual tombol siaran
    isBroadcastingAlert = true;
    if (btn) {
        btn.classList.add("speaking");
        if (txt) txt.innerText = "MENYIARKAN SUARA...";
        const icon = document.getElementById("autoBroadcastIcon");
        if (icon) icon.innerHTML = '&#xe047;';
    }

    // 4. Pindai lokasi detail desa / kecamatan / darat vs laut selama jeda sirene berbunyi
    const locDetail = await getQuakeLocationDetail(q.lat, q.lon, q.place);

    // 5. Rangkai naskah siaran suara yang fasih, detail, dan alami
    let speechText = isAutoTrigger ? `Peringatan gempa bumi baru terdeteksi! ` : `Peringatan gempa bumi terkini! `;
    speechText += `Gempa bumi bermagnitudo ${mag}. `;

    if (locDetail.isLand) {
        if (locDetail.detailNarrative) {
            speechText += `Pusat gempa berada di darat, tepatnya di ${locDetail.detailNarrative}, pada kedalaman ${depthSpeech}. `;
        } else {
            speechText += `Pusat gempa berada di darat, ${locDetail.placeSpeech}, pada kedalaman ${depthSpeech}. `;
        }
    } else {
        speechText += `Pusat gempa berada di laut, ${locDetail.placeSpeech}, pada kedalaman ${depthSpeech}. `;
    }

    speechText += `${potensiSpeech} `;

    if (dist !== null) {
        speechText += `Pusat gempa berjarak sekitar ${dist} kilometer dari posisi Anda saat ini. `;
    }

    speechText += `Warga diimbau tetap tenang, waspada terhadap potensi gempa susulan, dan menghindari bangunan yang retak atau rawan roboh.`;

    // 6. Eksekusi SpeechSynthesis
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.lang = 'id-ID';
        utterance.rate = 0.96;
        utterance.pitch = 1.0;

        const resetBtnState = () => {
            isBroadcastingAlert = false;
            if (btn) btn.classList.remove("speaking");
            updateAutoBroadcastUI();
        };

        utterance.onend = resetBtnState;
        utterance.onerror = resetBtnState;

        // Beri jeda 1.2 detik agar sirene peringatan awal selesai sebelum suara berbicara
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

// ==================== GOOGLE MAPS PIXEL-PERFECT CONTEXT MENU & MEASURE TOOL (DESKTOP ONLY) ====================
function initGmapContextMenu() {
    const contextMenu = document.getElementById('gmapContextMenu');
    const measureCard = document.getElementById('gmapMeasureCard');
    const measureResultEl = document.getElementById('gmapMeasureResult');
    const measureCloseBtn = document.getElementById('gmapMeasureCloseBtn');

    if (!contextMenu || typeof map === 'undefined' || !map) return;

    let activeContextLat = 0;
    let activeContextLng = 0;

    // Status Mode Ukur Jarak (Penggaris Multi-Titik)
    let isMeasuring = false;
    let measurePoints = [];
    let measureMarkers = [];
    let measureTickMarkers = [];
    let measurePolyline = null;

    function getMeasureTheme() {
        const isDark = (typeof currentMapLayer !== 'undefined') && (currentMapLayer === 'sat' || currentMapLayer === 'dark');
        return {
            isDark,
            lineColor: isDark ? '#ffffff' : '#000000',
            markerBorder: isDark ? '#202124' : '#000000',
            markerFill: '#ffffff',
            themeClass: isDark ? 'theme-light' : 'theme-dark'
        };
    }

    function formatMeasureDistance(meters) {
        if (meters >= 1000) {
            const km = meters / 1000;
            const miles = km * 0.621371;
            const kmStr = km.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const miStr = miles.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return `Jarak total: ${kmStr} km (${miStr} mil)`;
        } else {
            const feet = Math.round(meters * 3.28084);
            const mStr = Math.round(meters).toLocaleString('id-ID');
            const ftStr = feet.toLocaleString('id-ID');
            return `Jarak total: ${mStr} m (${ftStr} kaki)`;
        }
    }

    function formatRulerTickLabel(meters) {
        if (meters >= 1000) {
            const km = meters / 1000;
            const formatted = Number.isInteger(km) 
                ? km.toString() 
                : km.toLocaleString('id-ID', { maximumFractionDigits: 1 });
            return `${formatted} km`;
        }
        return `${Math.round(meters)} m`;
    }

    function getRulerIntervalStep() {
        // Hitung jarak nyata yang setara dengan target ~110px pada layar monitor di level zoom aktif
        let metersPerScreenStep = 1000;
        try {
            if (typeof map !== 'undefined' && map) {
                const center = map.getCenter();
                const pt1 = map.latLngToContainerPoint(center);
                const pt2 = L.point(pt1.x + 110, pt1.y);
                const latLng2 = map.containerPointToLatLng(pt2);
                metersPerScreenStep = map.distance(center, latLng2);
            }
        } catch (e) {
            metersPerScreenStep = 1000;
        }

        // Skala interval alami (Nice Steps)
        const niceSteps = [
            10, 20, 50, 100, 200, 500,
            1000, 2000, 5000, 10000, 20000, 50000,
            100000, 200000, 500000, 1000000, 2000000, 5000000
        ];

        let chosenStep = niceSteps[niceSteps.length - 1];
        for (let step of niceSteps) {
            if (step >= metersPerScreenStep) {
                chosenStep = step;
                break;
            }
        }

        return Math.max(10, chosenStep);
    }

    function getSegmentAngle(p1, p2) {
        try {
            const pt1 = map.latLngToContainerPoint(p1);
            const pt2 = map.latLngToContainerPoint(p2);
            const dx = pt2.x - pt1.x;
            const dy = pt2.y - pt1.y;
            let deg = Math.atan2(dy, dx) * (180 / Math.PI);
            if (deg > 90) deg -= 180;
            if (deg < -90) deg += 180;
            return deg;
        } catch (err) {
            return 0;
        }
    }

    function calculateTotalDistance() {
        let total = 0;
        for (let i = 0; i < measurePoints.length - 1; i++) {
            total += map.distance(measurePoints[i], measurePoints[i + 1]);
        }
        return total;
    }

    function renderMeasureRuler() {
        if (!isMeasuring || typeof map === 'undefined' || !map) return;

        const theme = getMeasureTheme();

        // 1. Bersihkan layer garis lama, marker titik, dan penanda interval
        if (measurePolyline) {
            try { map.removeLayer(measurePolyline); } catch (e) {}
            measurePolyline = null;
        }

        measureMarkers.forEach((m) => {
            try { map.removeLayer(m); } catch (e) {}
        });
        measureMarkers = [];

        measureTickMarkers.forEach((t) => {
            try { map.removeLayer(t); } catch (e) {}
        });
        measureTickMarkers = [];

        if (measurePoints.length === 0) return;

        // 2. Gambar garis polyline solid jika ada >= 2 titik
        if (measurePoints.length >= 2) {
            measurePolyline = L.polyline(measurePoints, {
                color: theme.lineColor,
                weight: 3.5,
                opacity: 0.95
            }).addTo(map);

            // Hitung total jarak keseluruhan dan interval adaptif murni berdasarkan level zoom
            const step = getRulerIntervalStep();
            const viewBounds = map.getBounds().pad(0.3); // Area pandang layar + buffer 30%

            // Hitung dan tempatkan penanda interval graduasi (ticks & labels) sepanjang segmen
            let accumulatedDist = 0;
            let nextMilestone = step;

            for (let i = 0; i < measurePoints.length - 1; i++) {
                const p1 = measurePoints[i];
                const p2 = measurePoints[i + 1];
                const segDist = map.distance(p1, p2);
                const segStart = accumulatedDist;
                const segEnd = accumulatedDist + segDist;

                const angle = getSegmentAngle(p1, p2);

                while (nextMilestone <= segEnd) {
                    if (nextMilestone > segStart) {
                        const fraction = (nextMilestone - segStart) / segDist;
                        const tickLat = p1.lat + fraction * (p2.lat - p1.lat);
                        const tickLng = p1.lng + fraction * (p2.lng - p1.lng);
                        const tickPos = L.latLng(tickLat, tickLng);

                        // Optimasi: Hanya buat elemen DOM jika penanda berada di dalam/dekat layar
                        if (viewBounds.contains(tickPos)) {
                            const labelText = formatRulerTickLabel(nextMilestone);

                            const tickIcon = L.divIcon({
                                className: 'gmap-ruler-tick-wrapper-icon',
                                html: `
                                    <div class="gmap-ruler-tick-wrapper" style="transform: rotate(${angle}deg);">
                                        <div class="gmap-ruler-tick-mark ${theme.themeClass}"></div>
                                        <div class="gmap-ruler-tick-label ${theme.themeClass}">${labelText}</div>
                                    </div>
                                `,
                                iconSize: [80, 30],
                                iconAnchor: [40, 15]
                            });

                            const tickMarker = L.marker(tickPos, { icon: tickIcon, interactive: false }).addTo(map);
                            measureTickMarkers.push(tickMarker);
                        }
                    }
                    nextMilestone += step;
                }

                accumulatedDist = segEnd;
            }
        }

        // 3. Gambar marker lingkaran titik simpul (vertices)
        measurePoints.forEach((pt) => {
            const marker = L.circleMarker(pt, {
                radius: 5.5,
                color: theme.markerBorder,
                fillColor: theme.markerFill,
                fillOpacity: 1,
                weight: 2.5
            }).addTo(map);
            measureMarkers.push(marker);
        });

        // 4. Perbarui kartu info total jarak di bawah
        const total = calculateTotalDistance();
        if (measureResultEl) {
            measureResultEl.textContent = formatMeasureDistance(total);
        }
    }

    // Expose fungsi update tema agar terpicu saat user mengganti lapisan peta
    window.updateMeasureTheme = renderMeasureRuler;

    function closeContextMenu() {
        if (contextMenu && contextMenu.style.display !== 'none') {
            contextMenu.style.display = 'none';
        }
    }

    function stopMeasureTool() {
        isMeasuring = false;
        if (measureCard) measureCard.style.display = 'none';

        if (measurePolyline) {
            try { map.removeLayer(measurePolyline); } catch (e) {}
            measurePolyline = null;
        }

        measureMarkers.forEach((marker) => {
            try { map.removeLayer(marker); } catch (e) {}
        });
        measureMarkers = [];

        measureTickMarkers.forEach((tick) => {
            try { map.removeLayer(tick); } catch (e) {}
        });
        measureTickMarkers = [];

        measurePoints = [];

        const mapContainer = map.getContainer();
        if (mapContainer) mapContainer.style.cursor = '';

        const deskMeasureBtn = document.getElementById('layerOptMeasure');
        if (deskMeasureBtn) deskMeasureBtn.classList.remove('active');
    }

    function startMeasureTool(startLat, startLng) {
        stopMeasureTool();

        isMeasuring = true;
        if (typeof startLat === 'number' && typeof startLng === 'number') {
            const startPoint = L.latLng(startLat, startLng);
            measurePoints.push(startPoint);
        }

        // Tampilkan kartu panel info jarak permanen di bawah
        if (measureCard) {
            measureCard.style.display = 'block';
            if (measureResultEl) {
                measureResultEl.textContent = formatMeasureDistance(0);
            }
        }

        const mapContainer = map.getContainer();
        if (mapContainer) mapContainer.style.cursor = 'crosshair';

        const deskMeasureBtn = document.getElementById('layerOptMeasure');
        if (deskMeasureBtn) deskMeasureBtn.classList.add('active');

        // Render titik awal jika ada
        if (measurePoints.length > 0) {
            renderMeasureRuler();
        }
    }

    // Ekspor fungsi ukur ke window agar dapat dipanggil dari popup menu layer
    window.startMeasureTool = startMeasureTool;
    window.stopMeasureTool = stopMeasureTool;
    window.isMeasuringActive = () => isMeasuring;
    window.toggleMeasureTool = function(lat, lng) {
        if (isMeasuring) {
            stopMeasureTool();
            showToastNotification("📏 Pengukuran jarak dinonaktifkan");
        } else {
            const cLat = typeof lat === 'number' ? lat : (map ? map.getCenter().lat : 0);
            const cLng = typeof lng === 'number' ? lng : (map ? map.getCenter().lng : 0);
            startMeasureTool(cLat, cLng);
            showToastNotification("📏 Mode Ukur Jarak Aktif - Klik pada peta untuk menambah titik");
        }
    };

    // Pasang handler tombol tutup [X] pada kartu pengukur jarak
    if (measureCloseBtn) {
        measureCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            stopMeasureTool();
        });
    }

    // 1. Event Listener Klik Kanan Peta Leaflet (Khusus Layar Desktop)
    map.on('contextmenu', (e) => {
        // Abaikan jika layar berada dalam mode mobile
        if (window.innerWidth <= 768) {
            return;
        }

        if (e.originalEvent) {
            e.originalEvent.preventDefault();
            e.originalEvent.stopPropagation();
        }

        activeContextLat = e.latlng.lat;
        activeContextLng = e.latlng.lng;

        const coordsItem = contextMenu.querySelector('.item-coords');
        if (coordsItem) {
            coordsItem.textContent = `${activeContextLat.toFixed(6)}, ${activeContextLng.toFixed(6)}`;
        }

        contextMenu.style.display = 'flex';

        const mouseX = e.originalEvent.clientX;
        const mouseY = e.originalEvent.clientY;
        const menuWidth = contextMenu.offsetWidth || 210;
        const menuHeight = contextMenu.offsetHeight || 370;

        let posX = mouseX + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 8 : mouseX;
        let posY = mouseY + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 8 : mouseY;

        if (posX < 8) posX = 8;
        if (posY < 8) posY = 8;

        contextMenu.style.left = `${posX}px`;
        contextMenu.style.top = `${posY}px`;
    });

    // Event klik kiri pada peta: tutup context menu atau tambah titik ukur jika mode ukur aktif
    map.on('click', (e) => {
        closeContextMenu();

        if (isMeasuring) {
            const newPoint = e.latlng;
            measurePoints.push(newPoint);
            renderMeasureRuler();
        }
    });

    // Render ulang saat zoom atau pan agar sudut, kerapatan interval, dan posisi label selalu presisi
    map.on('zoomend', () => {
        if (isMeasuring) renderMeasureRuler();
    });
    map.on('moveend', () => {
        if (isMeasuring) renderMeasureRuler();
    });

    map.on('movestart', closeContextMenu);
    window.addEventListener('resize', closeContextMenu);

    // 2. Handler Klik Tiap Item Menu
    contextMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.gmap-menu-item');
        if (!item) return;

        const action = item.getAttribute('data-action');
        const latStr = activeContextLat.toFixed(6);
        const lngStr = activeContextLng.toFixed(6);

        switch (action) {
            case 'copy-coords':
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(`${latStr}, ${lngStr}`).then(() => {
                        showToastNotification('📍 Koordinat disalin ke papan klip');
                    }).catch(() => {
                        showToastNotification(`📍 Koordinat: ${latStr}, ${lngStr}`);
                    });
                } else {
                    showToastNotification(`📍 Koordinat: ${latStr}, ${lngStr}`);
                }
                break;

            case 'share':
                const currentZoom = (typeof map !== 'undefined' && map) ? Math.round(map.getZoom() * 10) / 10 : 10;
                const shareUrl = `${window.location.origin}${window.location.pathname}#/@${latStr},${lngStr},${currentZoom}z`;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(shareUrl).then(() => {
                        showToastNotification('🔗 Tautan lokasi disalin ke papan klip');
                    }).catch(() => {
                        showToastNotification('🔗 Tautan lokasi siap dibagikan!');
                    });
                } else {
                    showToastNotification('🔗 Tautan lokasi siap dibagikan!');
                }
                break;

            case 'route-from':
                window.open(`https://www.google.com/maps/dir/${latStr},${lngStr}/`, '_blank');
                break;

            case 'route-to':
                window.open(`https://www.google.com/maps/dir//${latStr},${lngStr}/`, '_blank');
                break;

            case 'whats-here':
                showToastNotification('🔍 Mencari informasi lokasi...');
                fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latStr}&lon=${lngStr}&zoom=18&addressdetails=1`)
                    .then((res) => res.json())
                    .then((data) => {
                        let locationTitle = 'Lokasi Terpilih';
                        let locationSubtitle = data.display_name || 'Lokasi tidak ditemukan';

                        if (typeof formatIndonesianPlace === 'function') {
                            const formatted = formatIndonesianPlace(data.address || {}, activeContextLat, activeContextLng);
                            if (formatted && typeof formatted === 'object') {
                                locationTitle = formatted.main || 'Lokasi Terpilih';
                                const adminPart = formatted.admin ? formatted.admin : '';
                                const provPart = formatted.province ? formatted.province : '';
                                locationSubtitle = [adminPart, provPart].filter(Boolean).join(', ') || data.display_name || 'Indonesia';
                            } else if (typeof formatted === 'string') {
                                locationSubtitle = formatted;
                            }
                        }

                        if (typeof L !== 'undefined' && map) {
                            L.popup({ autoClose: true, closeOnClick: true, className: 'gmap-context-popup' })
                                .setLatLng([activeContextLat, activeContextLng])
                                .setContent(`
                                    <div class="gmap-info-popup">
                                        <div class="gmap-info-popup-title">
                                            <span class="google-symbols" style="font-size: 16px; color: #ea4335;">&#xe0c8;</span>
                                            <span>${locationTitle}</span>
                                        </div>
                                        <div class="gmap-info-popup-desc">${locationSubtitle}</div>
                                        <div class="gmap-info-popup-coords">${latStr}, ${lngStr}</div>
                                    </div>
                                `)
                                .openOn(map);
                        }
                    })
                    .catch(() => {
                        showToastNotification('Gagal memuat detail lokasi');
                    });
                break;

            case 'search-quakes':
                showToastNotification('🔍 Memindai gempa dalam radius 250 km...');
                if (typeof L !== 'undefined' && map) {
                    if (window.activeRadiusCircle) {
                        try { map.removeLayer(window.activeRadiusCircle); } catch (e) {}
                    }
                    window.activeRadiusCircle = L.circle([activeContextLat, activeContextLng], {
                        radius: 250000,
                        color: '#1a73e8',
                        fillColor: '#1a73e8',
                        fillOpacity: 0.08,
                        weight: 1.5,
                        dashArray: '6, 6'
                    }).addTo(map);

                    L.popup({ autoClose: true, closeOnClick: true, className: 'gmap-context-popup' })
                        .setLatLng([activeContextLat, activeContextLng])
                        .setContent(`
                            <div class="gmap-info-popup">
                                <div class="gmap-info-popup-title">
                                    <span class="google-symbols" style="font-size: 16px; color: #1a73e8;">&#xe1ff;</span>
                                    <span>Radius Pemantauan Gempa</span>
                                </div>
                                <div class="gmap-info-popup-desc">Pemantauan gempa bumi aktif dalam radius 250 km dari titik ini.</div>
                                <div class="gmap-info-popup-coords">${latStr}, ${lngStr}</div>
                            </div>
                        `)
                        .openOn(map);
                }
                break;

            case 'measure':
                startMeasureTool(activeContextLat, activeContextLng);
                break;

            case 'print':
                if (typeof openPrintPreviewModal === 'function') {
                    openPrintPreviewModal();
                } else {
                    window.print();
                }
                break;
        }

        closeContextMenu();
    });

    // 3. Listener Tombol Escape & Global Click
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeContextMenu();
            if (isMeasuring) stopMeasureTool();
        }
    });

    document.addEventListener('click', (e) => {
        if (contextMenu && !contextMenu.contains(e.target)) {
            closeContextMenu();
        }
    });
}

// Inisialisasi Google Maps Context Menu & Secret Engine UI saat aplikasi siap
initGmapContextMenu();
if (typeof updateGmapsVersionUI === 'function') updateGmapsVersionUI();
if (typeof updateLayerDetailUI === 'function') updateLayerDetailUI();

// Expose fungsi 3D Tilt dan Kompas ke window
window.toggleMap3DMode = toggleMap3DMode;
window.rotateMap = rotateMap;
window.resetMapOrientation = resetMapOrientation;

// Sinkronisasi status layer-sat-active awal
if (typeof currentMapLayer !== 'undefined') {
    document.body.classList.toggle('layer-sat-active', currentMapLayer === 'sat');
}






