// ==========================================================================
// SEISMOGRAPH - SECONDARY MODULES & ON-DEMAND MODALS (GOOGLE MAPS STYLE)
// Mengoptimalkan pemuatan awal (First Contentful Paint < 200ms)
// ==========================================================================

// ==================== 1. MULTI-LANGUAGE (i18n SYSTEM & DYNAMIC MODAL) ====================
let currentAppLanguage = localStorage.getItem("seismik_lang") || "id";

const i18nDictionary = {
    id: {
        brandSub: "Maps",
        sidebar: "Tampilkan sidebar",
        saved: "Disimpan",
        recent: "Terbaru",
        contrib: "Kontribusi Anda",
        shareLoc: "Berbagi lokasi",
        globalQuakes: "Peta Gempa Seluruh Dunia",
        timeline: "Linimasa Anda",
        guide: "Panduan Siaga Bencana",
        theme: "Mode Gelap / Terang",
        shareMap: "Bagikan atau sematkan peta",
        print: "Cetak",
        appInfo: "Informasi Pengembang & Aplikasi",
        tips: "Tips dan trik siaga gempa",
        help: "Dapatkan bantuan",
        lang: "Bahasa",
        searchPlaceholder: "Cari kota, wilayah, atau sesar..."
    },
    en: {
        brandSub: "Maps",
        sidebar: "Show sidebar",
        saved: "Saved",
        recent: "Recents",
        contrib: "Your contributions",
        shareLoc: "Location sharing",
        globalQuakes: "Global Earthquake Map",
        timeline: "Your timeline",
        guide: "Disaster Preparedness Guide",
        theme: "Dark / Light Mode",
        shareMap: "Share or embed map",
        print: "Print",
        appInfo: "Developer & App Information",
        tips: "Earthquake safety tips",
        help: "Get help",
        lang: "Language",
        searchPlaceholder: "Search city, region, or fault..."
    }
};

