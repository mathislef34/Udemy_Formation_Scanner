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

// ------- Éléments du DOM -------
const elTable    = document.getElementById('table');
const elStatus   = document.getElementById('status');
const elStats    = document.getElementById('stats');
const elInfo     = document.getElementById('info');
const elCsvUrl   = document.getElementById('csvUrl');
const elKeyword  = document.getElementById('keywordFilter');
const elDateFrom = document.getElementById('dateFrom');
const elDateTo   = document.getElementById('dateTo');
const elBtnLoad  = document.getElementById('btnLoad');
const elBtnApply = document.getElementById('btnApply');
const elBtnReset = document.getElementById('btnReset');
const elBtnRefresh = document.getElementById('btnRefresh');
const elAuto     = document.getElementById('autoRefresh');

let rawRows = [];
let grid = null;
let autoTimer = null;

// ------- Helpers -------
const uniq = (arr) => Array.from(new Set(arr));
const parseKeywords = (s) => (s || '').split('|').map(x => x.trim()).filter(Boolean);
const parseList = (s) => (s || '').split(';').map(x => x.trim()).filter(Boolean);
function isInDateRange(iso, from, to) {
  if (!iso) return true;
  const d = new Date(iso);
  if (from && d < new Date(from)) return false;
  if (to && d > new Date(to + 'T23:59:59')) return false;
  return true;
}
function toLink(href, text) {
  const t = text || href;
  return `<a class="text-indigo-600 dark:text-indigo-400 hover:underline" href="${href}" target="_blank" rel="noopener">${t}</a>`;
}

// ------- Rendu -------
function renderTable(rows) {
  if (grid) { grid.updateConfig({ data: [] }).forceRender(); elTable.innerHTML = ''; }
  if (!rows.length) {
    elTable.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400 p-6 text-center">Aucune donnée à afficher.</div>`;
    elStats.textContent = '0 ligne affichée.';
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
      { id:'udemy_urls', name:'udemy_urls', formatter:(cell)=>{
          const links = parseList(cell).map(u => toLink(u,'udemy')).join(' · ');
          return gridjs.html(links || '');
        }},
      { id:'coupon_codes', name:'coupon_codes', formatter:(cell)=>{
          const codes = parseList(cell).map(c=>`<code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">${c}</code>`).join(' · ');
          return gridjs.html(codes || '');
        }},
      { id:'snippet', name:'snippet' }
    ],
    data: rows,
    search: { enabled: true },
    sort: true,
    pagination: { limit: 25 }
  }).render(elTable);
  elStats.textContent = `${rows.length} ligne(s) affichée(s).`;
}

function applyFilters() {
  const kw = elKeyword.value;
  const from = elDateFrom.value;
  const to = elDateTo.value;
  const filtered = rawRows.filter(r => {
    if (!isInDateRange(r.date_utc, from, to)) return false;
    if (!kw) return true;
    return parseKeywords(r.keywords).includes(kw);
  });
  renderTable(filtered);
}

function fillKeywordsFilter(rows) {
  const all = rows.flatMap(r => parseKeywords(r.keywords));
  const values = [''].concat(uniq(all).sort());
  elKeyword.innerHTML = values.map(v => v
    ? `<option value="${v}">${v}</option>`
    : `<option value="">— Tous —</option>`).join('');
}

// ------- Chargement CSV -------
async function loadCsv(url) {
  elStatus.textContent = 'Chargement du CSV…';
  elInfo.textContent = url;
  try {
    const sep = url.includes('?') ? '&' : '?';
    const resp = await fetch(url + sep + 'ts=' + Date.now(), { cache:'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();

    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    rawRows = (parsed.data || []).map(row => ({
      date_utc: row.date_utc || '',
      message_id: row.message_id || '',
      url: row.url || '',
      keywords: row.keywords || '',
      udemy_urls: row.udemy_urls || '',
      coupon_codes: row.coupon_codes || '',
      snippet: row.snippet || ''
    }));

    fillKeywordsFilter(rawRows);
    applyFilters();
    elStatus.textContent = 'OK';
  } catch (e) {
    console.error(e);
    elStatus.textContent = 'Erreur : ' + e.message;
    elTable.innerHTML = `<div class="text-sm text-rose-600 p-6">${e.message}</div>`;
  }
}

// ------- Listeners -------
elBtnLoad.addEventListener('click', () => loadCsv(elCsvUrl.value.trim()));
elBtnRefresh.addEventListener('click', () => loadCsv(elCsvUrl.value.trim()));
elBtnApply.addEventListener('click', applyFilters);
elBtnReset.addEventListener('click', () => {
  elKeyword.value = ''; elDateFrom.value = ''; elDateTo.value = ''; renderTable(rawRows);
});
elAuto.addEventListener('change', (e) => {
  if (e.target.checked) {
    autoTimer = setInterval(() => loadCsv(elCsvUrl.value.trim()), 5 * 60 * 1000);
  } else {
    clearInterval(autoTimer); autoTimer = null;
  }
});

// ------- Démarrage -------
// Mets ton URL raw par défaut ici pour chargement auto :
elCsvUrl.value = "https://raw.githubusercontent.com/mathislef34/Udemy_Formation_Scanner/main/findings.csv";
loadCsv(elCsvUrl.value.trim());
