// ═══════════════════════════════════════════════════════
//  DYNAMIC CONFIGURATION FROM FLASK
// ═══════════════════════════════════════════════════════
const systemsData = JSON.parse(document.getElementById('systems-data').textContent);

// ── BASE PATH (supports sub-path deployment e.g. /tools/finition) ────────────
const base = (typeof window !== 'undefined' && window.location.pathname.startsWith('/tools/finition'))
    ? '/tools/finition' : '';

// Patch @font-face URLs that can't use JS variables directly
document.querySelectorAll('style').forEach(s => {
    if (s.textContent.includes('__BASE__')) {
        s.textContent = s.textContent.replaceAll('__BASE__', base);
    }
});
const SYSTEMS = Object.keys(systemsData);
const SYSTEM_DISPLAY = {};
const SYSTEM_PATTERN = {};
const PREFIX_MAP = {};

SYSTEMS.forEach(key => {
    const info = systemsData[key];
    SYSTEM_DISPLAY[key] = info.display;
    SYSTEM_PATTERN[key] = info.pattern;
    if (info.pattern.endsWith('_%')) {
        const prefix = info.pattern.slice(0, -2);
        PREFIX_MAP[prefix] = key;
    }
});

const imagesBySystem = {};
const activeTab = { gallery: SYSTEMS[0], stock: SYSTEMS[0], favorites: SYSTEMS[0] };

// ═══════════════════════════════════════════════════════
//  STORAGE HELPERS
// ═══════════════════════════════════════════════════════
function store(key) {
    return {
        get()      { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
        set(v)     { localStorage.setItem(key, JSON.stringify(v)); },
        has(c1,c2) { return this.get().some(x => x.code1===c1 && x.code2===c2); },
        toggle(c1, c2, img, addMsg, rmMsg) {
            const list = this.get();
            const idx  = list.findIndex(x => x.code1===c1 && x.code2===c2);
            if (idx === -1) { list.push({code1:c1, code2:c2, image:img}); showToast(addMsg); }
            else            { list.splice(idx, 1);                        showToast(rmMsg);  }
            this.set(list);
        }
    };
}

const favStore   = store('tecnibo_favorites');
const stockStore = store('tecnibo_stock');

// ═══════════════════════════════════════════════════════
//  CARD BUILDER
// ═══════════════════════════════════════════════════════
function buildCard(code1, code2, image, delay = 0) {
    const div = document.createElement('div');
    div.className = 'gallery-item';
    div.dataset.code1 = code1;
    div.dataset.code2 = code2;
    div.style.animationDelay = delay + 's';
    div.innerHTML = `
        <div class="card">
            <div class="card-img-wrap">
                <img src="${base}/images/${image}" alt="${code1} ${code2}" loading="lazy">
            </div>
            <div class="card-body">
                <div class="card-info">
                    <div class="card-code1">${code1}</div>
                    <div class="card-code2">${code2}</div>
                </div>
                <div class="card-actions">
                    <button class="action-btn stock-btn ${stockStore.has(code1,code2)?'active':''}" title="Add to Stock">
                        <svg width="16" height="16" viewBox="0 0 24 24">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                            <line x1="12" y1="22.08" x2="12" y2="12"/>
                        </svg>
                    </button>
                    <button class="action-btn fav-btn ${favStore.has(code1,code2)?'active':''}" title="Add to Favorites">
                        <svg width="16" height="16" viewBox="0 0 24 24">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="card-barcode" style="display:none;">
                <svg class="barcode-svg"></svg>
            </div>
        </div>`;

    try {
        JsBarcode(div.querySelector('.barcode-svg'), code1, {
            format: 'CODE128',
            width: 1.2,
            height: 28,
            displayValue: false,
            margin: 2,
            lineColor: '#111',
            background: '#ffffff',
        });
    } catch(e) { div.querySelector('.card-barcode').style.display = 'none'; }

    div.querySelector('.fav-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        favStore.toggle(code1, code2, image, `♥ ${code1} added to Favorites`, `${code1} removed from Favorites`);
        this.classList.toggle('active');
        pop(this);
        const activePage = document.querySelector('.page.active')?.id;
        if (activePage === 'page-favorites') {
            const sys = activeTab.favorites;
            renderFavorites(sys, imagesBySystem[sys] || []);
        }
    });

    div.querySelector('.stock-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        stockStore.toggle(code1, code2, image, `📦 ${code1} added to Stock`, `${code1} removed from Stock`);
        this.classList.toggle('active');
        pop(this);
        const activePage = document.querySelector('.page.active')?.id;
        if (activePage === 'page-stock') {
            const sys = activeTab.stock;
            renderStock(sys, imagesBySystem[sys] || []);
        }
    });

    return div;
}