function ensureLanguageModalDOM() {
    let modal = document.getElementById("modalLanguagePicker");
    if (!modal) {
        modal = document.createElement("div");
        modal.className = "gmap-lang-modal-backdrop";
        modal.id = "modalLanguagePicker";
        modal.style.display = "none";
        modal.onclick = (e) => closeLanguageModal(e);
        modal.innerHTML = `
        <div class="sYmAxe" aria-modal="true" role="dialog" onclick="event.stopPropagation()">
            <div class="uiuFBf" tabindex="0" jsaction="focus:modal.focus.top"></div>
            <button class="OyzoZb" aria-label="Tutup" onclick="closeLanguageModal()" title="Tutup">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
            <div class="yFnP6d">
                <div class="kARmKf">
                    <div class="ZsCMfd">
                        <div class="NVacAd">
                            <div class="yb2Rh">Pilih bahasa</div>
                            <div class="qMgSKe JAILI" style="border-top:none; padding-bottom: 8px;">
                                <div class="Vn3gGd" style="width: 100%;">
                                    <div><a class="jf99xf lang-item" data-lang="en" href="javascript:void(0)" onclick="setAppLanguage('en', 'English (United States)')">&#x202A;English (United States)&#x202C;</a></div>
                                </div>
                            </div>
                            <div class="JAILI">
                                <div class="Vn3gGd">
                                    <div><a class="jf99xf lang-item" data-lang="af" href="javascript:void(0)" onclick="setAppLanguage('af', 'Afrikaans')">&#x202A;Afrikaans&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="az" href="javascript:void(0)" onclick="setAppLanguage('az', 'azərbaycan')">&#x202A;azərbaycan&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item active-lang" data-lang="id" href="javascript:void(0)" onclick="setAppLanguage('id', 'Bahasa Indonesia')"><span class="QxsAAd">&#x202A;Bahasa Indonesia&#x202C;</span></a></div>
                                    <div><a class="jf99xf lang-item" data-lang="ms" href="javascript:void(0)" onclick="setAppLanguage('ms', 'Bahasa Melayu')">&#x202A;Bahasa Melayu&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="bs" href="javascript:void(0)" onclick="setAppLanguage('bs', 'bosanski')">&#x202A;bosanski&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="ca" href="javascript:void(0)" onclick="setAppLanguage('ca', 'català')">&#x202A;català&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="cs" href="javascript:void(0)" onclick="setAppLanguage('cs', 'Čeština')">&#x202A;Čeština&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="da" href="javascript:void(0)" onclick="setAppLanguage('da', 'Dansk')">&#x202A;Dansk&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="de" href="javascript:void(0)" onclick="setAppLanguage('de', 'Deutsch (Deutschland)')">&#x202A;Deutsch (Deutschland)&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="et" href="javascript:void(0)" onclick="setAppLanguage('et', 'eesti')">&#x202A;eesti&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="en-us" href="javascript:void(0)" onclick="setAppLanguage('en', 'English (United States)')">&#x202A;English (United States)&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="es" href="javascript:void(0)" onclick="setAppLanguage('es', 'Español (España)')">&#x202A;Español (España)&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="es-419" href="javascript:void(0)" onclick="setAppLanguage('es-419', 'Español (Latinoamérica)')">&#x202A;Español (Latinoamérica)&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="eu" href="javascript:void(0)" onclick="setAppLanguage('eu', 'euskara')">&#x202A;euskara&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="fil" href="javascript:void(0)" onclick="setAppLanguage('fil', 'Filipino')">&#x202A;Filipino&#x202C;</a></div>
                                </div>
                                <div class="Vn3gGd">
                                    <div><a class="jf99xf lang-item" data-lang="fr" href="javascript:void(0)" onclick="setAppLanguage('fr', 'Français (France)')">&#x202A;Français (France)&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="gl" href="javascript:void(0)" onclick="setAppLanguage('gl', 'galego')">&#x202A;galego&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="hr" href="javascript:void(0)" onclick="setAppLanguage('hr', 'Hrvatski')">&#x202A;Hrvatski&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="zu" href="javascript:void(0)" onclick="setAppLanguage('zu', 'isiZulu')">&#x202A;isiZulu&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="is" href="javascript:void(0)" onclick="setAppLanguage('is', 'íslenska')">&#x202A;íslenska&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="it" href="javascript:void(0)" onclick="setAppLanguage('it', 'Italiano')">&#x202A;Italiano&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="sw" href="javascript:void(0)" onclick="setAppLanguage('sw', 'Kiswahili')">&#x202A;Kiswahili&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="lv" href="javascript:void(0)" onclick="setAppLanguage('lv', 'latviešu')">&#x202A;latviešu&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="lt" href="javascript:void(0)" onclick="setAppLanguage('lt', 'lietuvių')">&#x202A;lietuvių&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="hu" href="javascript:void(0)" onclick="setAppLanguage('hu', 'magyar')">&#x202A;magyar&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="nl" href="javascript:void(0)" onclick="setAppLanguage('nl', 'Nederlands')">&#x202A;Nederlands&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="no" href="javascript:void(0)" onclick="setAppLanguage('no', 'norsk')">&#x202A;norsk&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="uz" href="javascript:void(0)" onclick="setAppLanguage('uz', 'oʻzbekcha')">&#x202A;oʻzbekcha&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="pl" href="javascript:void(0)" onclick="setAppLanguage('pl', 'polski')">&#x202A;polski&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="pt-br" href="javascript:void(0)" onclick="setAppLanguage('pt-br', 'Português (Brasil)')">&#x202A;Português (Brasil)&#x202C;</a></div>
                                </div>
                                <div class="Vn3gGd">
                                    <div><a class="jf99xf lang-item" data-lang="pt-pt" href="javascript:void(0)" onclick="setAppLanguage('pt-pt', 'Português (Portugal)')">&#x202A;Português (Portugal)&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="ro" href="javascript:void(0)" onclick="setAppLanguage('ro', 'română')">&#x202A;română&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="sq" href="javascript:void(0)" onclick="setAppLanguage('sq', 'shqip')">&#x202A;shqip&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="sk" href="javascript:void(0)" onclick="setAppLanguage('sk', 'Slovenčina')">&#x202A;Slovenčina&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="sl" href="javascript:void(0)" onclick="setAppLanguage('sl', 'slovenščina')">&#x202A;slovenščina&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="fi" href="javascript:void(0)" onclick="setAppLanguage('fi', 'Suomi')">&#x202A;Suomi&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="sv" href="javascript:void(0)" onclick="setAppLanguage('sv', 'Svenska')">&#x202A;Svenska&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="vi" href="javascript:void(0)" onclick="setAppLanguage('vi', 'Tiếng Việt')">&#x202A;Tiếng Việt&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="tr" href="javascript:void(0)" onclick="setAppLanguage('tr', 'Türkçe')">&#x202A;Türkçe&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="el" href="javascript:void(0)" onclick="setAppLanguage('el', 'Ελληνικά')">&#x202A;Ελληνικά&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="bg" href="javascript:void(0)" onclick="setAppLanguage('bg', 'български')">&#x202A;български&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="ky" href="javascript:void(0)" onclick="setAppLanguage('ky', 'кыргызча')">&#x202A;кыргызча&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="kk" href="javascript:void(0)" onclick="setAppLanguage('kk', 'қазақ тілі')">&#x202A;қазақ тілі&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="mk" href="javascript:void(0)" onclick="setAppLanguage('mk', 'македонски')">&#x202A;македонски&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="mn" href="javascript:void(0)" onclick="setAppLanguage('mn', 'монгол')">&#x202A;монгол&#x202C;</a></div>
                                </div>
                                <div class="Vn3gGd">
                                    <div><a class="jf99xf lang-item" data-lang="ru" href="javascript:void(0)" onclick="setAppLanguage('ru', 'Русский')">&#x202A;Русский&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="sr" href="javascript:void(0)" onclick="setAppLanguage('sr', 'српски (ћирилица)')">&#x202A;српски (ћирилица)&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="uk" href="javascript:void(0)" onclick="setAppLanguage('uk', 'Українська')">&#x202A;Українська&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="ka" href="javascript:void(0)" onclick="setAppLanguage('ka', 'ქართული')">&#x202A;ქართული&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="hy" href="javascript:void(0)" onclick="setAppLanguage('hy', 'հայերեն')">&#x202A;հայերեն&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="iw" href="javascript:void(0)" onclick="setAppLanguage('iw', 'עברית')"><span dir="rtl">&#x202B;עברית&#x202C;</span></a></div>
                                    <div><a class="jf99xf lang-item" data-lang="ur" href="javascript:void(0)" onclick="setAppLanguage('ur', 'اردو')"><span dir="rtl">&#x202B;اردو&#x202C;</span></a></div>
                                    <div><a class="jf99xf lang-item" data-lang="ar" href="javascript:void(0)" onclick="setAppLanguage('ar', 'العربية')"><span dir="rtl">&#x202B;العربية&#x202C;</span></a></div>
                                    <div><a class="jf99xf lang-item" data-lang="fa" href="javascript:void(0)" onclick="setAppLanguage('fa', 'فارسی')"><span dir="rtl">&#x202B;فارسی&#x202C;</span></a></div>
                                    <div><a class="jf99xf lang-item" data-lang="am" href="javascript:void(0)" onclick="setAppLanguage('am', 'አማርኛ')">&#x202A;አማርኛ&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="ne" href="javascript:void(0)" onclick="setAppLanguage('ne', 'नेपाली')">&#x202A;नेपाली&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="hi" href="javascript:void(0)" onclick="setAppLanguage('hi', 'हिन्दी')">&#x202A;हिन्दी&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="mr" href="javascript:void(0)" onclick="setAppLanguage('mr', 'मराठी')">&#x202A;मराठी&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="bn" href="javascript:void(0)" onclick="setAppLanguage('bn', 'বাংলা')">&#x202A;বাংলা&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="pa" href="javascript:void(0)" onclick="setAppLanguage('pa', 'ਪੰਜਾਬੀ')">&#x202A;ਪੰਜਾਬੀ&#x202C;</a></div>
                                </div>
                                <div class="Vn3gGd">
                                    <div><a class="jf99xf lang-item" data-lang="gu" href="javascript:void(0)" onclick="setAppLanguage('gu', 'ગુજરાતી')">&#x202A;ગુજરાતી&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="ta" href="javascript:void(0)" onclick="setAppLanguage('ta', 'தமிழ்')">&#x202A;தமிழ்&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="te" href="javascript:void(0)" onclick="setAppLanguage('te', 'తెలుగు')">&#x202A;తెలుగు&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="kn" href="javascript:void(0)" onclick="setAppLanguage('kn', 'ಕನ್ನಡ')">&#x202A;ಕನ್ನಡ&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="ml" href="javascript:void(0)" onclick="setAppLanguage('ml', 'മലയാളം')">&#x202A;മലയാളം&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="si" href="javascript:void(0)" onclick="setAppLanguage('si', 'සිංහල')">&#x202A;සිංහල&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="th" href="javascript:void(0)" onclick="setAppLanguage('th', 'ไทย')">&#x202A;ไทย&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="lo" href="javascript:void(0)" onclick="setAppLanguage('lo', 'ລາວ')">&#x202A;ລາວ&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="my" href="javascript:void(0)" onclick="setAppLanguage('my', 'ဗမာ')">&#x202A;ဗမာ&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="km" href="javascript:void(0)" onclick="setAppLanguage('km', 'ខ្មែរ')">&#x202A;ខ្មែរ&#x202C;</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="ko" href="javascript:void(0)" onclick="setAppLanguage('ko', '한국어')">&#x202A;한국어</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="ja" href="javascript:void(0)" onclick="setAppLanguage('ja', '日本語')">&#x202A;日本語</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="zh-cn" href="javascript:void(0)" onclick="setAppLanguage('zh-cn', '简体中文')">&#x202A;简体中文</a></div>
                                    <div><a class="jf99xf lang-item" data-lang="zh-tw" href="javascript:void(0)" onclick="setAppLanguage('zh-tw', '繁體中文')">&#x202A;繁體中文</a></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="uiuFBf" tabindex="0" jsaction="focus:modal.focus.bottom"></div>
            <div class="mIzEMb"></div>
        </div>
        `;
        document.body.appendChild(modal);
    }
    return modal;
}

