// ================== Thème sombre ==================
const toggleDark = document.getElementById('toggleDark');
if (toggleDark && localStorage.getItem('theme') === 'dark') {
  document.documentElement.classList.add('dark');
}
if (toggleDark) {
  toggleDark.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme',
      document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  });
}
const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();

// ================== Cibles DOM ==================
const elTable = document.getElementById('table');

// Bandeau de statut (URL testée/réussie)
const statusBar = document.createElement('div');
statusBar.className = 'text-xs text-slate-500 dark:text-slate-400 mb-2';
statusBar.textContent = 'Préparation du chargement…';
if (elTable && elTable.parentNode) elTable.parentNode.insertBefore(statusBar, elTable);

// Panneau d’actions
const controls = document.createElement('div');
controls.className = 'mb-3 flex flex-wrap items-center gap-2';
controls.innerHTML = `
  <label class="inline-flex items-center gap-2 text-sm">
    <input id="hideSeen" type="checkbox" class="checkbox">
    <span>Masquer les lignes vues</span>
  </label>
  <button id="markPageSeen" class="btn text-sm">Tout marquer (page)</button>
  <button id="resetSeen" class="btn text-sm">Réinitialiser “vus”</button>
`;
statusBar.after(controls);

// ================== Persistance “vus” ==================
const SEEN_KEY = 'udemy_scanner_seen_v1';
let seenIds = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
function isSeen(id) { return seenIds.has(String(id)); }
function saveSeen() { localStorage.setItem(SEEN_KEY, JSON.stringify([...seenIds])); }

// ================== Helpers ==================
const parseKeywords = (s) => (s || '').split('|').map(x => x.trim()).filter(Boolean);
const toLink = (href, text) =>
  `<a class="text-indigo-600 dark:text-indigo-400 hover:underline" href="${href}" target="_blank" rel="noopener">${text || href}</a>`;

// URLs candidates (docs puis RAW/CDN)
const USER = 'mathislef34';
const REPO = 'Udemy_Formation_Scanner';
const CANDIDATES = [
  'findings.csv',
  './findings.csv',
  '../findings.csv',
  `https://raw.githubusercontent.com/${USER}/${REPO}/main/findings.csv`,
  `https://raw.githubusercontent.com/${USER}/${REPO}/gh-pages/findings.csv`,
  `https://cdn.jsdelivr.net/gh/${USER}/${REPO}@main/findings.csv`,
  `https://cdn.jsdelivr.net/gh/${USER}/${REPO}@gh-pages/findings.csv`,
];

// ================== Données courantes ==================
let rawRows = [];       // toutes les lignes du CSV
let currentRows = [];   // lignes affichées selon le filtre “masquer vus”
let hideSeen = false;

// ================== Rendu ==================
let grid = null;

function renderTable(rows) {
  if (!elTable) return;

  // Toujours vider le conteneur avant Grid.js
  elTable.innerHTML = '';

  if (!rows.length) {
    elTable.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400 p-6 text-center">Aucune donnée à afficher.</div>`;
    return;
  }

  grid = new gridjs.Grid({
    columns: [
      {
        id: 'seen',
        name: 'Vu ?',
        width: '80px',
        formatter: (_, row) => {
          const id = row.cells.find(c => c.column.id === 'message_id').data;
          const checked = isSeen(id) ? 'checked' : '';
          return gridjs.html(`<input type="checkbox" data-toggle-seen data-id="${id}" ${checked} />`);
        }
      },
      {
        id: 'date_utc',
        name: 'date_utc',
        formatter: (cell, row) => {
          const id = row.cells.find(c => c.column.id === 'message_id').data;
          const cls = isSeen(id) ? 'opacity-60' : '';
          return gridjs.html(`<span class="${cls}">${cell || ''}</span>`);
        }
      },
      {
        id: 'message_id',
        name: 'message_id',
        formatter: (cell, row) => {
          const id = row.cells.find(c => c.column.id === 'message_id').data;
          const cls = isSeen(id) ? 'opacity-60' : '';
          return gridjs.html(`<span class="${cls}">${cell || ''}</span>`);
        }
      },
      {
        id: 'url',
        name: 'url',
        formatter: (cell, row) => {
          const id = row.cells.find(c => c.column.id === 'message_id').data;
          const cls = isSeen(id) ? 'opacity-60' : '';
          return gridjs.html(`<span class="${cls}">${toLink(cell,'post')}</span>`);
        }
      },
      {
        id: 'keywords',
        name: 'keywords',
        formatter: (cell, row) => {
          const id = row.cells.find(c => c.column.id === 'message_id').data;
          const cls = isSeen(id) ? 'opacity-60' : '';
          const chips = parseKeywords(cell).map(k=>`<span class="chip">${k}</span>`).join(' ');
          return gridjs.html(`<div class="flex flex-wrap items-center gap-1 ${cls}">${chips||''}</div>`);
        }
      },
      {
        id: 'snippet',
        name: 'snippet',
        formatter: (cell, row) => {
          const id = row.cells.find(c => c.column.id === 'message_id').data;
          const cls = isSeen(id) ? 'opacity-60' : '';
          return gridjs.html(`<span class="${cls}">${cell || ''}</span>`);
        }
      }
    ],
    data: rows,
    search: false,
    sort: true,
    pagination: { limit: 25 }
  }).render(elTable);
}

