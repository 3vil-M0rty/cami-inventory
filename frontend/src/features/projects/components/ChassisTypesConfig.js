/**
 * CHASSIS TYPES CONFIGURATION
 *
 * Types are now stored in the database and managed via the platform UI.
 */

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export const ETAT_OPTIONS = ['non_entame', 'en_cours', 'fabrique', 'livre'];

export async function fetchChassisTypes() {
  const res = await fetch(`${API_BASE}/chassis-types`);
  if (!res.ok) throw new Error('Failed to fetch chassis types');
  return res.json();
}

export async function createChassisType(data) {
  const res = await fetch(`${API_BASE}/chassis-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to create');
  return body;
}

export async function updateChassisType(id, data) {
  const res = await fetch(`${API_BASE}/chassis-types/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to update');
  return body;
}

export async function deleteChassisType(id) {
  const res = await fetch(`${API_BASE}/chassis-types/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete');
}

export function buildChassisLabels(types) {
  return Object.fromEntries(
    types.map(ct => [ct.value, { fr: ct.fr, it: ct.it || ct.fr, en: ct.en || ct.fr }])
  );
}

// Static fallback for first paint
export const STATIC_CHASSIS_TYPES = [
  { value: 'chassis_fixe',           fr: 'Châssis fixe',            it: 'Telaio fisso',             en: 'Fixed frame',         composite: false, vantaux: 0 },
  { value: 'fenetre_1_ouvrant',      fr: 'Fenêtre 1 ouvrant',       it: 'Finestra 1 anta',          en: 'Window 1 sash',        composite: false, vantaux: 0 },
  { value: 'fenetre_2_ouvrants',     fr: 'Fenêtre 2 ouvrants',      it: 'Finestra 2 ante',          en: 'Window 2 sashes',      composite: false, vantaux: 0 },
  { value: 'fenetre_oscillo_battant',fr: 'Fenêtre oscillo-battant', it: 'Finestra oscillo-battente',en: 'Tilt & turn window',   composite: false, vantaux: 0 },
  { value: 'soufflet',               fr: 'Soufflet',                it: 'Soffietto',                en: 'Bellows',              composite: false, vantaux: 0 },
  { value: 'porte_1_ouvrant',        fr: 'Porte 1 ouvrant',         it: 'Porta 1 anta',             en: 'Door 1 leaf',          composite: false, vantaux: 0 },
  { value: 'mur_rideau',             fr: 'Mur rideau',              it: 'Muro cortina',             en: 'Curtain wall',         composite: false, vantaux: 0 },
  { value: 'volet_roulant',          fr: 'Volet roulant',           it: 'Tapparella',               en: 'Rolling shutter',      composite: false, vantaux: 0 },
  { value: 'faux_cadre',             fr: 'Faux cadre',              it: 'Falso telaio',             en: 'Sub-frame',            composite: false, vantaux: 0 },
  { value: 'minimaliste_2_vantaux',  fr: 'Minimaliste 2 vantaux',   it: 'Minimalista 2 ante',       en: 'Minimalist 2 leaves',  composite: true,  vantaux: 2 },
  { value: 'minimaliste_3_vantaux',  fr: 'Minimaliste 3 vantaux',   it: 'Minimalista 3 ante',       en: 'Minimalist 3 leaves',  composite: true,  vantaux: 3 },
  { value: 'minimaliste_4_vantaux',  fr: 'Minimaliste 4 vantaux',   it: 'Minimalista 4 ante',       en: 'Minimalist 4 leaves',  composite: true,  vantaux: 4 },
  { value: 'coulisse_2_vantaux',     fr: 'Coulisse 2 vantaux',      it: 'Scorrevole 2 ante',        en: 'Sliding 2 leaves',     composite: true,  vantaux: 2 },
  { value: 'coulisse_3_vantaux',     fr: 'Coulisse 3 vantaux',      it: 'Scorrevole 3 ante',        en: 'Sliding 3 leaves',     composite: true,  vantaux: 3 },
  { value: 'coulisse_4_vantaux',     fr: 'Coulisse 4 vantaux',      it: 'Scorrevole 4 ante',        en: 'Sliding 4 leaves',     composite: true,  vantaux: 4 },
];

export const CHASSIS_TYPES = STATIC_CHASSIS_TYPES;
export const CHASSIS_LABELS = buildChassisLabels(STATIC_CHASSIS_TYPES);