function openLanguageModal() {
    if (typeof closeDesktopSettings === 'function') closeDesktopSettings();
    const modal = ensureLanguageModalDOM();
    if (modal) {
        modal.querySelectorAll(".lang-item").forEach(el => {
            const isSelected = (el.getAttribute("data-lang") === currentAppLanguage);
            el.classList.toggle("active-lang", isSelected);
            if (isSelected) {
                if (!el.querySelector(".QxsAAd")) {
                    const text = el.textContent.trim();
                    el.innerHTML = `<span class="QxsAAd">&#x202A;${text}&#x202C;</span>`;
                }
            } else {
                const span = el.querySelector(".QxsAAd");
                if (span) el.innerHTML = `&#x202A;${span.textContent.trim()}&#x202C;`;
            }
        });
        modal.style.display = "flex";
    }
}

function closeLanguageModal(e) {
    if (e && e.target && e.target !== e.currentTarget) return;
    const modal = document.getElementById("modalLanguagePicker");
    if (modal) modal.style.display = "none";
}

function setAppLanguage(langCode, langName) {
    currentAppLanguage = langCode;
    try { localStorage.setItem("seismik_lang", langCode); } catch (e) {}
    closeLanguageModal();

    const targetCode = (langCode === 'zh-cn' ? 'zh-CN' : (langCode === 'zh-tw' ? 'zh-TW' : (langCode === 'pt-br' ? 'pt' : (langCode === 'pt-pt' ? 'pt' : (langCode === 'es-419' ? 'es' : langCode)))));

    // 1. Manage Google Translate Cookie (googtrans)
    const host = window.location.hostname;
    if (langCode === 'id') {
        document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "googtrans=/id/id; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        if (host) {
            document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=" + host;
            document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=." + host;
        }
        document.cookie = "googtrans=/id/id; path=/;";
    } else {
        document.cookie = `googtrans=/id/${targetCode}; path=/;`;
        if (host) {
            document.cookie = `googtrans=/id/${targetCode}; path=/; domain=${host}`;
            document.cookie = `googtrans=/id/${targetCode}; path=/; domain=.${host}`;
        }
    }

    // 2. Trigger Google Translate Engine & Local Dictionary
    triggerGoogleTranslate(targetCode);
    applyLanguage(langCode);

    if (typeof showToastNotification === 'function') {
        showToastNotification(`🌐 Bahasa diubah ke ${langName}`);
    } else if (typeof showNotification === 'function') {
        showNotification(`🌐 Bahasa diubah ke ${langName}`);
    }
}

function triggerGoogleTranslate(targetCode) {
    const combo = document.querySelector('.goog-te-combo');
    if (combo) {
        combo.value = (targetCode === 'id' ? '' : targetCode);
        combo.dispatchEvent(new Event('change'));
    } else {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            const c = document.querySelector('.goog-te-combo');
            if (c) {
                clearInterval(interval);
                c.value = (targetCode === 'id' ? '' : targetCode);
                c.dispatchEvent(new Event('change'));
            } else if (attempts > 30) {
                clearInterval(interval);
            }
        }, 150);
    }
}

