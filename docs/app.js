
// ================== Cibles DOM ==================
const elTable = document.getElementById('table');

// Bandeau de statut pour voir l’URL testée/réussie
const statusBar = document.createElement('div');
statusBar.className = 'text-xs text-slate-500 dark:text-slate-400 mb-2';
statusBar.textContent = 'Préparation du chargement…';
if (elTable && elTable.parentNode) elTable.parentNode.insertBefore(statusBar, elTable);

// ================== Helpers ==================
const parseKeywords = (s) => (s || '').split('|').map(x => x.trim()).filter(Boolean);
const toLink = (href, text) =>
  `<a class="text-indigo-600 dark:text-indigo-400 hover:underline" href="${href}" target="_blank" rel="noopener">${text || href}</a>`;

// URLs candidates (local /docs d’abord, puis RAW & jsDelivr)
const USER = 'mathislef34';
const REPO = 'Udemy_Formation_Scanner';
const CANDIDATES = [
  'findings.csv',                    // /docs/findings.csv (recommandé)
  './findings.csv',
  '../findings.csv',                 // parent (souvent non servi sur Pages)
  `https://raw.githubusercontent.com/${USER}/${REPO}/main/findings.csv`,
  `https://raw.githubusercontent.com/${USER}/${REPO}/gh-pages/findings.csv`,
  `https://cdn.jsdelivr.net/gh/${USER}/${REPO}@main/findings.csv`,
  `https://cdn.jsdelivr.net/gh/${USER}/${REPO}@gh-pages/findings.csv`,
];

// ================== Rendu ==================
let grid = null;
function renderTable(rows) {
  if (!elTable) return;

  // ⚠️ IMPORTANT : vide toujours le conteneur avant Grid.js
  elTable.innerHTML = '';

  if (!rows.length) {
    elTable.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400 p-6 text-center">Aucune donnée à afficher.</div>`;
    return;
  }

  grid = new gridjs.Grid({
    columns: [
      { id:'date_utc', name:'date_utc' },
      { id:'message_id', name:'message_id' },
      { id:'url', name:'url', formatter:(cell)=>gridjs.html(toLink(cell, 'post')) },
      { id:'keywords', name:'keywords', formatter:(cell)=>{
          const chips = parseKeywords(cell).map(k=>`<span class="chip">${k}</span>`).join(' ');
          return gridjs.html(`<div class="flex flex-wrap items-center gap-1">${chips||''}</div>`);
        }},
      { id:'snippet', name:'snippet' }
    ],
    data: rows,
    search: false,
    sort: true,
    pagination: { limit: 25 }
  }).render(elTable);
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
  if (!elTable) {
    console.error('Élément #table introuvable');
    return;
  }
  // On met un message de chargement provisoire…
  elTable.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400 p-6 text-center">Chargement…</div>`;

  try {
    if (!window.Papa) throw new Error('Papa Parse non chargé');
    if (!window.gridjs) throw new Error('Grid.js non chargé');

    const text = await fetchWithFallbacks(CANDIDATES);
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = (parsed.data || []).map(row => ({
      date_utc: row.date_utc || '',
      message_id: row.message_id || '',
      url: row.url || '',
      keywords: row.keywords || '',
      snippet: row.snippet || ''
    }));

    renderTable(rows);
  } catch (e) {
    console.error(e);
    statusBar.textContent = 'Erreur lors du chargement.';
    elTable.innerHTML = `<div class="text-sm text-rose-600 p-6">${e.message}</div>`;
  }
}

loadCsv();
// recharge les données toutes les 30 minutes
setInterval(loadCsv, 30 * 60 * 1000);
