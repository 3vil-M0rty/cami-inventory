// Units of the inventory articles. An article stores a unit as its code ('piece', 'carton'…) or, for a unit
// that is not in this list, as the text typed. Shared by the article form, the cards, the purchase orders
// and the receptions.

// Families of units, for the picker: [key, fr, it, en]
export const UNIT_GROUPS = [
  ['count', 'Comptage', 'Conteggio', 'Count'],
  ['joinery', 'Menuiserie / profilés', 'Serramenti / profili', 'Joinery / profiles'],
  ['length', 'Longueurs', 'Lunghezze', 'Lengths'],
  ['surface', 'Surfaces / plaques', 'Superfici / lastre', 'Surfaces / sheets'],
  ['volume', 'Volumes / liquides', 'Volumi / liquidi', 'Volumes / liquids'],
  ['weight', 'Poids', 'Pesi', 'Weights'],
  ['pack', 'Emballages / conditionnements', 'Imballaggi / confezioni', 'Packaging'],
  ['service', 'Temps / prestations', 'Tempo / servizi', 'Time / services'],
];

// code, group, [fr singular, fr plural, it singular, it plural, en singular, en plural]
const LIST = [
  ['piece', 'count', 'pièce', 'pièces', 'pezzo', 'pezzi', 'piece', 'pieces'],
  ['unite', 'count', 'unité', 'unités', 'unità', 'unità', 'unit', 'units'],
  ['paire', 'count', 'paire', 'paires', 'paio', 'paia', 'pair', 'pairs'],
  ['jeu', 'count', 'jeu', 'jeux', 'set', 'set', 'set', 'sets'],
  ['kit', 'count', 'kit', 'kits', 'kit', 'kit', 'kit', 'kits'],
  ['ensemble', 'count', 'ensemble', 'ensembles', 'insieme', 'insiemi', 'assembly', 'assemblies'],
  ['lot', 'count', 'lot', 'lots', 'lotto', 'lotti', 'lot', 'lots'],
  ['assortiment', 'count', 'assortiment', 'assortiments', 'assortimento', 'assortimenti', 'assortment', 'assortments'],
  ['douzaine', 'count', 'douzaine', 'douzaines', 'dozzina', 'dozzine', 'dozen', 'dozens'],
  ['centaine', 'count', 'centaine', 'centaines', 'centinaio', 'centinaia', 'hundred', 'hundreds'],
  ['millier', 'count', 'millier', 'milliers', 'migliaio', 'migliaia', 'thousand', 'thousands'],

  ['barre', 'joinery', 'barre', 'barres', 'barra', 'barre', 'bar', 'bars'],
  ['longueur', 'joinery', 'longueur', 'longueurs', 'lunghezza', 'lunghezze', 'length', 'lengths'],
  ['profile', 'joinery', 'profilé', 'profilés', 'profilo', 'profili', 'profile', 'profiles'],
  ['chassis', 'joinery', 'châssis', 'châssis', 'telaio', 'telai', 'frame', 'frames'],
  ['vantail', 'joinery', 'vantail', 'vantaux', 'anta', 'ante', 'sash', 'sashes'],
  ['porte', 'joinery', 'porte', 'portes', 'porta', 'porte', 'door', 'doors'],
  ['fenetre', 'joinery', 'fenêtre', 'fenêtres', 'finestra', 'finestre', 'window', 'windows'],
  ['volume', 'joinery', 'volume (vitrage)', 'volumes (vitrage)', 'vetro', 'vetri', 'glass pane', 'glass panes'],
  ['joint', 'joinery', 'joint (rouleau)', 'joints (rouleaux)', 'guarnizione', 'guarnizioni', 'gasket', 'gaskets'],
  ['lame', 'joinery', 'lame', 'lames', 'lamella', 'lamelle', 'slat', 'slats'],

  ['m', 'length', 'mètre', 'mètres', 'metro', 'metri', 'metre', 'metres'],
  ['ml', 'length', 'mètre linéaire', 'mètres linéaires', 'metro lineare', 'metri lineari', 'linear metre', 'linear metres'],
  ['cm', 'length', 'centimètre', 'centimètres', 'centimetro', 'centimetri', 'centimetre', 'centimetres'],
  ['mm', 'length', 'millimètre', 'millimètres', 'millimetro', 'millimetri', 'millimetre', 'millimetres'],
  ['km', 'length', 'kilomètre', 'kilomètres', 'chilometro', 'chilometri', 'kilometre', 'kilometres'],
  ['pouce', 'length', 'pouce', 'pouces', 'pollice', 'pollici', 'inch', 'inches'],
  ['pied', 'length', 'pied', 'pieds', 'piede', 'piedi', 'foot', 'feet'],

  ['m2', 'surface', 'm²', 'm²', 'm²', 'm²', 'm²', 'm²'],
  ['dm2', 'surface', 'dm²', 'dm²', 'dm²', 'dm²', 'dm²', 'dm²'],
  ['cm2', 'surface', 'cm²', 'cm²', 'cm²', 'cm²', 'cm²', 'cm²'],
  ['plaque', 'surface', 'plaque', 'plaques', 'lastra', 'lastre', 'sheet', 'sheets'],
  ['feuille', 'surface', 'feuille', 'feuilles', 'foglio', 'fogli', 'leaf', 'leaves'],
  ['panneau', 'surface', 'panneau', 'panneaux', 'pannello', 'pannelli', 'panel', 'panels'],
  ['tole', 'surface', 'tôle', 'tôles', 'lamiera', 'lamiere', 'metal sheet', 'metal sheets'],

  ['m3', 'volume', 'm³', 'm³', 'm³', 'm³', 'm³', 'm³'],
  ['dm3', 'volume', 'dm³', 'dm³', 'dm³', 'dm³', 'dm³', 'dm³'],
  ['l', 'volume', 'litre', 'litres', 'litro', 'litri', 'litre', 'litres'],
  ['dl', 'volume', 'décilitre', 'décilitres', 'decilitro', 'decilitri', 'decilitre', 'decilitres'],
  ['cl', 'volume', 'centilitre', 'centilitres', 'centilitro', 'centilitri', 'centilitre', 'centilitres'],
  ['mlit', 'volume', 'millilitre', 'millilitres', 'millilitro', 'millilitri', 'millilitre', 'millilitres'],
  ['gallon', 'volume', 'gallon', 'gallons', 'gallone', 'galloni', 'gallon', 'gallons'],

  ['kg', 'weight', 'kg', 'kg', 'kg', 'kg', 'kg', 'kg'],
  ['g', 'weight', 'gramme', 'grammes', 'grammo', 'grammi', 'gram', 'grams'],
  ['mg', 'weight', 'milligramme', 'milligrammes', 'milligrammo', 'milligrammi', 'milligram', 'milligrams'],
  ['quintal', 'weight', 'quintal', 'quintaux', 'quintale', 'quintali', 'quintal', 'quintals'],
  ['t', 'weight', 'tonne', 'tonnes', 'tonnellata', 'tonnellate', 'tonne', 'tonnes'],
  ['lb', 'weight', 'livre (lb)', 'livres (lb)', 'libbra', 'libbre', 'pound', 'pounds'],

  ['carton', 'pack', 'carton', 'cartons', 'cartone', 'cartoni', 'carton', 'cartons'],
  ['boite', 'pack', 'boîte', 'boîtes', 'scatola', 'scatole', 'box', 'boxes'],
  ['coffret', 'pack', 'coffret', 'coffrets', 'cofanetto', 'cofanetti', 'case', 'cases'],
  ['etui', 'pack', 'étui', 'étuis', 'astuccio', 'astucci', 'sleeve', 'sleeves'],
  ['sachet', 'pack', 'sachet', 'sachets', 'bustina', 'bustine', 'bag', 'bags'],
  ['sac', 'pack', 'sac', 'sacs', 'sacco', 'sacchi', 'sack', 'sacks'],
  ['big_bag', 'pack', 'big bag', 'big bags', 'big bag', 'big bag', 'big bag', 'big bags'],
  ['paquet', 'pack', 'paquet', 'paquets', 'pacco', 'pacchi', 'pack', 'packs'],
  ['colis', 'pack', 'colis', 'colis', 'collo', 'colli', 'parcel', 'parcels'],
  ['palette', 'pack', 'palette', 'palettes', 'pallet', 'pallet', 'pallet', 'pallets'],
  ['caisse', 'pack', 'caisse', 'caisses', 'cassa', 'casse', 'crate', 'crates'],
  ['bac', 'pack', 'bac', 'bacs', 'vaschetta', 'vaschette', 'tray', 'trays'],
  ['plateau', 'pack', 'plateau', 'plateaux', 'vassoio', 'vassoi', 'platter', 'platters'],
  ['conteneur', 'pack', 'conteneur', 'conteneurs', 'container', 'container', 'container', 'containers'],
  ['rouleau', 'pack', 'rouleau', 'rouleaux', 'rotolo', 'rotoli', 'roll', 'rolls'],
  ['bobine', 'pack', 'bobine', 'bobines', 'bobina', 'bobine', 'reel', 'reels'],
  ['botte', 'pack', 'botte / fagot', 'bottes / fagots', 'fascio', 'fasci', 'bundle', 'bundles'],
  ['tube', 'pack', 'tube', 'tubes', 'tubo', 'tubi', 'tube', 'tubes'],
  ['cartouche', 'pack', 'cartouche', 'cartouches', 'cartuccia', 'cartucce', 'cartridge', 'cartridges'],
  ['poche', 'pack', 'poche (saucisse)', 'poches (saucisses)', 'sacchetto', 'sacchetti', 'foil pack', 'foil packs'],
  ['bombe', 'pack', 'bombe aérosol', 'bombes aérosol', 'bomboletta', 'bombolette', 'spray can', 'spray cans'],
  ['flacon', 'pack', 'flacon', 'flacons', 'flacone', 'flaconi', 'bottle', 'bottles'],
  ['pot', 'pack', 'pot', 'pots', 'barattolo', 'barattoli', 'pot', 'pots'],
  ['bidon', 'pack', 'bidon', 'bidons', 'tanica', 'taniche', 'can', 'cans'],
  ['seau', 'pack', 'seau', 'seaux', 'secchio', 'secchi', 'bucket', 'buckets'],
  ['fut', 'pack', 'fût', 'fûts', 'fusto', 'fusti', 'drum', 'drums'],
  ['blister', 'pack', 'blister', 'blisters', 'blister', 'blister', 'blister', 'blisters'],

  ['heure', 'service', 'heure', 'heures', 'ora', 'ore', 'hour', 'hours'],
  ['jour', 'service', 'jour', 'jours', 'giorno', 'giorni', 'day', 'days'],
  ['forfait', 'service', 'forfait', 'forfaits', 'forfait', 'forfait', 'flat rate', 'flat rates'],
  ['prestation', 'service', 'prestation', 'prestations', 'prestazione', 'prestazioni', 'service', 'services'],
  ['voyage', 'service', 'voyage (transport)', 'voyages (transport)', 'viaggio', 'viaggi', 'trip', 'trips'],
].map(([code, group, ...names]) => [code, ...names, group]);
const COL = { fr: 1, it: 3, en: 5 };
const byCode = new Map(LIST.map(r => [r[0], r]));
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Every known unit, for the pickers: [{ code, label, group, search }]
export const unitOptions = (lang = 'fr') => LIST.map(r => ({
  code: r[0], label: r[COL[lang] || 1], group: r[7],
  search: norm(r.slice(0, 7).join(' ')), // found by its name in any language, singular or plural, or its code
}));
export const unitGroupLabel = (key, lang = 'fr') => {
  const g = UNIT_GROUPS.find(x => x[0] === key);
  return g ? g[{ fr: 1, it: 2, en: 3 }[lang] || 1] : key;
};