function pop(btn) {
    btn.classList.remove('pop'); void btn.offsetWidth;
    btn.classList.add('pop');
    btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });
}

// ═══════════════════════════════════════════════════════
//  LOAD DATA
// ═══════════════════════════════════════════════════════
function loadSystem(key, callback) {
    if (imagesBySystem[key]) { callback(imagesBySystem[key]); return; }

    const grid = document.getElementById('gallery-grid');
    if (grid && document.querySelector('.page.active')?.id === 'page-gallery') {
        grid.innerHTML = `<div style="display:contents">${
            Array(20).fill(`<div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-body"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>`).join('')
        }</div>`;
    }

    fetch(`${base}/api/images/${key}`)
        .then(r => r.json())
        .then(data => {
            imagesBySystem[key] = data;
            const el = document.getElementById(`gallery-count-${key}`);
            if (el) el.textContent = data.length;
            const activePage = document.querySelector('.page.active')?.id;
            if (activePage === 'page-stock')     updateTabVisibility('stock',     stockStore.get());
            if (activePage === 'page-favorites') updateTabVisibility('favorites', favStore.get());
            callback(data);
        })
        .catch(err => {
            console.error(`Failed to load ${key}:`, err);
            callback([]);
        });
}

// ═══════════════════════════════════════════════════════
//  TAB SWITCHER
// ═══════════════════════════════════════════════════════
function switchTab(page, system) {
    activeTab[page] = system;

    const tabsId = page === 'favorites' ? 'fav-tabs' : `${page}-tabs`;
    document.querySelectorAll(`#${tabsId} .tab`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.system === system);
    });

    const term = document.getElementById('searchInput').value.toLowerCase().trim();

    if (page === 'gallery') {
        loadSystem(system, data => renderGrid('gallery-grid', data, term));
    } else if (page === 'stock') {
        if (stockStore.get().length === 0) {
            document.getElementById('stock-content').style.display = 'none';
            document.getElementById('stock-empty').style.display = 'flex';
            return;
        }
        loadSystem(system, data => renderStock(system, data, term));
    } else if (page === 'favorites') {
        if (favStore.get().length === 0) {
            document.getElementById('fav-content').style.display = 'none';
            document.getElementById('fav-empty').style.display = 'flex';
            return;
        }
        loadSystem(system, data => renderFavorites(system, data, term));
    }
}

// ═══════════════════════════════════════════════════════
//  RENDER HELPERS
// ═══════════════════════════════════════════════════════
function renderGrid(gridId, items, term = '') {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';
    const filtered = term
        ? items.filter(i => i.code1.toLowerCase().includes(term) || i.code2.toLowerCase().includes(term))
        : items;
    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state">No colours found.</div>`;
        return;
    }
    filtered.forEach((item, i) => grid.appendChild(buildCard(item.code1, item.code2, item.image, i * 0.02)));
}

function updateTabVisibility(page, savedItems) {
    const prefix    = page === 'favorites' ? 'fav' : 'stock';
    const container = document.getElementById(`${prefix}-tabs`);
    SYSTEMS.forEach(key => {
        const sysData = imagesBySystem[key] || [];
        const n       = sysData.filter(i => savedItems.some(s => s.code1 === i.code1 && s.code2 === i.code2)).length;
        const existing = container ? container.querySelector(`.tab[data-system="${key}"]`) : null;
        const countEl  = document.getElementById(`${prefix}-count-${key}`);

        if (n > 0) {
            // Add tab if it doesn't exist yet
            if (!existing && container) {
                const tab = buildTab(page, key, SYSTEM_DISPLAY[key], false);
                container.appendChild(tab);
            } else if (existing) {
                existing.style.display = '';
            }
            const el = document.getElementById(`${prefix}-count-${key}`);
            if (el) el.textContent = n;
        } else {
            // Hide tab if no saved items
            if (existing) existing.style.display = 'none';
            if (countEl) countEl.textContent = '';
        }
    });
}