function applyLanguage(langCode) {
    const dict = i18nDictionary[langCode] || i18nDictionary.id;
    const globalQuakesEl = document.getElementById("i18nGlobalQuakes");
    const shareEl = document.getElementById("i18nShareMap");
    const printEl = document.getElementById("i18nPrint");
    const appInfoEl = document.getElementById("i18nAppInfo");
    const tipsEl = document.getElementById("i18nTips");
    const helpEl = document.getElementById("i18nHelp");
    const langEl = document.getElementById("i18nLang");
    const searchInput = document.getElementById("searchInput");

    if (globalQuakesEl) globalQuakesEl.textContent = dict.globalQuakes;
    if (shareEl) shareEl.textContent = dict.shareMap;
    if (printEl) printEl.textContent = dict.print;
    if (appInfoEl) appInfoEl.textContent = dict.appInfo;
    if (tipsEl) tipsEl.textContent = dict.tips;
    if (helpEl) helpEl.textContent = dict.help;
    if (langEl) langEl.textContent = dict.lang;
    if (searchInput) searchInput.setAttribute("placeholder", dict.searchPlaceholder);

    document.querySelectorAll(".lang-item").forEach(el => {
        const isSelected = el.getAttribute("data-lang") === langCode;
        el.classList.toggle("active-lang", isSelected);
        if (isSelected) {
            if (!el.querySelector(".QxsAAd")) {
                const text = el.textContent.trim();
                el.innerHTML = `<span class="QxsAAd">&#x202A;${text}&#x202C;</span>`;
            }
        } else {
            const span = el.querySelector(".QxsAAd");
            if (span) el.innerHTML = `&#x202A;${span.textContent.trim()}&#x202C;`;
        }
    });
}

// ==================== 2. MODAL SHARE / EMBED MAP (DYNAMIC DOM) ====================
function ensureShareModalDOM() {
    let modal = document.getElementById("modalShareEmbed");
    if (!modal) {
        modal = document.createElement("div");
        modal.className = "modal-backdrop";
        modal.id = "modalShareEmbed";
        modal.style.display = "none";
        modal.onclick = (e) => closeShareModal(e);
        modal.innerHTML = `
        <div class="modal-dialog share-embed-modal" onclick="event.stopPropagation()">
            <div class="share-modal-header">
                <div class="share-modal-tabs">
                    <button class="share-tab-btn active" id="tabShareLink" onclick="switchShareTab('link')">Kirim link</button>
                    <button class="share-tab-btn" id="tabShareEmbed" onclick="switchShareTab('embed')">Sematkan peta</button>
                </div>
                <button class="modal-close-icon-btn" onclick="closeShareModal()" title="Tutup">
                    <span class="google-symbols" style="font-size: 20px;">&#xe5cd;</span>
                </button>
            </div>
            <div class="share-modal-body">
                <div class="share-pane active" id="paneShareLink">
                    <div class="share-input-group">
                        <input type="text" class="share-url-input" id="shareUrlInput" readonly value="https://seismik.gracely.my.id/">
                        <button class="share-copy-btn" onclick="copyShareUrl()">Salin link</button>
                    </div>
                </div>
                <div class="share-pane" id="paneShareEmbed" style="display: none;">
                    <div class="share-input-group">
                        <input type="text" class="share-url-input" id="shareEmbedInput" readonly value='<iframe src="https://seismik.gracely.my.id/" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy"></iframe>'>
                        <button class="share-copy-btn" onclick="copyEmbedIframe()">Salin HTML</button>
                    </div>
                    <div class="embed-preview-note">Preview peta disematkan responsif untuk situs web & blog Anda.</div>
                </div>
            </div>
        </div>
        `;
        document.body.appendChild(modal);
    }
    return modal;
}

function updateShareModalInputs() {
    const currentUrl = window.location.href;
    const shareInput = document.getElementById("shareUrlInput");
    const embedInput = document.getElementById("shareEmbedInput");
    if (shareInput) shareInput.value = currentUrl;
    if (embedInput) {
        embedInput.value = `<iframe src="${currentUrl}" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy"></iframe>`;
    }
}

function openShareModal() {
    if (typeof closeDesktopSettings === 'function') closeDesktopSettings();
    const modal = ensureShareModalDOM();
    updateShareModalInputs();
    if (modal) modal.style.display = "flex";
}

function closeShareModal(e) {
    if (e && e.target && e.target !== e.currentTarget) return;
    const modal = document.getElementById("modalShareEmbed");
    if (modal) modal.style.display = "none";
}

function switchShareTab(tab) {
    const btnLink = document.getElementById("tabShareLink");
    const btnEmbed = document.getElementById("tabShareEmbed");
    const paneLink = document.getElementById("paneShareLink");
    const paneEmbed = document.getElementById("paneShareEmbed");

    if (btnLink && btnEmbed && paneLink && paneEmbed) {
        btnLink.classList.toggle("active", tab === 'link');
        btnEmbed.classList.toggle("active", tab === 'embed');
        paneLink.style.display = tab === 'link' ? 'block' : 'none';
        paneEmbed.style.display = tab === 'embed' ? 'block' : 'none';
    }
}

function copyShareUrl() {
    const input = document.getElementById("shareUrlInput");
    if (input) {
        input.select();
        navigator.clipboard.writeText(input.value).then(() => {
            if (typeof showNotification === 'function') showNotification("Link peta berhasil disalin ke papan klip!");
        }).catch(() => {
            document.execCommand('copy');
            if (typeof showNotification === 'function') showNotification("Link peta berhasil disalin!");
        });
    }
}

function copyEmbedIframe() {
    const input = document.getElementById("shareEmbedInput");
    if (input) {
        input.select();
        navigator.clipboard.writeText(input.value).then(() => {
            if (typeof showNotification === 'function') showNotification("Kode embed peta berhasil disalin!");
        }).catch(() => {
            document.execCommand('copy');
            if (typeof showNotification === 'function') showNotification("Kode embed peta berhasil disalin!");
        });
    }
}

