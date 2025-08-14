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

// Bandeau de statut visible (URL testée/réussie)
const statusBar = document.createElement('div');
statusBar.className = 'text-xs text-slate-500 dark:text-slate-400 mb-2';
statusBar.textContent = 'Préparation du chargement…';
if (elTable && elTable.parentNode) elTable.parentNode.insertBefore(statusBar, elTable);

// ================== Helpers ==================
const parseKeywords = (s) => (s || '').split('|').map(x => x.trim()).filter(Boolean);
const toLink = (href, text) =>
  `<a class="text-indigo-600 dark:text-indigo-400 hover:underline" href="${href}" target="_blank" rel="noopener">${text || href}</a>`;

// Déduis {user, repo} pour Pages de type https://USER.github.io/REPO/
function guessRepoInfo() {
  try {
    const { hostname, pathname } = window.location;
    if (!hostname.endsWith('github.io')) return null;
    const user = hostname.split('.')[0];           // ex: mathislef34
    const parts = pathname.split('/').filter(Boolean);
    const repo = parts[0] || null;                 // ex: Udemy_Formation_Scanner
    return (user && repo) ? { user, repo } : null;
  } catch { return null; }
}

// URLs candidates à tester (docs -> parent -> RAW -> CDN)
function candidateUrls() {
  const urls = [
    'findings.csv',
    './findings.csv',
    '../findings.csv',
  ];
  // hardcode sûr pour ton repo + autoscan (utile si tu renommes plus tard)
  const hardUser = 'mathislef34';
  const hardRepo = 'Udemy_Formation_Scanner';
  urls.push(`https://raw.githubusercontent.com/${hardUser}/${hardRepo}/main/findings.csv`);
  urls.push(`https://raw.githubusercontent.com/${hardUser}/${hardRepo}/gh-pages/findings.csv`);
  urls.push(`https://cdn.jsdelivr.net/gh/${hardUser}/${hardRepo}@main/findings.csv`);
  urls.push(`https://cdn.jsdelivr.net/gh/${hardUser}/${hardRepo}@gh-pages/findings.csv`);

  const info = guessRepoInfo();
  if (info) {
    const { user, repo } = info;
    if (user !== hardUser || repo !== hardRepo) {
      urls.push(`https://raw.githubusercontent.com/${user}/${repo}/main/findings.csv`);
      urls.push(`https://raw.githubusercontent.com/${user}/${repo}/gh-pages/findings.csv`);
      urls.push(`https://cdn.jsdelivr.net/gh/${user}/${repo}@main/findings.csv`);
      urls.push(`https://cdn.jsdelivr.net/gh/${user}/${repo}@gh-pages/findings.csv`);
    }
  }
  return urls;
}

// ================== Rendu ==================
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

// ================== Chargement CSV avec fallbacks ==================
async function fetchText(url) {
  const sep = url.includes('?') ? '&' : '?';
  const resp = await fetch(url + sep + 'ts=' + Date.now(), { cache:'no-store' });
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
      return { text, url };
    } catch (e) {
      console.warn('[CSV] Échec:', url, e.message);
      lastErr = e;
    }
  }
  throw lastErr || new Error('Aucune URL n’a fonctionné');
}

async function loadCsv() {
  if (!elTable) {
    // au cas où #table manquerait dans le HTML
    const msg = document.createElement('div');
    msg.textContent = 'Erreur: élément #table introuvable dans la page.';
    msg.className = 'text-sm text-rose-600 p-6';
    document.body.appendChild(msg);
    return;
  }
  elTable.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400 p-6 text-center">Chargement…</div>`;
  try {
    if (!window.Papa) throw new Error('Papa Parse non chargé');
    if (!window.gridjs) throw new Error('Grid.js non chargé');

    const { text } = await fetchWithFallbacks(candidateUrls());

    // Supporte ancien ET nouveau schéma (on ne lit que les colonnes utiles)
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