function renderStock(system, data, term = '') {
    const saved   = stockStore.get();
    const content = document.getElementById('stock-content');
    const emptyEl = document.getElementById('stock-empty');
    const grid    = document.getElementById('stock-grid');

    if (saved.length === 0) {
        content.style.display = 'none';
        emptyEl.style.display = 'flex';
        return;
    }

    content.style.display = '';
    emptyEl.style.display = 'none';

    updateTabVisibility('stock', saved);

    const thisCount = (data || []).filter(i => saved.some(s => s.code1 === i.code1 && s.code2 === i.code2)).length;
    if (thisCount === 0) {
        const first = SYSTEMS.find(key => {
            const d = imagesBySystem[key] || [];
            return d.some(i => saved.some(s => s.code1 === i.code1 && s.code2 === i.code2));
        });
        if (first && first !== system) { switchTab('stock', first); return; }
    }

    const items = (data || []).filter(i => saved.some(s => s.code1 === i.code1 && s.code2 === i.code2));
    const filtered = term ? items.filter(i => i.code1.toLowerCase().includes(term) || i.code2.toLowerCase().includes(term)) : items;
    grid.innerHTML = '';
    filtered.forEach((item, i) => grid.appendChild(buildCard(item.code1, item.code2, item.image, i * 0.02)));
    if (filtered.length === 0) grid.innerHTML = `<div class="empty-state">No matches.</div>`;
}

function renderFavorites(system, data, term = '') {
    const saved   = favStore.get();
    const content = document.getElementById('fav-content');
    const emptyEl = document.getElementById('fav-empty');
    const grid    = document.getElementById('fav-grid');

    if (saved.length === 0) {
        content.style.display = 'none';
        emptyEl.style.display = 'flex';
        return;
    }

    content.style.display = '';
    emptyEl.style.display = 'none';

    updateTabVisibility('favorites', saved);

    const thisCount = (data || []).filter(i => saved.some(f => f.code1 === i.code1 && f.code2 === i.code2)).length;
    if (thisCount === 0) {
        const first = SYSTEMS.find(key => {
            const d = imagesBySystem[key] || [];
            return d.some(i => saved.some(f => f.code1 === i.code1 && f.code2 === i.code2));
        });
        if (first && first !== system) { switchTab('favorites', first); return; }
    }

    const items = (data || []).filter(i => saved.some(f => f.code1 === i.code1 && f.code2 === i.code2));
    const filtered = term ? items.filter(i => i.code1.toLowerCase().includes(term) || i.code2.toLowerCase().includes(term)) : items;
    grid.innerHTML = '';
    filtered.forEach((item, i) => grid.appendChild(buildCard(item.code1, item.code2, item.image, i * 0.02)));
    if (filtered.length === 0) grid.innerHTML = `<div class="empty-state">No matches.</div>`;
}

// ═══════════════════════════════════════════════════════
//  SEARCH
// ═══════════════════════════════════════════════════════
document.getElementById('searchInput').addEventListener('input', function () {
    const term = this.value.toLowerCase().trim();
    const activePage = document.querySelector('.page.active')?.id;
    if (activePage === 'page-gallery') {
        const data = imagesBySystem[activeTab.gallery] || [];
        renderGrid('gallery-grid', data, term);
    } else if (activePage === 'page-stock') {
        const sys = activeTab.stock;
        renderStock(sys, imagesBySystem[sys] || [], term);
    } else if (activePage === 'page-favorites') {
        const sys = activeTab.favorites;
        renderFavorites(sys, imagesBySystem[sys] || [], term);
    }
});

// ═══════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════
function handleNav(e) {
    const target = e.currentTarget.dataset.nav;
    if (target) navigateTo(target);
}