// ==================== 3. MODAL TENTANG SEISMOGRAF & DEVELOPER (DYNAMIC DOM) ====================
function ensureAppInfoModalDOM() {
    let modal = document.getElementById("modalAppInfo");
    if (!modal) {
        modal = document.createElement("div");
        modal.className = "modal-backdrop";
        modal.id = "modalAppInfo";
        modal.style.display = "none";
        modal.onclick = (e) => closeAppInfo(e);
        modal.innerHTML = `
        <div class="modal-dialog info-modal-dialog" onclick="event.stopPropagation()">
            <div class="modal-header">
                <div class="modal-title-wrap">
                    <div class="modal-icon-badge" style="background: rgba(26, 115, 232, 0.12); color: var(--accent-blue);">
                        <span class="google-symbols" style="font-size: 22px;">&#xe88e;</span>
                    </div>
                    <div>
                        <h3 class="modal-title">Tentang Seismograf</h3>
                        <p class="modal-sub">Monitor Seismik Real-Time • Google Maps Edition</p>
                    </div>
                </div>
                <button class="modal-close-btn" onclick="closeAppInfo()" title="Tutup">
                    <span class="google-symbols" style="font-size: 20px;">&#xe5cd;</span>
                </button>
            </div>

            <div class="modal-body-scroll">
                <div class="guide-card-section">
                    <div class="app-info-hero">
                        <div class="app-info-logo-wrap">
                            <span class="google-symbols" style="font-size: 28px; color: var(--accent-blue);">&#xe80b;</span>
                        </div>
                        <div>
                            <div class="app-info-name">Seismograph Gracely</div>
                            <div class="app-info-version">Versi 2.5.0 (Google Maps Edition)</div>
                        </div>
                    </div>
                    <p class="app-info-desc">
                        Aplikasi pemantauan aktivitas gempa bumi seismik waktu-nyata (real-time) di seluruh wilayah Indonesia dan dunia dengan integrasi multi-sumber resmi dari <strong>BMKG</strong> (Badan Meteorologi, Klimatologi, dan Geofisika) serta <strong>USGS</strong> (United States Geological Survey).
                    </p>
                    <div class="app-feature-pills">
                        <span class="feature-pill">⚡ Live BMKG &amp; USGS</span>
                        <span class="feature-pill">🔊 Sinyal Audio Peringatan</span>
                        <span class="feature-pill">🌊 Peta Sesar &amp; Megathrust</span>
                        <span class="feature-pill">📏 Kalkulasi Jarak GPS</span>
                        <span class="feature-pill">📱 Dukungan Offline PWA</span>
                    </div>
                </div>

                <div class="guide-card-section">
                    <h4 class="guide-section-title">
                        <span class="google-symbols" style="font-size: 18px; color: var(--accent-blue);">&#xe7fd;</span>
                        Pengembang Aplikasi
                    </h4>
                    <div class="dev-profile-card">
                        <div class="dev-avatar-wrap">
                            <div class="dev-avatar-initial">PS</div>
                            <div class="dev-verified-badge" title="Verified Developer">
                                <span class="google-symbols" style="font-size: 14px; color: #1a73e8;">&#xe86c;</span>
                            </div>
                        </div>
                        <div class="dev-info">
                            <div class="dev-name">Petrus Siahaan</div>
                            <div class="dev-role">Full-Stack Web &amp; GIS Developer</div>
                            <div class="dev-location"><span class="google-symbols" style="font-size: 14px; color: #ea4335;">&#xe0c8;</span> Indonesia</div>
                        </div>
                    </div>

                    <div class="dev-links-grid">
                        <a href="https://petrus.gracely.my.id/" target="_blank" rel="noopener noreferrer" class="dev-link-btn" title="Kunjungi Situs Resmi Petrus Siahaan">
                            <div class="dev-link-icon-wrap" style="background: rgba(26, 115, 232, 0.15); color: #1a73e8;">
                                <span class="google-symbols" style="font-size: 20px;">&#xe80b;</span>
                            </div>
                            <div class="dev-link-text">
                                <div class="dev-link-label">Situs Web</div>
                                <div class="dev-link-val">petrus.gracely.my.id</div>
                            </div>
                            <span class="google-symbols dev-link-arrow" style="font-size: 18px;">&#xe895;</span>
                        </a>

                        <a href="https://www.instagram.com/petrusperdana1/" target="_blank" rel="noopener noreferrer" class="dev-link-btn" title="Kunjungi Instagram @petrusperdana1">
                            <div class="dev-link-icon-wrap" style="background: rgba(225, 48, 108, 0.15); color: #e1306c;">
                                <span class="google-symbols" style="font-size: 20px;">&#xe39e;</span>
                            </div>
                            <div class="dev-link-text">
                                <div class="dev-link-label">Instagram</div>
                                <div class="dev-link-val">@petrusperdana1</div>
                            </div>
                            <span class="google-symbols dev-link-arrow" style="font-size: 18px;">&#xe895;</span>
                        </a>

                        <a href="https://www.facebook.com/petrusperdana1" target="_blank" rel="noopener noreferrer" class="dev-link-btn" title="Kunjungi Facebook Petrus Perdana">
                            <div class="dev-link-icon-wrap" style="background: rgba(24, 119, 242, 0.15); color: #1877f2;">
                                <span class="google-symbols" style="font-size: 20px;">&#xe80d;</span>
                            </div>
                            <div class="dev-link-text">
                                <div class="dev-link-label">Facebook</div>
                                <div class="dev-link-val">petrusperdana1</div>
                            </div>
                            <span class="google-symbols dev-link-arrow" style="font-size: 18px;">&#xe895;</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.appendChild(modal);
    }
    return modal;
}

function openAppInfo() {
    if (typeof closeDesktopSettings === 'function') closeDesktopSettings();
    const modal = ensureAppInfoModalDOM();
    if (modal) modal.style.display = "flex";
}

function closeAppInfo(e) {
    if (e && e.target && e.target !== e.currentTarget) return;
    const modal = document.getElementById("modalAppInfo");
    if (modal) modal.style.display = "none";
}

// ==================== 4. MODAL PANDUAN SIAGA MITIGASI & KONTAK DARURAT (DYNAMIC DOM) ====================
function ensureDisasterGuideModalDOM() {
    let modal = document.getElementById("modalDisasterGuide");
    if (!modal) {
        modal = document.createElement("div");
        modal.className = "modal-backdrop";
        modal.id = "modalDisasterGuide";
        modal.style.display = "none";
        modal.onclick = (e) => closeDisasterGuide(e);
        modal.innerHTML = `
        <div class="modal-dialog guide-modal-dialog" onclick="event.stopPropagation()">
            <div class="modal-header">
                <div class="modal-title-wrap">
                    <div class="modal-icon-badge" style="background: rgba(234, 67, 53, 0.12); color: #ea4335;">
                        <span class="google-symbols" style="font-size: 22px;">&#xe002;</span>
                    </div>
                    <div>
                        <h3 class="modal-title">Panduan Siaga Bencana Gempa</h3>
                        <p class="modal-sub">Prosedur Keselamatan &amp; Mitigasi Standar BNPB / BMKG</p>
                    </div>
                </div>
                <button class="modal-close-btn" onclick="closeDisasterGuide()" title="Tutup">
                    <span class="google-symbols" style="font-size: 20px;">&#xe5cd;</span>
                </button>
            </div>

            <div class="modal-body-scroll">
                <div class="guide-card-section">
                    <h4 class="guide-section-title">🚨 3 Langkah Utama Saat Terjadi Gempa</h4>
                    <div class="step-grid">
                        <div class="step-box">
                            <div class="step-num">1</div>
                            <div class="step-head">DROP (Merunduk)</div>
                            <div class="step-desc">Segera rendahkan tubuh Anda ke lantai sebelum guncangan menjatuhkan Anda.</div>
                        </div>
                        <div class="step-box">
                            <div class="step-num">2</div>
                            <div class="step-head">COVER (Lindungi)</div>
                            <div class="step-desc">Lindungi kepala dan leher di bawah meja kokoh atau dengan tas / bantal.</div>
                        </div>
                        <div class="step-box">
                            <div class="step-num">3</div>
                            <div class="step-head">HOLD ON (Bertahan)</div>
                            <div class="step-desc">Pegang kuat kaki meja dan tetap berlindung sampai guncangan benar-benar berhenti.</div>
                        </div>
                    </div>
                </div>

                <div class="guide-card-section">
                    <h4 class="guide-section-title">🏢 Tindakan Berdasarkan Lokasi Anda</h4>
                    <ul class="guide-list">
                        <li><strong>Di Dalam Gedung / Rumah:</strong> Jauhi jendela kaca, cermin, lemari tinggi, dan lampu gantung. Jangan gunakan lift! Gunakan tangga darurat.</li>
                        <li><strong>Di Luar Ruangan:</strong> Menjauh dari tiang listrik, papan reklame, pohon besar, jembatan penyeberangan, dan dinding bata. Cari lapangan terbuka.</li>
                        <li><strong>Di Dekat Pantai:</strong> Jika gempa terasa kuat (>20 detik) atau air laut surut tiba-tiba, <em>segera evakuasi ke tempat tinggi minimal 20 meter</em> (Waspada Tsunami!).</li>
                        <li><strong>Di Dalam Kendaraan:</strong> Kurangi kecepatan perlahan, menepi ke bahu jalan yang aman, dan matikan mesin. Tetap di dalam mobil sampai gempa reda.</li>
                    </ul>
                </div>

                <div class="guide-card-section">
                    <h4 class="guide-section-title">🎒 Perlengkapan Tas Siaga Bencana (TSB)</h4>
                    <div class="tsb-chips-grid">
                        <div class="tsb-item">💊 Kotak P3K &amp; Obat Pribadi</div>
                        <div class="tsb-item">🔦 Senter &amp; Baterai Cadangan</div>
                        <div class="tsb-item">📢 Peluit Darurat (Sinyal Suara)</div>
                        <div class="tsb-item">💧 Air Minum (Minimal 3 Hari)</div>
                        <div class="tsb-item">🍞 Makanan Siap Saji / Biskuit</div>
                        <div class="tsb-item">📻 Radio Portable (Info Darurat)</div>
                        <div class="tsb-item">📄 Dokumen Penting (Plastik Kedap)</div>
                        <div class="tsb-item">🔋 Powerbank &amp; Kabel Charger</div>
                        <div class="tsb-item">💵 Uang Tunai Secukupnya</div>
                        <div class="tsb-item">😷 Masker &amp; Hand Sanitizer</div>
                    </div>
                </div>

                <div class="guide-card-section">
                    <h4 class="guide-section-title">📞 Kontak Nomor Darurat Nasional Indonesia</h4>
                    <div class="emergency-contacts-grid">
                        <a href="tel:115" class="contact-card" onclick="handleContactClick('115', 'BASARNAS', event)" title="Klik untuk Panggil / Salin Nomor 115">
                            <div class="contact-icon" style="background:#ea4335;">115</div>
                            <div class="contact-info">
                                <div class="contact-name">BASARNAS (115)</div>
                                <div class="contact-desc">Pencarian &amp; Pertolongan Jiwa</div>
                            </div>
                        </a>
                        <a href="tel:117" class="contact-card" onclick="handleContactClick('117', 'BNPB / BPBD', event)" title="Klik untuk Panggil / Salin Nomor 117">
                            <div class="contact-icon" style="background:#f29900;">117</div>
                            <div class="contact-info">
                                <div class="contact-name">BNPB / BPBD (117)</div>
                                <div class="contact-desc">Pusat Pengendalian Bencana</div>
                            </div>
                        </a>
                        <a href="tel:118" class="contact-card" onclick="handleContactClick('118', 'Ambulans / PMI', event)" title="Klik untuk Panggil / Salin Nomor 118 / 119">
                            <div class="contact-icon" style="background:#34a853;">118</div>
                            <div class="contact-info">
                                <div class="contact-name">Ambulans / PMI (118/119)</div>
                                <div class="contact-desc">Pertolongan Medis Gawat Darurat</div>
                            </div>
                        </a>
                        <a href="tel:110" class="contact-card" onclick="handleContactClick('110', 'Kepolisian RI', event)" title="Klik untuk Panggil / Salin Nomor 110">
                            <div class="contact-icon" style="background:#1a73e8;">110</div>
                            <div class="contact-info">
                                <div class="contact-name">Kepolisian RI (110)</div>
                                <div class="contact-desc">Bantuan Keamanan &amp; Ketertiban</div>
                            </div>
                        </a>
                        <a href="tel:113" class="contact-card" onclick="handleContactClick('113', 'Pemadam Kebakaran', event)" title="Klik untuk Panggil / Salin Nomor 113">
                            <div class="contact-icon" style="background:#d93025;">113</div>
                            <div class="contact-info">
                                <div class="contact-name">Damkar (113)</div>
                                <div class="contact-desc">Evakuasi &amp; Bahaya Kebakaran</div>
                            </div>
                        </a>
                        <a href="tel:112" class="contact-card" onclick="handleContactClick('112', 'Panggilan Terpadu', event)" title="Klik untuk Panggil / Salin Nomor 112">
                            <div class="contact-icon" style="background:#673ab7;">112</div>
                            <div class="contact-info">
                                <div class="contact-name">Panggilan Terpadu (112)</div>
                                <div class="contact-desc">Nomor Darurat Terintegrasi</div>
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.appendChild(modal);
    }
    return modal;
}