function applySeenFilter() {
  currentRows = hideSeen ? rawRows.filter(r => !isSeen(r.message_id)) : rawRows.slice();
  renderTable(currentRows);
}

// ================== Chargement CSV (multi-fallback) ==================
async function fetchText(url) {
  const resp = await fetch(url + (url.includes('?') ? '&' : '?') + 'ts=' + Date.now(), { cache:'no-store' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.text();
}

async function fetchWithFallbacks(urls) {
  let lastErr = null;
  for (const url of urls) {
    try {
      statusBar.textContent = `Essai : ${url}`;
      const text = await fetchText(url);
      statusBar.textContent = `Chargé depuis : ${url}`;
      return text;
    } catch (e) {
      console.warn('[CSV] Échec:', url, e.message);
      lastErr = e;
    }
  }
  throw lastErr || new Error('Aucune URL n’a fonctionné');
}

async function loadCsv() {
  if (!elTable) return;
  elTable.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400 p-6 text-center">Chargement…</div>`;
  try {
    if (!window.Papa) throw new Error('Papa Parse non chargé');
    if (!window.gridjs) throw new Error('Grid.js non chargé');

    const text = await fetchWithFallbacks(CANDIDATES);
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

    rawRows = (parsed.data || []).map(row => ({
      date_utc: row.date_utc || '',
      message_id: String(row.message_id || ''),
      url: row.url || '',
      keywords: row.keywords || '',
      snippet: row.snippet || ''
    }));

    applySeenFilter();
  } catch (e) {
    console.error(e);
    statusBar.textContent = 'Erreur lors du chargement.';
    elTable.innerHTML = `<div class="text-sm text-rose-600 p-6">${e.message}</div>`;
  }
}

// ================== Events ==================
// Toggle “vu” pour une ligne (delegation)
elTable.addEventListener('change', (e) => {
  const t = e.target;
  if (t && t.matches('input[data-toggle-seen]')) {
    const id = String(t.getAttribute('data-id'));
    if (t.checked) seenIds.add(id); else seenIds.delete(id);
    saveSeen();
    applySeenFilter(); // met à jour l’affichage immédiatemment
  }
});

// Masquer/afficher lignes vues
document.getElementById('hideSeen').addEventListener('change', (e) => {
  hideSeen = !!e.target.checked;
  applySeenFilter();
});

// Tout marquer (les lignes actuellement affichées)
document.getElementById('markPageSeen').addEventListener('click', () => {
  currentRows.forEach(r => seenIds.add(String(r.message_id)));
  saveSeen();
  applySeenFilter();
});

// Réinitialiser les “vus”
document.getElementById('resetSeen').addEventListener('click', () => {
  if (!confirm('Réinitialiser toutes les lignes marquées comme vues ?')) return;
  seenIds.clear();
  saveSeen();
  applySeenFilter();
});

// ================== Démarrage ==================
loadCsv();
// (optionnel) rafraîchit toutes les 30 min
setInterval(loadCsv, 30 * 60 * 1000);