function navigateTo(target) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === target));
    document.getElementById('page-' + target).classList.add('active');

    const searchEl = document.getElementById('searchInput');
    searchEl.value = '';
    searchEl.parentElement.style.opacity = '1';
    searchEl.disabled = false;

    switchTab(target, activeTab[target]);

    const paths = { gallery: `${base}/`, stock: `${base}/stock-tecnibo`, favorites: `${base}/favorites` };
    history.pushState({ page: target }, '', paths[target]);
}

document.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', handleNav));
window.addEventListener('popstate', e => navigateTo(e.state?.page || 'gallery'));

const initialPage = location.pathname.includes('stock-tecnibo') ? 'stock'
    : location.pathname.includes('favorites') ? 'favorites' : 'gallery';
if (initialPage !== 'gallery') navigateTo(initialPage);

// ═══════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════
let toastTimer;
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ═══════════════════════════════════════════════════════
//  DELETE SYSTEM
// ═══════════════════════════════════════════════════════
let pendingDeleteKey  = null;
let pendingDeleteFull = false; // true = from Gallery (full delete), false = Stock/Fav only (local hide)

function openDeleteModal(key, fromGallery) {
    pendingDeleteKey  = key;
    pendingDeleteFull = fromGallery;
    document.getElementById('delSystemName').textContent = `"${SYSTEM_DISPLAY[key] || key}"`;
    document.getElementById('delSystemDesc').innerHTML = fromGallery
        ? 'This will remove it from <em>Gallery</em> only. Stock and Favorites will not be affected.'
        : 'This will permanently remove it from <em>Gallery</em>, <em>Stock</em> and <em>Favorites</em> everywhere.';
    document.getElementById('delOverlay').style.display = 'flex';
}

function closeDeleteModal() {
    pendingDeleteKey  = null;
    pendingDeleteFull = false;
    document.getElementById('delOverlay').style.display = 'none';
}

document.getElementById('delCancel').addEventListener('click', closeDeleteModal);
document.getElementById('delOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDeleteModal();
});

document.getElementById('delConfirm').addEventListener('click', async () => {
    const key         = pendingDeleteKey;
    const fromGallery = pendingDeleteFull;
    if (!key) return;

    // Always call backend to persist the deletion
    const response = await fetch(`${base}/api/systems/${key}`, { method: 'DELETE' });
    const result   = await response.json();

    if (!response.ok) {
        showToast(`Error: ${result.error}`);
        closeDeleteModal();
        return;
    }

    // Capture data BEFORE deleting from memory
    const deletedImages = imagesBySystem[key] || [];
    const deletedPattern = SYSTEM_PATTERN[key] || '';
    const deletedPrefix  = deletedPattern.endsWith('_%')
        ? deletedPattern.slice(0, -2).toUpperCase() : null;

    // Remove from in-memory structures
    const idx = SYSTEMS.indexOf(key);
    if (idx !== -1) SYSTEMS.splice(idx, 1);
    delete SYSTEM_DISPLAY[key];
    delete SYSTEM_PATTERN[key];
    delete imagesBySystem[key];
    for (const [p, k] of Object.entries(PREFIX_MAP)) {
        if (k === key) delete PREFIX_MAP[p];
    }

    // Clear all saved stock/favorites belonging to this system
    // Uses both exact codes (if loaded) and pattern prefix (fallback)
    const deletedCodes = new Set(deletedImages.map(i => i.code1 + '|' + i.code2));
    function belongsToDeletedSystem(s) {
        if (deletedCodes.has(s.code1 + '|' + s.code2)) return true;
        if (deletedPrefix) {
            return s.code1.toUpperCase().startsWith(deletedPrefix) ||
                   s.code2.toUpperCase().startsWith(deletedPrefix);
        }
        return false;
    }
    stockStore.set(stockStore.get().filter(s => !belongsToDeletedSystem(s)));
    favStore.set(favStore.get().filter(s => !belongsToDeletedSystem(s)));

    // Remove tabs from all three bars
    ['gallery-tabs', 'stock-tabs', 'fav-tabs'].forEach(id => {
        const tab = document.querySelector(`#${id} .tab[data-system="${key}"]`);
        if (tab) tab.remove();
    });

    // Fix active tabs across all pages
    ['gallery', 'stock', 'favorites'].forEach(page => {
        if (activeTab[page] === key) activeTab[page] = SYSTEMS[0] || null;
    });

    closeDeleteModal();
    showToast('🗑 System deleted');

    // Re-render current page
    const activePage = document.querySelector('.page.active')?.id?.replace('page-', '');
    if (activePage && activeTab[activePage]) {
        switchTab(activePage, activeTab[activePage]);
    }
});