function openDisasterGuide() {
    const modal = ensureDisasterGuideModalDOM();
    if (modal) modal.style.display = "flex";
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
            font-family: "Google Sans Text", "Google Sans", Roboto, Arial, sans-serif;
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

// ==================== 4B. TAB 5: SIAGA MITIGASI & KONTAK DARURAT (PANEL VIEW TAB DYNAMIC INJECTION) ====================
function ensureGuideTabDOM() {
    let tab = document.getElementById("viewGuide");
    if (!tab) {
        const wrap = document.getElementById("cardsScrollWrap") || document.getElementById("mainPanel") || document.getElementById("panelContainer");
        if (wrap) {
            tab = document.createElement("div");
            tab.className = "panel-view-tab";
            tab.id = "viewGuide";
            tab.style.display = "none";
            tab.innerHTML = `
                <!-- HEADER SIAGA -->
                <div class="tab-screen-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="google-symbols" style="font-size: 22px; color: #ea4335;">&#xe002;</span>
                        <h1 class="tab-screen-title">Panduan Siaga</h1>
                    </div>
                </div>

                <!-- 1. TIGA LANGKAH UTAMA -->
                <div class="section-container">
                    <div class="section-title-main" style="margin-bottom: 8px;">🚨 3 Langkah Utama Saat Gempa</div>
                    <div class="step-grid">
                        <div class="step-box">
                            <div class="step-num">1</div>
                            <div class="step-head">DROP (Merunduk)</div>
                            <div class="step-desc">Segera rendahkan tubuh Anda ke lantai sebelum guncangan menjatuhkan Anda.</div>
                        </div>
                        <div class="step-box">
                            <div class="step-num">2</div>
                            <div class="step-head">COVER (Lindungi)</div>
                            <div class="step-desc">Lindungi kepala dan leher di bawah meja kokoh atau dengan tas / bantal.</div>
                        </div>
                        <div class="step-box">
                            <div class="step-num">3</div>
                            <div class="step-head">HOLD ON (Bertahan)</div>
                            <div class="step-desc">Pegang kuat kaki meja dan tetap berlindung sampai guncangan benar-benar berhenti.</div>
                        </div>
                    </div>
                </div>

                <!-- 2. PANDUAN BERDASARKAN LOKASI -->
                <div class="section-container">
                    <div class="section-title-main" style="margin-bottom: 8px;">🏢 Tindakan Berdasarkan Lokasi</div>
                    <div class="g-card" style="margin-bottom: 0;">
                        <ul class="guide-list" style="margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.6; color: var(--text-secondary);">
                            <li><strong>Di Dalam Gedung / Rumah:</strong> Jauhi jendela kaca, cermin, dan lemari tinggi. Jangan gunakan lift! Gunakan tangga darurat.</li>
                            <li><strong>Di Luar Ruangan:</strong> Menjauh dari tiang listrik, papan reklame, pohon besar, dan dinding bata. Cari lapangan terbuka.</li>
                            <li><strong>Di Dekat Pantai:</strong> Jika gempa terasa kuat (>20 detik) atau air laut surut tiba-tiba, <em>segera evakuasi ke tempat tinggi minimal 20 meter</em> (Waspada Tsunami!).</li>
                            <li><strong>Di Dalam Kendaraan:</strong> Kurangi kecepatan perlahan, menepi ke bahu jalan yang aman, dan matikan mesin. Tetap di dalam mobil sampai gempa reda.</li>
                        </ul>
                    </div>
                </div>

                <!-- 3. TAS SIAGA BENCANA -->
                <div class="section-container">
                    <div class="section-title-main" style="margin-bottom: 8px;">🎒 Tas Siaga Bencana (TSB)</div>
                    <div class="tsb-chips-grid">
                        <div class="tsb-item">💊 Kotak P3K &amp; Obat</div>
                        <div class="tsb-item">🔦 Senter &amp; Baterai</div>
                        <div class="tsb-item">📢 Peluit Darurat</div>
                        <div class="tsb-item">💧 Air Minum (3 Hari)</div>
                        <div class="tsb-item">🍞 Makanan Siap Saji</div>
                        <div class="tsb-item">📻 Radio Portable</div>
                        <div class="tsb-item">📄 Dokumen Penting</div>
                        <div class="tsb-item">🔋 Powerbank &amp; Kabel</div>
                        <div class="tsb-item">💵 Uang Tunai</div>
                        <div class="tsb-item">😷 Masker &amp; Sanitizer</div>
                    </div>
                </div>

                <!-- 4. KONTAK DARURAT CEPAT -->
                <div class="section-container" style="margin-bottom: 24px;">
                    <div class="section-title-main" style="margin-bottom: 8px;">📞 Kontak Nomor Darurat Nasional</div>
                    <div class="emergency-contacts-grid">
                        <a href="tel:115" class="contact-card" onclick="handleContactClick('115', 'BASARNAS', event)" title="Panggil 115 BASARNAS">
                            <div class="contact-icon" style="background:#ea4335;">115</div>
                            <div class="contact-info">
                                <div class="contact-name">BASARNAS (115)</div>
                                <div class="contact-desc">Pencarian &amp; Pertolongan Jiwa</div>
                            </div>
                        </a>
                        <a href="tel:117" class="contact-card" onclick="handleContactClick('117', 'BNPB / BPBD', event)" title="Panggil 117 BNPB / BPBD">
                            <div class="contact-icon" style="background:#f29900;">117</div>
                            <div class="contact-info">
                                <div class="contact-name">BNPB / BPBD (117)</div>
                                <div class="contact-desc">Pusat Pengendalian Bencana</div>
                            </div>
                        </a>
                        <a href="tel:118" class="contact-card" onclick="handleContactClick('118', 'Ambulans / PMI', event)" title="Panggil 118 Ambulans">
                            <div class="contact-icon" style="background:#34a853;">118</div>
                            <div class="contact-info">
                                <div class="contact-name">Ambulans / PMI (118)</div>
                                <div class="contact-desc">Medis Gawat Darurat</div>
                            </div>
                        </a>
                        <a href="tel:110" class="contact-card" onclick="handleContactClick('110', 'Kepolisian RI', event)" title="Panggil 110 Polisi">
                            <div class="contact-icon" style="background:#1a73e8;">110</div>
                            <div class="contact-info">
                                <div class="contact-name">Kepolisian RI (110)</div>
                                <div class="contact-desc">Bantuan Keamanan</div>
                            </div>
                        </a>
                        <a href="tel:113" class="contact-card" onclick="handleContactClick('113', 'Damkar', event)" title="Panggil 113 Damkar">
                            <div class="contact-icon" style="background:#d93025;">113</div>
                            <div class="contact-info">
                                <div class="contact-name">Damkar (113)</div>
                                <div class="contact-desc">Evakuasi &amp; Kebakaran</div>
                            </div>
                        </a>
                        <a href="tel:112" class="contact-card" onclick="handleContactClick('112', 'Panggilan Terpadu', event)" title="Panggil 112 Panggilan Terpadu">
                            <div class="contact-icon" style="background:#673ab7;">112</div>
                            <div class="contact-info">
                                <div class="contact-name">Panggilan Terpadu (112)</div>
                                <div class="contact-desc">Nomor Darurat Terintegrasi</div>
                            </div>
                        </a>
                    </div>
                </div>
            `;
            wrap.appendChild(tab);
        }
    }
    return tab;
}

// ==================== 5. SIMULASI GEMPA EKSPERIMEN ====================
let simTimer = null;

function simulateEarthquake(mag) {
    if (typeof stopSimulation === 'function') stopSimulation();
    
    const magnitude = parseFloat(mag) || 5.0;
    const simTitle = `[SIMULASI] Gempa M ${magnitude.toFixed(1)} Eksperimen`;
    
    if (typeof showNotification === 'function') {
        showNotification(`Memulai Simulasi Gempa M ${magnitude.toFixed(1)}...`);
    }

    // Trigger waveform disturbance
    if (typeof triggerSimulatedWaveform === 'function') {
        triggerSimulatedWaveform(magnitude);
    }

    // Trigger synthetic audio alert if enabled
    if (typeof playSirenAlert === 'function' && !window.isMuted) {
        playSirenAlert(magnitude);
    }
}

function stopSimulation() {
    if (simTimer) {
        clearInterval(simTimer);
        simTimer = null;
    }
}

// ==================== 6. HISTATS ANALYTICS TRACKER ====================
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

// Tutup semua modal on-demand dengan tombol Esc
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeDisasterGuide();
        closeAppInfo();
        closeShareModal();
        closeLanguageModal();
    }
});

// Inisialisasi bahasa tersimpan saat halaman dimuat
document.addEventListener("DOMContentLoaded", () => {
    try {
        const savedLang = localStorage.getItem("seismik_lang");
        if (savedLang && savedLang !== 'id') {
            currentAppLanguage = savedLang;
            const targetCode = (savedLang === 'zh-cn' ? 'zh-CN' : (savedLang === 'zh-tw' ? 'zh-TW' : (savedLang === 'pt-br' ? 'pt' : (savedLang === 'pt-pt' ? 'pt' : (savedLang === 'es-419' ? 'es' : savedLang)))));
            setTimeout(() => {
                triggerGoogleTranslate(targetCode);
                applyLanguage(savedLang);
            }, 350);
        }
    } catch(e){}
});