// « pièce » / « pièces » for `qty` (a unit typed by hand is shown as typed)
export function unitLabel(unit, lang = 'fr', qty = 1) {
  if (!unit) return '';
  const r = byCode.get(unit);
  if (!r) return unit;
  const c = COL[lang] || 1;
  return Math.abs(Number(qty)) > 1 ? r[c + 1] : r[c];
}

// Text typed in a picker → the code of a known unit (any language, singular or plural), else the text itself
export function unitFromText(text) {
  const n = norm(text);
  if (!n) return '';
  const hit = LIST.find(r => r.slice(0, 7).some(v => norm(v) === n));
  return hit ? hit[0] : String(text).trim().slice(0, 40);
}

// Up to 3 decimals, no trailing zeros: 1000, 12.5, 0.333
export const fmtUnitQty = (v) => {
  const n = Math.round((Number(v) || 0) * 1000) / 1000;
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
};

// « 1000 pièces », « 12,5 kg », or just the number when the article has no unit
export const qtyWithUnit = (qty, unit, lang = 'fr') => {
  const label = unitLabel(unit, lang, qty);
  return label ? `${fmtUnitQty(qty)} ${label}` : fmtUnitQty(qty);
};

// The conversion as people read it, in the direction chosen on the article (« Affichage » in its form):
// inverse false → « 1 kg = 0.02 rouleau » (1 purchase unit = N stock units), true → « 1 rouleau = 50 kg ».
// Returns { one: '1 kg', content: '0.02 rouleau' } (so « {one} = {content} » texts keep working).
export function conversionParts(purchaseUnit, factor, stockUnit, inverse, lang = 'fr') {
  const f = Number(factor) || 0;
  if (inverse && f > 0) {
    return { one: `1 ${unitLabel(stockUnit, lang)}`, content: qtyWithUnit(Math.round((1 / f) * 1e6) / 1e6, purchaseUnit, lang) };
  }
  return { one: `1 ${unitLabel(purchaseUnit, lang)}`, content: qtyWithUnit(f, stockUnit, lang) };
}
export const conversionText = (...a) => { const c = conversionParts(...a); return `${c.one} = ${c.content}`; };
// same, for an article
export const itemConversion = (it, lang = 'fr') =>
  conversionText(it?.purchaseUnit, it?.purchaseFactor, it?.unit, !!it?.conversionInverse, lang);

// Stock quantity of `q` units of an order line (10 cartons × 100 → 1000)
export const lineFactor = (line) => (line && line.factor > 0 ? line.factor : 1);
export const lineToStock = (line, q) => Math.round((Number(q) || 0) * lineFactor(line) * 1000) / 1000;
// Line ordered in another unit than the stock one (carton → pièces)?
export const isConverted = (line) => lineFactor(line) !== 1;

// Units counted in fractions (12.5 kg, 3.2 m…): their quantities accept decimals like the powder ones
const DECIMAL_UNITS = new Set(['kg', 'g', 'mg', 't', 'quintal', 'lb', 'l', 'dl', 'cl', 'mlit', 'gallon', 'm', 'ml', 'cm', 'mm', 'km', 'pouce', 'pied', 'm2', 'dm2', 'cm2', 'm3', 'dm3', 'heure', 'jour']);
export const allowsDecimals = (unit) => DECIMAL_UNITS.has(unit);