// ═══════════════════════════════════════════════════════
//  BARCODE SCANNER
// ═══════════════════════════════════════════════════════
function detectSystem(code) {
    const upper = code.toUpperCase().trim();
    for (const [prefix, key] of Object.entries(PREFIX_MAP)) {
        if (upper.startsWith(prefix)) return key;
    }
    return null;
}

function openScan() {
    const overlay = document.getElementById('scanOverlay');
    overlay.style.display = 'flex';
    setTimeout(() => document.getElementById('scanInput').focus(), 80);
    document.getElementById('scanInput').value = '';
    document.getElementById('scanStatus').textContent = '';
    document.getElementById('scanStatus').className = 'scan-status';
}

function closeScan() {
    document.getElementById('scanOverlay').style.display = 'none';
}

async function handleScan(rawCode) {
    const code = rawCode.trim();
    if (!code) return;
    const statusEl = document.getElementById('scanStatus');
    statusEl.className = 'scan-status';
    statusEl.textContent = '⏳ Searching…';

    const system = detectSystem(code);
    const systemsToSearch = system ? [system] : SYSTEMS;

    let found = null;
    let foundSystem = null;

    for (const key of systemsToSearch) {
        if (!imagesBySystem[key]) {
            await new Promise(resolve => {
                fetch(`${base}/api/images/${key}`)
                    .then(r => r.json())
                    .then(data => { imagesBySystem[key] = data; resolve(); })
                    .catch(() => resolve());
            });
        }
        const data = imagesBySystem[key] || [];
        const match = data.find(i =>
            i.code1.toUpperCase() === code.toUpperCase() ||
            i.code2.toUpperCase() === code.toUpperCase() ||
            i.code1.toUpperCase().replace(/\s/g,'') === code.toUpperCase().replace(/\s/g,'') ||
            i.code2.toUpperCase().replace(/\s/g,'') === code.toUpperCase().replace(/\s/g,'')
        );
        if (match) { found = match; foundSystem = key; break; }
    }

    if (found) {
        statusEl.className = 'scan-status found';
        statusEl.textContent = `✓ Found: ${found.code1} — ${found.code2}`;

        setTimeout(() => {
            closeScan();
            navigateTo('gallery');
            switchTab('gallery', foundSystem);

            setTimeout(() => {
                const card = document.querySelector(`.gallery-item[data-code1="${found.code1}"][data-code2="${found.code2}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('card-highlight');
                    setTimeout(() => card.classList.remove('card-highlight'), 2000);
                }
            }, 350);
        }, 700);
    } else {
        statusEl.className = 'scan-status notfound';
        statusEl.textContent = `✗ Code not found: "${code}"`;
    }
}

document.getElementById('scanBtn').addEventListener('click', openScan);
document.getElementById('scanClose').addEventListener('click', closeScan);
document.getElementById('scanOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeScan();
});

document.getElementById('scanInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleScan(e.target.value);
    }
});

let scanBuffer = '', scanTimer;
document.getElementById('scanInput').addEventListener('input', e => {
    scanBuffer = e.target.value;
    clearTimeout(scanTimer);
    if (scanBuffer.length > 4) {
        scanTimer = setTimeout(() => handleScan(scanBuffer), 120);
    }
});

document.addEventListener('keydown', e => {
    if (e.key === 'F2' || (e.ctrlKey && e.shiftKey && e.key === 'S')) {
        e.preventDefault();
        openScan();
    }
    if (e.key === 'Escape') {
        if (document.getElementById('scanOverlay').style.display !== 'none') closeScan();
        if (document.getElementById('delOverlay').style.display  !== 'none') closeDeleteModal();
    }
});

// ═══════════════════════════════════════════════════════
//  QR CODE
// ═══════════════════════════════════════════════════════
const PAGE_PATHS  = { gallery: `${base}/`, stock: `${base}/stock-tecnibo`, favorites: `${base}/favorites` };
const PAGE_LABELS = { gallery: 'Gallery', stock: 'Stock', favorites: 'Favorites' };

let qrInstance = null;

function openQR(page, system) {
    const url = window.location.origin + PAGE_PATHS[page] + '?tab=' + system;
    const displayName = SYSTEM_DISPLAY[system] || system;
    const label = PAGE_LABELS[page] + ' · ' + displayName;

    document.getElementById('qrTitle').textContent = label;
    document.getElementById('qrUrl').textContent   = url;

    const qrBox = document.getElementById('qrCode');
    qrBox.innerHTML = '';
    qrInstance = new QRCode(qrBox, {
        text:          url,
        width:         200,
        height:        200,
        colorDark:     '#111111',
        colorLight:    '#ffffff',
        correctLevel:  QRCode.CorrectLevel.H
    });

    document.getElementById('qrDownload').dataset.url   = url;
    document.getElementById('qrDownload').dataset.label = label.replace(' · ', '-').replace(/\s/g, '');

    document.getElementById('qrOverlay').style.display = 'flex';
}

function closeQR() {
    document.getElementById('qrOverlay').style.display = 'none';
}

document.getElementById('qrClose').addEventListener('click', closeQR);
document.getElementById('qrOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeQR();
});

document.getElementById('qrDownload').addEventListener('click', function () {
    const canvas = document.querySelector('#qrCode canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href     = canvas.toDataURL('image/png');
    a.download = 'QR-' + (this.dataset.label || 'tecnibo') + '.png';
    a.click();
});

// ═══════════════════════════════════════════════════════
//  ADD NEW SYSTEM (UI)
// ═══════════════════════════════════════════════════════
document.getElementById('addSystemBtn').addEventListener('click', async function() {
    const display = document.getElementById('newSystemDisplay').value.trim();
    const pattern = document.getElementById('newSystemPattern').value.trim();
    if (!display || !pattern) {
        showToast('Please fill both fields');
        return;
    }

    const key = display.toLowerCase().replace(/\s+/g, '');

    // First check if the pattern returns any data
    const btn = document.getElementById('addSystemBtn');
    btn.disabled = true;
    btn.textContent = 'Checking…';

    try {
        // Temporarily register on backend to allow the /api/images call, then check
        const response = await fetch(`${base}/api/systems`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, display, pattern })
        });

        const result = await response.json();
        if (!response.ok) {
            showToast(`⚠ ${result.error}`);
            return;
        }

        // Now fetch the actual image data to verify there are results
        const dataRes  = await fetch(`${base}/api/images/${key}`);
        const dataJson = await dataRes.json();

        if (!dataJson || dataJson.length === 0) {
            // No data found — delete it from backend and abort
            await fetch(`${base}/api/systems/${key}`, { method: 'DELETE' });
            showToast('❌ No data found for this pattern');
            return;
        }

        // Data exists — register in memory and add tab
        imagesBySystem[key] = dataJson;
        systemsData[key] = { display, pattern };
        SYSTEMS.push(key);
        SYSTEM_DISPLAY[key] = display;
        SYSTEM_PATTERN[key] = pattern;
        if (pattern.endsWith('_%')) {
            PREFIX_MAP[pattern.slice(0, -2)] = key;
        }

        addNewTabToPage('gallery', key, display);

        document.getElementById('newSystemDisplay').value = '';
        document.getElementById('newSystemPattern').value = '';

        showToast(`✓ System "${display}" added — ${dataJson.length} colours`);
        switchTab('gallery', key);

    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Add System`;
    }
});

// ═══════════════════════════════════════════════════════
//  TAB BUILDER HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Build a single tab button element.
 * fromGallery = true  → full delete (Gallery + Stock + Favorites + backend)
 * fromGallery = false → local delete (Stock & Favorites tabs only)
 */
function buildTab(page, key, display, showDelete) {
    const prefix = page === 'favorites' ? 'fav' : page;
    const fromGallery = (page === 'gallery');
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.dataset.system = key;

    const delBtn = showDelete
        ? `<button class="tab-del" title="${fromGallery ? 'Delete system everywhere' : 'Remove from Stock & Favorites'}" data-key="${key}" data-from-gallery="${fromGallery}">✕</button>`
        : '';

    tab.innerHTML = `${display}
        <span class="tab-count" id="${prefix}-count-${key}"></span>
        <span class="tab-qr" data-page="${page}" data-system="${key}" title="QR code">&#9707;</span>
        ${delBtn}`;

    tab.addEventListener('click', () => switchTab(page, key));

    tab.querySelector('.tab-qr').addEventListener('click', function(e) {
        e.stopPropagation();
        openQR(this.dataset.page, this.dataset.system);
    });

    if (showDelete) {
        tab.querySelector('.tab-del').addEventListener('click', function(e) {
            e.stopPropagation();
            openDeleteModal(this.dataset.key, this.dataset.fromGallery === 'true');
        });
    }

    return tab;
}

function addNewTabToPage(page, key, display) {
    const prefix      = page === 'favorites' ? 'fav' : page;
    const containerId = `${prefix}-tabs`;
    const container   = document.getElementById(containerId);
    if (!container) return;
    // Only gallery gets the delete button
    const showDelete = (page === 'gallery');
    const tab = buildTab(page, key, display, showDelete);
    container.appendChild(tab);
}

// ═══════════════════════════════════════════════════════
//  INITIALIZE TABS ON PAGE LOAD
// ═══════════════════════════════════════════════════════
function initializeTabs() {
    ['gallery', 'stock', 'favorites'].forEach(page => {
        const prefix    = page === 'favorites' ? 'fav' : page;
        const container = document.getElementById(`${prefix}-tabs`);
        if (!container) return;
        container.innerHTML = '';

        const savedItems = page === 'stock' ? stockStore.get()
                         : page === 'favorites' ? favStore.get()
                         : null;

        SYSTEMS.forEach(key => {
            // For stock/favorites: only show tab if user has saved items from this system
            if (savedItems !== null) {
                const pattern = SYSTEM_PATTERN[key] || '';
                const sysPrefix = pattern.endsWith('_%') ? pattern.slice(0, -2) : pattern;
                const hasItems = savedItems.some(s =>
                    s.code1.toUpperCase().startsWith(sysPrefix.toUpperCase()) ||
                    s.code2.toUpperCase().startsWith(sysPrefix.toUpperCase())
                );
                if (!hasItems) return;
            }

            const showDelete = (page === 'gallery');
            const tab = buildTab(page, key, SYSTEM_DISPLAY[key], showDelete);
            if (key === SYSTEMS[0] && page === 'gallery') tab.classList.add('active');
            container.appendChild(tab);
        });
    });

    switchTab('gallery', SYSTEMS[0]);
}

initializeTabs();

// Eagerly fetch data for any system that has saved stock/favorites items,
// so Stock and Favorites pages render correctly immediately on page load
(function preloadSavedSystems() {
    const allSaved = [...stockStore.get(), ...favStore.get()];
    if (allSaved.length === 0) return;

    SYSTEMS.forEach(key => {
        const pattern   = SYSTEM_PATTERN[key] || '';
        const sysPrefix = pattern.endsWith('_%') ? pattern.slice(0, -2).toUpperCase() : null;
        const hasSaved  = allSaved.some(s =>
            (sysPrefix && (s.code1.toUpperCase().startsWith(sysPrefix) ||
                           s.code2.toUpperCase().startsWith(sysPrefix)))
        );
        if (hasSaved && !imagesBySystem[key]) {
            fetch(`${base}/api/images/${key}`)
                .then(r => r.json())
                .then(data => {
                    imagesBySystem[key] = data;
                    // If stock or favorites page is currently active and showing this system, re-render
                    const activePage = document.querySelector('.page.active')?.id;
                    if (activePage === 'page-stock' && activeTab.stock === key) {
                        renderStock(key, data);
                    } else if (activePage === 'page-favorites' && activeTab.favorites === key) {
                        renderFavorites(key, data);
                    }
                })
                .catch(() => {});
        }
    });
})();

// Support ?tab=key in URL
(function() {
    const params   = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam && SYSTEMS.includes(tabParam)) {
        setTimeout(() => switchTab('gallery', tabParam), 50);
    }
})();