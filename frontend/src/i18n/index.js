// Extra translation dictionaries, one file per area of the app, merged into LanguageContext.
// Each module exports { fr: {...}, it: {...}, en: {...} }.
import devis from './devis';
import admin from './admin';
import companies from './companies';
import account from './account';
import movements from './movements';
import laquageNotif from './laquageNotif';
import atelier from './atelier';
import chantiers from './chantiers';
import projects from './projects';
import chassis from './chassis';
import projectDetail from './projectDetail';
import inventory from './inventory';
import analytics from './analytics';
import laquage from './laquage';
import orders from './orders';
import common from './common';
import clients from './clients';

const modules = [common, clients, devis, admin, companies, account, movements, laquageNotif, atelier, chantiers, projects, chassis, projectDetail, inventory, analytics, laquage, orders];

export function mergeTranslations(base) {
  const out = { fr: { ...base.fr }, it: { ...base.it }, en: { ...base.en } };
  for (const m of modules) {
    for (const lang of Object.keys(out)) Object.assign(out[lang], m[lang] || {});
  }
  return out;
}
