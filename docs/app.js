// ------- Thème sombre persistant -------
const toggleDark = document.getElementById('toggleDark');
if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.classList.add('dark');
}
toggleDark.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem(
    'theme',
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );
});
document.getElementById('year').textContent = new Date().getFullYear();

// ------- Cible du tableau -------
const elTable = document.getElementById('table');

// ------- Helpers -------
const parseKeywords = (s) => (s || '').split('|').map(x => x.trim()).filter(Boolean);
function toLink(href, text) {
  const t = text || href;
  return `<a class="text-indigo-600 dark:text-indigo-400 hover:underline" href="${href}" target="_blank" rel="noopener">${t}</a>`;
}

// ------- Rendu -------
let grid = null;
function renderTable(rows) {
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
    search: false,       // pas de barre de recherche
    sort: true,          // tri par clic sur les entêtes (ok de le laisser)
    pagination: { limit: 25 }
  }).render(elTable);
}

// ------- Chargement CSV -------
// NOTE: conserve le chemin relatif que tu utilisais déjà
const CSV_URL = "../findings.csv";

async function loadCsv(url) {
  try {
    const sep = url.includes('?') ? '&' : '?';
    const resp = await fetch(url + sep + 'ts=' + Date.now(), { cache:'no-store' });
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
    console.error(e);
    elTable.innerHTML = `<div class="text-sm text-rose-600 p-6">${e.message}</div>`;
  }
}

// ------- Démarrage -------
loadCsv(CSV_URL);
