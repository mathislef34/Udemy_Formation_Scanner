// ================== Thème sombre ==================
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
const y = document.getElementById('year');
if (y) y.textContent = new Date().getFullYear();

// ================== Cibles DOM ==================
const elTable = document.getElementById('table');

// Petit bandeau de statut injecté au-dessus du tableau
const statusBar = document.createElement('div');
statusBar.className = 'text-xs text-slate-500 dark:text-slate-400 mb-2';
statusBar.textContent = 'Préparation du chargement…';
if (elTable && elTable.parentNode) {
  elTable.parentNode.insertBefore(statusBar, elTable);
}

// ================== Helpers ==================
const parseKeywords = (s) => (s || '').split('|').map(x => x.trim()).filter(Boolean);
const toLink = (href, text) =>
  `<a class="text-indigo-600 dark:text-indigo-400 hover:underline" href="${href}" target="_blank" rel="noopener">${text || href}</a>`;

// Déduit {user, repo} si la page est servie sur *.github.io/<repo>/
function guessRepoInfo() {
  try {
    const { hostname, pathname } = window.location;
    if (!hostname.endsWith('github.io')) return null;
    const user = hostname.split('.')[0]; // ex: mathislef34
    const parts = pathname.split('/').filter(Boolean); // ['Udemy_Formation_Scanner', ...]
    const repo = parts[0] || null;
    return (user && repo) ? { user, repo } : null;
  } catch {
    return null;
  }
}

// Liste d'URLs candidates à tester dans l'ordre
function candidateUrls() {
  const urls = [
    // 1) même dossier que la page (docs/)
    'findings.csv',
    './findings.csv',
    // 2) parent (au cas où, même si souvent non servi par Pages)
    '../findings.csv',
  ];
  const info = guessRepoInfo();
  if (info) {
    const { user, repo } = info;
    // 3) RAW GitHub (accessible même si le CSV n'est pas dans /docs)
    urls.push(`https://raw.githubusercontent.com/${user}/${repo}/main/findings.csv`);
    urls.push(`https://raw.githubusercontent.com/${user}/${repo}/gh-pages/findings.csv`);
    // 4) jsDelivr (autre CDN fallback)
    urls.push(`https://cdn.jsdelivr.net/gh/${user}/${repo}@main/findings.csv`);
    urls.push(`https://cdn.jsdelivr.net/gh/${user}/${repo}@gh-pages/findings.csv`);
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
    search: false,      // pas de barre de recherche
    sort: true,         // tri au clic sur l'en-tête
    pagination: { limit: 25 }
  }).render(elTable);
}

// ================== Chargement CSV (multi-fallback) ==================
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
    } catch (e)
