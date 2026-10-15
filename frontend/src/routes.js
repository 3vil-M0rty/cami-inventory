// URL of each page: refresh (F5), back/forward buttons and shared links keep you where you were.
// e.g. /commandes, /commandes/6712ab…, /commandes?onglet=suivi, /projets

export const PAGE_PATHS = {
  inventory: '/inventaire',
  orders: '/commandes',
  projects: '/projets',
  clients: '/clients',
  devis: '/devis',
  analytics: '/statistiques',
  movements: '/mouvements',
  admin: '/admin',
  ateliertables: '/ateliers',
  chantiers: '/chantiers',
};

const PATH_TO_PAGE = Object.fromEntries(Object.entries(PAGE_PATHS).map(([page, path]) => [path, page]));

/** Page key for the current URL ("/commandes/123" → "orders"), or null for "/" / unknown paths */
export function pageFromLocation(pathname = window.location.pathname) {
  const first = '/' + (pathname.split('/')[1] || '');
  return PATH_TO_PAGE[first] || null;
}

/** Path segments after the page: "/commandes/123" → ["123"] */
export function subPathFromLocation(pathname = window.location.pathname) {
  return pathname.split('/').slice(2).filter(Boolean).map(decodeURIComponent);
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/** Change the URL without reloading. replace=true → no new entry in the back history */
export function setUrl(path, { replace = false, query } = {}) {
  let url = path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString();
    if (qs) url += `?${qs}`;
  }
  if (url === window.location.pathname + window.location.search) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

/** Merge params into the current query string (null / '' removes a param). path defaults to the current one. */
export function updateQuery(patch, { replace = true, path = window.location.pathname } = {}) {
  const query = Object.fromEntries(new URLSearchParams(window.location.search));
  Object.entries(patch).forEach(([k, v]) => { if (v == null || v === '') delete query[k]; else query[k] = v; });
  setUrl(path, { replace, query });
}
