/**
 * One-time migration: split multi-dimension chassis into separate chassis docs.
 * Usage:
 *   node migrate-split-multidim.js            → dry run (shows what would change)
 *   node migrate-split-multidim.js --apply    → actually saves the changes
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aluminum-inventory';
const APPLY = process.argv.includes('--apply');

// Minimal schema re-declaration (just enough to load/save chassis subdocs).
// Mongoose is lenient with extra/unknown fields by default only if you don't
// set strict mode off — safest is to require your real server.js models instead.
// Easiest: just require server.js's models if they're exported, OR copy the
// same schemas here. Simplest robust approach: use `strict: false`.

const chassisSchema = new mongoose.Schema({}, { strict: false, _id: true });
const projectSchema = new mongoose.Schema({ chassis: [chassisSchema] }, { strict: false });
const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`✅ Connected to ${MONGODB_URI}`);
  console.log(APPLY ? '⚠️  APPLY MODE — changes will be saved' : 'ℹ️  DRY RUN — no changes will be saved (pass --apply to save)');

  const projects = await Project.find({ 'chassis.multiDim': true });
  let projectCount = 0, splitCount = 0;

  for (const project of projects) {
    const toSplit = project.chassis.filter(ch => ch.multiDim && Array.isArray(ch.variants) && ch.variants.length > 1);
    if (toSplit.length === 0) continue;

    console.log(`\n📁 Project: ${project.name} (${project._id})`);

    for (const ch of toSplit) {
      const oldId = ch._id;
      const variants = ch.variants;
      const isComposite = (ch.components || []).length > 0;

      let cursor = 0;
      const ranges = variants.map(v => {
        const qty = Number(v.quantity) || 1;
        const range = { start: cursor, end: cursor + qty, qty };
        cursor += qty;
        return range;
      });

      console.log(`  🔧 Chassis "${ch.repere}" (${oldId}) → splitting into ${variants.length} variants:`);

      variants.forEach((v, vi) => {
        const { start, end, qty } = ranges[vi];
        const oldUnitsInRange = (ch.units || []).filter(u => u.unitIndex >= start && u.unitIndex < end);

        const newUnits = Array.from({ length: qty }, (_, i) => {
          const orig = oldUnitsInRange.find(u => u.unitIndex === start + i);
          return orig ? {
            unitIndex: i,
            etat: orig.etat || 'non_entame',
            deliveryDate: orig.deliveryDate || null,
            notes: orig.notes || '',
            atelierTable: orig.atelierTable || '',
            componentStates: orig.componentStates || [],
          } : { unitIndex: i, etat: 'non_entame', deliveryDate: null, notes: '', componentStates: [] };
        });

        const newRemplissages = (ch.remplissages || [])
          .filter(r => (r.unitIndex ?? 0) >= start && (r.unitIndex ?? 0) < end)
          .map(r => ({
            type: r.type, sousType: r.sousType, largeur: r.largeur, hauteur: r.hauteur,
            etat: r.etat, deliveryDate: r.deliveryDate,
            unitIndex: (r.unitIndex ?? 0) - start,
            compIndex: r.compIndex, atelierTable: r.atelierTable,
          }));

        console.log(`     → "${v.repere}" ${v.largeur}×${v.hauteur} qty=${qty}`);

        if (APPLY) {
          project.chassis.push({
            type: ch.type,
            repere: v.repere || ch.repere,
            quantity: qty,
            largeur: Number(v.largeur) || 0,
            hauteur: Number(v.hauteur) || 0,
            dimension: `${v.largeur}×${v.hauteur}`,
            keepAsOne: ch.keepAsOne,
            multiDim: false,
            variants: [],
            components: isComposite ? ch.components : [],
            units: newUnits,
            accessories: vi === 0 ? (ch.accessories || []) : [],
            remplissages: newRemplissages,
          });
        }
        splitCount++;
      });

      if (APPLY) project.chassis.pull(oldId);
    }

    if (APPLY) await project.save();
    projectCount++;
  }

  console.log(`\n${APPLY ? '✅ Applied' : 'ℹ️  Would apply'}: ${projectCount} project(s), ${splitCount} new chassis.`);
  await mongoose.disconnect();
}

main().catch(err => { console.error('❌ Migration error:', err); process.exit(1); });