// Open project in the URL: /projets/<id>?client=…&onglet=…&vue=… — refresh, back button and shared links
// reopen the same project. Used by the Aluminium / Laquage / Vitrage tabs.
import { useEffect, useRef } from 'react';
import { PAGE_PATHS, subPathFromLocation, updateQuery } from '../../routes';

/** Put the open project (or none) in the URL; the list filters (client, onglet, etat) are kept */
export function setProjectUrl(projectId, { replace = false } = {}) {
  updateQuery({ vue: null }, { replace, path: projectId ? `${PAGE_PATHS.projects}/${projectId}` : PAGE_PATHS.projects });
}

/**
 * open(id, { fromUrl: true }) is called for /projets/<id> on load and on back / forward;
 * close() when the URL no longer names a project (back button, "Projets" in the menu).
 */
export function useProjectUrl({ openId, open, close }) {
  const latest = useRef();
  latest.current = { openId, open, close };
  useEffect(() => {
    const [id] = subPathFromLocation();
    if (id) open(id, { fromUrl: true });
    const onPop = () => {
      const [pid] = subPathFromLocation();
      const cur = latest.current;
      if (!pid) { if (cur.openId) cur.close(); }
      else if (pid !== cur.openId) cur.open(pid, { fromUrl: true });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
