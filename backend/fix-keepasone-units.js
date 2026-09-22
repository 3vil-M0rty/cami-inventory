/**
 * fix-keepasone-units.js
 *
 * One-time repair script for the "keepAsOne" état-propagation bug.
 *
 * Problem: chassis rendered as a single "×N" row (keepAsOne = true, or
 * keepAsOne == null on the 'laquage' tab) store N separate `units[]` entries
 * internally, but the UI only ever displayed/edited units[0]. Before the fix,
 * changing état on the group row only patched units[0], leaving units[1..N-1]
 * stuck on stale états — which then show up in the ProgressBar / project
 * status counts as phantom "en_cours" (or other) states even though the
 * visible row says "Fabriqué".
 *
 * This script walks every project, finds every keepAsOne chassis with
 * quantity > 1, and forces units[1..N-1] (état, deliveryDate, notes,
 * atelierTable, componentStates) to match units[0] — the state actually
 * shown and edited in the UI.
 *
 * USAGE:
 *   1. npm install mongoose   (if not already available)
 *   2. Run with your Mongo URI:
 *        MONGODB_URI="mongodb://localhost:27017/aluminum-inventory" node fix-keepasone-units.js
 *      Or just run it — it defaults to mongodb://localhost:27017/aluminum-inventory
 *
 *   Add --dry-run to only report what WOULD change, without saving:
 *        node fix-keepasone-units.js --dry-run
 *
 * SAFETY:
 *   - Read + write only touches `chassis.units[i]` fields listed above.
 *   - Nothing else on the project or chassis is modified.
 *   - Run --dry-run first to see the report before applying.
 */

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aluminum-inventory';
const DRY_RUN = process.argv.includes('--dry-run');

// ── Minimal schemas — only what we need to read/write chassis.units ──────────
// (Kept loose/untyped on purpose so this script doesn't need to match every
// field in the real server.js models; Mongoose will still let us read/write
// existing subdocuments fine as long as paths match.)

const unitComponentSchema = new mongoose.Schema({
  compIndex: { type: Number },
  etat: { type: String },
  deliveryDate: { type: Date, default: null },
  atelierTable: { type: String, default: '' },
}, { _id: false });

const unitSchema = new mongoose.Schema({
  unitIndex: { type: Number, required: true },
  etat: { type: String, default: 'non_entame' },
  deliveryDate: { type: Date, default: null },
  notes: { type: String, default: '' },
  atelierTable: { type: String, default: '' },
  componentStates: [unitComponentSchema],
}, { _id: true });

const chassisSchema = new mongoose.Schema({
  type: String,
  repere: String,
  quantity: { type: Number, default: 1 },
  keepAsOne: { type: Boolean, default: null },
  components: [mongoose.Schema.Types.Mixed],
  units: [unitSchema],
}, { _id: true, strict: false });

const projectSchema = new mongoose.Schema({
  name: String,
  reference: String,
  tab: { type: String, default: 'aluminium' },
  chassis: [chassisSchema],
}, { strict: false });

const Project = mongoose.model('Project', projectSchema, 'projects');

function statesEqual(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

async function run() {
  console.log(`Connecting to ${MONGODB_URI} ...`);
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');
  if (DRY_RUN) console.log('*** DRY RUN — no changes will be saved ***\n');

  const projects = await Project.find({});
  console.log(`Scanning ${projects.length} project(s)...\n`);

  let projectsTouched = 0;
  let chassisTouched = 0;
  let unitsFixed = 0;
  const report = [];

  for (const project of projects) {
    const projectTab = project.tab || 'aluminium';
    let projectChanged = false;

    for (const chassis of project.chassis || []) {
      const qty = chassis.quantity || 1;
      if (qty <= 1) continue;

      const keepAsOne =
        chassis.keepAsOne === true ||
        (chassis.keepAsOne == null && projectTab === 'laquage');
      if (!keepAsOne) continue;

      const reference = (chassis.units || []).find(u => u.unitIndex === 0);
      if (!reference) continue; // nothing to copy from

      let chassisChanged = false;
      const chassisReport = { project: project.name, repere: chassis.repere, qty, fixedUnits: [] };

      for (let i = 1; i < qty; i++) {
        let unit = chassis.units.find(u => u.unitIndex === i);

        if (!unit) {
          chassisReport.fixedUnits.push({ unitIndex: i, action: 'created', from: null, to: reference.etat });
          if (!DRY_RUN) {
            chassis.units.push({
              unitIndex: i,
              etat: reference.etat,
              deliveryDate: reference.deliveryDate,
              notes: reference.notes,
              atelierTable: reference.atelierTable,
              componentStates: (reference.componentStates || []).map(cs => ({
                compIndex: cs.compIndex,
                etat: cs.etat,
                deliveryDate: cs.deliveryDate,
                atelierTable: cs.atelierTable,
              })),
            });
          }
          unitsFixed++;
          chassisChanged = true;
          continue;
        }

        const needsFix =
          unit.etat !== reference.etat ||
          String(unit.deliveryDate) !== String(reference.deliveryDate) ||
          !statesEqual(unit.componentStates, reference.componentStates);

        if (needsFix) {
          chassisReport.fixedUnits.push({
            unitIndex: i,
            action: 'updated',
            from: unit.etat,
            to: reference.etat,
          });
          if (!DRY_RUN) {
            unit.etat = reference.etat;
            unit.deliveryDate = reference.deliveryDate;
            unit.notes = reference.notes;
            unit.atelierTable = reference.atelierTable;
            if (reference.componentStates && reference.componentStates.length) {
              unit.componentStates = reference.componentStates.map(cs => ({
                compIndex: cs.compIndex,
                etat: cs.etat,
                deliveryDate: cs.deliveryDate,
                atelierTable: cs.atelierTable,
              }));
            }
          }
          unitsFixed++;
          chassisChanged = true;
        }
      }

      if (chassisChanged) {
        chassisTouched++;
        projectChanged = true;
        report.push(chassisReport);
      }
    }

    if (projectChanged) {
      projectsTouched++;
      if (!DRY_RUN) {
        project.markModified('chassis');
        await project.save();
      }
    }
  }

  console.log('─'.repeat(70));
  for (const r of report) {
    console.log(`\n📦 ${r.project} — ${r.repere} (×${r.qty})`);
    for (const f of r.fixedUnits) {
      if (f.action === 'created') {
        console.log(`   unit[${f.unitIndex}]: missing → created with état="${f.to}"`);
      } else {
        console.log(`   unit[${f.unitIndex}]: "${f.from}" → "${f.to}"`);
      }
    }
  }
  console.log('\n' + '─'.repeat(70));
  console.log(
    `${DRY_RUN ? '[DRY RUN] Would fix' : 'Fixed'}: ` +
    `${projectsTouched} project(s), ${chassisTouched} chassis, ${unitsFixed} unit(s).`
  );
  if (DRY_RUN) {
    console.log('\nRe-run without --dry-run to apply these changes.');
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});