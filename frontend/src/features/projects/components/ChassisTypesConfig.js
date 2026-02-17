/**
 * CHASSIS TYPES CONFIGURATION
 * 
 * To add a new chassis type:
 * 1. Add a new entry to CHASSIS_TYPES array below
 * 2. Add the corresponding label to CHASSIS_LABELS in ProjectDetail.js
 * 
 * Fields:
 *   value      — unique key (snake_case, no spaces)
 *   fr         — French display name
 *   it         — Italian display name
 *   en         — English display name
 *   composite  — true if has separate dormant + vantaux components
 *   vantaux    — (only for composite) number of leaf components
 */

export const CHASSIS_TYPES = [
  // ── Simple types ──────────────────────────────────────────────
  { value: 'chassis_fixe',           fr: 'Châssis fixe',           it: 'Telaio fisso',             en: 'Fixed frame',             composite: false },
  { value: 'fenetre_1_ouvrant',      fr: 'Fenêtre 1 ouvrant',      it: 'Finestra 1 anta',          en: 'Window 1 sash',           composite: false },
  { value: 'fenetre_2_ouvrants',     fr: 'Fenêtre 2 ouvrants',     it: 'Finestra 2 ante',          en: 'Window 2 sashes',         composite: false },
  { value: 'fenetre_oscillo_battant',fr: 'Fenêtre oscillo-battant', it: 'Finestra oscillo-battente',en: 'Tilt & turn window',      composite: false },
  { value: 'soufflet',               fr: 'Soufflet',                it: 'Soffietto',                en: 'Bellows',                 composite: false },
  { value: 'porte_1_ouvrant',        fr: 'Porte 1 ouvrant',        it: 'Porta 1 anta',             en: 'Door 1 leaf',             composite: false },
  { value: 'mur_rideau',             fr: 'Mur rideau',              it: 'Muro cortina',             en: 'Curtain wall',            composite: false },
  { value: 'volet_roulant',          fr: 'Volet roulant',           it: 'Tapparella',               en: 'Rolling shutter',         composite: false },
  { value: 'faux_cadre',             fr: 'Faux cadre',              it: 'Falso telaio',             en: 'Sub-frame',               composite: false },

  // ── Composite — Minimaliste ────────────────────────────────────
  { value: 'minimaliste_2_vantaux',  fr: 'Minimaliste 2 vantaux',  it: 'Minimalista 2 ante',       en: 'Minimalist 2 leaves',     composite: true, vantaux: 2 },
  { value: 'minimaliste_3_vantaux',  fr: 'Minimaliste 3 vantaux',  it: 'Minimalista 3 ante',       en: 'Minimalist 3 leaves',     composite: true, vantaux: 3 },
  { value: 'minimaliste_4_vantaux',  fr: 'Minimaliste 4 vantaux',  it: 'Minimalista 4 ante',       en: 'Minimalist 4 leaves',     composite: true, vantaux: 4 },

  // ── Composite — Coulissant ─────────────────────────────────────
  { value: 'coulisse_2_vantaux',     fr: 'Coulisse 2 vantaux',     it: 'Scorrevole 2 ante',        en: 'Sliding 2 leaves',        composite: true, vantaux: 2 },
  { value: 'coulisse_3_vantaux',     fr: 'Coulisse 3 vantaux',     it: 'Scorrevole 3 ante',        en: 'Sliding 3 leaves',        composite: true, vantaux: 3 },
  { value: 'coulisse_4_vantaux',     fr: 'Coulisse 4 vantaux',     it: 'Scorrevole 4 ante',        en: 'Sliding 4 leaves',        composite: true, vantaux: 4 },

  // ── ADD NEW TYPES BELOW THIS LINE ─────────────────────────────
  // Example:
  // { value: 'porte_2_vantaux', fr: 'Porte 2 vantaux', it: 'Porta 2 ante', en: 'Door 2 leaves', composite: false },
];

/**
 * Build a CHASSIS_LABELS lookup object from CHASSIS_TYPES.
 * Used by ProjectDetail, pdfExport, LabelPrint.
 */
export const CHASSIS_LABELS = Object.fromEntries(
  CHASSIS_TYPES.map(ct => [ct.value, { fr: ct.fr, it: ct.it || ct.fr, en: ct.en || ct.fr }])
);

export const ETAT_OPTIONS = ['non_entame', 'en_cours', 'fabrique', 'livre'];
