// ------- Thème sombre -------
const toggleDark = document.getElementById('toggleDark');
if (toggleDark && localStorage.getItem('theme') === 'dark') {
  document.documentElement.classList.add('dark');
}
if (toggleDark) {
  toggleDark.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  });
}
const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();

// ------- Cible -------
const elTable = document.getElementById('table');

// ⚠️ Mets ton URL RAW EXACTE ici (remplace si besoin)
const CSV_URL = 'https://raw.githubusercontent.com/mathislef34/Udemy_Formation_Scanner/main/findings.csv';

// ------- Helpers -------
const parseKeywords = (s) => (s || '').split('|').map(x => x.trim()).filter(Boolean);
const toLink = (href, text) => `<a class="text-indigo-600 dark:text-indigo-400 hover:underline" href="${href}" target="_blank" rel="noopener">${text||href}</a>`;

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

// ------- Chargement -------
async function loadCsv(url) {
  if (!elTable) return;
  elTable.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400 p-6 text-center">Chargement…</div>`;
  try {
    const resp = await fetch(url + (url.includes('?') ? '&' : '?') + 'ts=' + Date.now(), { cache:'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
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
    console.error('[CSV]', e);
    elTable.innerHTML = `<div class="text-sm text-rose-600 p-6">Erreur de chargement du CSV<br><code>${url}</code><br>${e.message}</div>`;
  }
}

loadCsv(CSV_URL);
