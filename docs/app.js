// ------- Thème sombre persistant -------
const toggleDark = document.getElementById('toggleDark');
if (toggleDark && localStorage.getItem('theme') === 'dark') {
  document.documentElement.classList.add('dark');
}
if (toggleDark) {
  toggleDark.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem(
      'theme',
      document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    );
  });
}
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ------- Cible du tableau -------
const elTable = document.getElementById('table');

// ------- Helpers -------
const parseKeywords = (s) => (s || '').split('|').map(x => x.trim()).filter(Boolean);
function toLink(href, text) {
  const t = text || href;
  return `<a class="text-indigo-600 dark:text-indigo-400 hover:underline" href="${href}" target="_blank" rel="noopener">${t}</a>`;
}

// Déduit user/repo si hébergé sur *.github.io/<repo>/
function guessRawUrls() {
  const urls = [];
  try {
    const { hostname, pathname } = window.location;
    if (hostname.endsWith('github.io')) {
      const user = hostname.split('.')[0];                  // mathislef34
      const parts = pathname.split('/').filter(Boolean);    // [ 'Udemy_Formation_Scanner', ... ]
      const repo = parts[0];
      if (user && repo) {
        urls.push(`https://raw.githubusercontent.com/${user}/${repo}/main/findings.csv`);
        urls.push(`https://raw.githubusercontent.com/${user}/${repo}/gh-pages/findings.csv`);
      }
    }
  } catch {}
  return urls;
}

// Ordre d'essai : même dossier -> parent -> raw GH (main / gh-pages)
const CANDIDATES = [
  'findings.csv',
  './findings.csv',
  '../findings.csv',
  ...guessRawUrls(),
];

// ------- Rendu -------
let grid = null;
function renderTable(rows) {
  if (!elTable) return;
  if (grid) { grid.updateConfig({ data: [] }).forceRender(); elTable.innerHTML = ''; }
  if (!rows.length) {
    elTable.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400 p-6 text-center">Aucune donnée à afficher.</div>`;
    return;
  }
  grid = new gridjs.Grid({
    columns: [
      { id:'date_utc', name:'date_utc' },
      { id:'message_id', name:'message_id' },
      { id:'url', name:'url', formatter:(cell)=>gridjs.html(toLink(cell,'post')) },
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

// ------- Chargement CSV -------
// Essaye plusieurs URLs jusqu'à succès
async function fetchTextWithFallbacks(urls) {
  let lastErr;
  for (const url of urls) {
    try {
      const sep = url.includes('?') ? '&' : '?';
      const resp = await fetch(url + sep + 'ts=' + Date.now(), { cache:'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      console.log('[CSV] Loaded:', url);
      return text;
    } catch (e) {
      console.warn('[CSV] Fail:', url, e.message);
      lastErr = e;
    }
  }
  throw lastErr || new Error('Impossible de charger findings.csv');
}

async function loadCsv() {
  if (!elTable) return;
  elTable.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400 p-6 text-center">Chargement…</div>`;
  try {
    const text = await fetchTextWithFallbacks(CANDIDATES);
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

    // On supporte l'ancien CSV (avec udemy_urls/coupon_codes) et le nouveau (simplifié)
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
    elTable.innerHTML = `<div class="text-sm text-rose-600 p-6">${e.message}</div>`;
  }
}

// ------- Démarrage -------
loadCsv();
