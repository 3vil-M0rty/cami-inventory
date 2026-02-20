/**
 * CAMI ALUMINIUM — Backend Server
 * Unit-level chassis storage + Auto project status + BL (Bon de Livraison) system
 */

require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const helmet    = require('helmet');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aluminum-inventory';

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => { console.log('✅ MongoDB connected'); initSampleData(); })
  .catch(err => { console.error('❌ MongoDB error:', err); process.exit(1); });

// ==================== SCHEMAS ====================

const categorySchema = new mongoose.Schema({
  name:  { it: { type: String, required: true }, fr: { type: String, required: true }, en: { type: String, required: true } },
  color: { type: String, default: '#3b82f6' },
  order: { type: Number, default: 0 }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const Category = mongoose.model('Category', categorySchema);

const itemSchema = new mongoose.Schema({
  image:           { type: String, default: '' },
  designation:     { it: { type: String, required: true }, fr: { type: String, required: true }, en: { type: String, required: true } },
  quantity:        { type: Number, required: true, min: 0, default: 0 },
  orderedQuantity: { type: Number, min: 0, default: 0 },
  threshold:       { type: Number, required: true, min: 0, default: 0 },
  categoryId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const Item = mongoose.model('Item', itemSchema);


// ==================== STOCK MOVEMENT SCHEMA ====================
const stockMovementSchema = new mongoose.Schema({
  itemId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  type:        { type: String, enum: ['entree', 'sortie', 'project_use', 'project_return'], required: true },
  quantity:    { type: Number, required: true },
  balanceAfter:{ type: Number, required: true },
  note:        { type: String, default: '' },
  projectId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  projectName: { type: String, default: '' },
}, { timestamps: true });
const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

const chassisTypeSchema = new mongoose.Schema({
  value: { type: String, required: true, unique: true },
  fr:    { type: String, required: true },
  it:    { type: String, default: '' },
  en:    { type: String, default: '' },
  composite: { type: Boolean, default: false },
  vantaux:   { type: Number, default: 0 },
  order:     { type: Number, default: 0 }
}, { timestamps: true });
const ChassisType = mongoose.model('ChassisType', chassisTypeSchema);

// Template-level component definition (dimensions, role, repere)
const componentSchema = new mongoose.Schema({
  role:    { type: String, enum: ['dormant', 'vantail'], required: true },
  repere:  { type: String, default: '' },
  largeur: { type: Number, default: 0 },
  hauteur: { type: Number, default: 0 },
  etat:    { type: String, enum: ['non_entame', 'en_cours', 'fabrique', 'livre'], default: 'non_entame' }
}, { _id: true });

/**
 * Per-unit component state override.
 * compIndex matches the index in chassis.components[].
 * Only etat is tracked per-unit (dimensions live on the template).
 */
const unitComponentSchema = new mongoose.Schema({
  compIndex:    { type: Number, required: true },
  etat:         { type: String, enum: ['non_entame', 'en_cours', 'fabrique', 'livre'], default: 'non_entame' },
  deliveryDate: { type: Date, default: null }
}, { _id: false });

/**
 * UNIT schema — one record per physical chassis unit.
 * When a chassis has quantity=3, we store 3 unit documents inside chassis.units[].
 * For composite chassis, componentStates[] tracks each component's état independently.
 * The unit's own etat is DERIVED from its componentStates (computed, not stored directly
 * for composite chassis — but we store it for non-composite to keep the same API shape).
 */
const unitSchema = new mongoose.Schema({
  unitIndex:       { type: Number, required: true },
  etat:            { type: String, enum: ['non_entame', 'en_cours', 'fabrique', 'livre'], default: 'non_entame' },
  deliveryDate:    { type: Date, default: null },
  notes:           { type: String, default: '' },
  componentStates: [unitComponentSchema]   // only meaningful for composite chassis
}, { _id: true });

/**
 * CHASSIS schema — template (shared dimensions/type) + array of independent units
 */
const chassisSchema = new mongoose.Schema({
  type:      { type: String, required: true },
  repere:    { type: String, required: true },
  quantity:  { type: Number, required: true, min: 1, default: 1 },  // source of truth for unit count
  largeur:   { type: Number, required: true },
  hauteur:   { type: Number, required: true },
  dimension: { type: String, default: '' },
  components: [componentSchema],  // for composite types only
  units:     [unitSchema]         // N independent units (N = quantity)
}, { _id: true });

/**
 * PROJECT schema
 * status is auto-computed — NOT stored manually (computed before each response)
 */
const projectSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  reference: { type: String, required: true, trim: true },
  ralCode:   { type: String, required: true, trim: true },
  ralColor:  { type: String, default: '#ffffff' },
  date:      { type: Date, required: true },
  chassis:   [chassisSchema],
  usedBars:  [{ itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true }, quantity: { type: Number, required: true, min: 1 } }]
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      // Auto-compute project status from all unit states
      ret.status = computeProjectStatus(ret.chassis || []);
      return ret;
    }
  }
});

const Project = mongoose.model('Project', projectSchema);

// ==================== STATUS COMPUTATION ====================

/**
 * Rules:
 *   - No chassis → 'en_cours'
 *   - ALL units 'livre' → 'cloture'
 *   - ALL units 'fabrique' or 'livre' → 'fabrique'
 *   - Otherwise → 'en_cours'
 */
function computeProjectStatus(chassis) {
  if (!chassis || chassis.length === 0) return 'en_cours';

  const allEtats = [];
  for (const ch of chassis) {
    const units     = ch.units || [];
    const qty       = ch.quantity || 1;
    const numComps  = (ch.components || []).length;
    const composite = numComps > 0;

    if (units.length === 0) {
      for (let i = 0; i < qty; i++) allEtats.push('non_entame');
    } else {
      for (const u of units) {
        // For composite units, derive etat from component states
        const etat = composite ? deriveCompositeUnitEtat(u, numComps) : (u.etat || 'non_entame');
        allEtats.push(etat);
      }
    }
  }

  if (allEtats.length === 0) return 'en_cours';
  if (allEtats.every(e => e === 'livre'))                        return 'cloture';
  if (allEtats.every(e => e === 'fabrique' || e === 'livre'))    return 'fabrique';
  return 'en_cours';
}

/**
 * For a composite chassis unit, derive its overall etat from its component states.
 * Rules (same as project status but scoped to one unit):
 *   all livre    → livre
 *   all fabrique|livre → fabrique
 *   otherwise   → en_cours (if any started) or non_entame
 */
function deriveCompositeUnitEtat(unit, numComponents) {
  if (!numComponents) return unit.etat || 'non_entame';
  const states = [];
  for (let i = 0; i < numComponents; i++) {
    const cs = (unit.componentStates || []).find(c => c.compIndex === i);
    states.push(cs ? cs.etat : 'non_entame');
  }
  if (states.every(e => e === 'livre'))                        return 'livre';
  if (states.every(e => e === 'fabrique' || e === 'livre'))    return 'fabrique';
  if (states.some(e => e !== 'non_entame'))                    return 'en_cours';
  return 'non_entame';
}

/**
 * Ensure chassis.units array matches chassis.quantity.
 * For composite chassis, also ensures componentStates is initialized.
 */
function syncUnits(chassis) {
  const qty          = chassis.quantity || 1;
  const numComps     = (chassis.components || []).length;
  const isComposite  = numComps > 0;
  const existing     = chassis.units || [];
  const synced       = [];

  for (let i = 0; i < qty; i++) {
    const found = existing.find(u => u.unitIndex === i);
    if (found) {
      // Ensure componentStates array is initialised for composite units
      if (isComposite && (!found.componentStates || found.componentStates.length < numComps)) {
        const existingStates = found.componentStates || [];
        found.componentStates = Array.from({ length: numComps }, (_, ci) => {
          const ex = existingStates.find(cs => cs.compIndex === ci);
          return ex || { compIndex: ci, etat: 'non_entame', deliveryDate: null };
        });
        // Sync derived etat
        found.etat = deriveCompositeUnitEtat(found, numComps);
      }
      synced.push(found);
    } else {
      const newUnit = {
        unitIndex:       i,
        etat:            'non_entame',
        deliveryDate:    null,
        notes:           '',
        componentStates: isComposite
          ? Array.from({ length: numComps }, (_, ci) => ({ compIndex: ci, etat: 'non_entame', deliveryDate: null }))
          : []
      };
      synced.push(newUnit);
    }
  }
  chassis.units = synced;
}

// ==================== SAMPLE DATA ====================

async function initSampleData() {
  const ctCount = await ChassisType.countDocuments();
  if (ctCount === 0) {
    await ChassisType.insertMany([
      { value: 'chassis_fixe',           fr: 'Châssis fixe',            it: 'Telaio fisso',              en: 'Fixed frame',         composite: false, vantaux: 0, order: 1 },
      { value: 'fenetre_1_ouvrant',       fr: 'Fenêtre 1 ouvrant',       it: 'Finestra 1 anta',           en: 'Window 1 sash',        composite: false, vantaux: 0, order: 2 },
      { value: 'fenetre_2_ouvrants',      fr: 'Fenêtre 2 ouvrants',      it: 'Finestra 2 ante',           en: 'Window 2 sashes',      composite: false, vantaux: 0, order: 3 },
      { value: 'fenetre_oscillo_battant', fr: 'Fenêtre oscillo-battant', it: 'Finestra oscillo-battente', en: 'Tilt & turn window',   composite: false, vantaux: 0, order: 4 },
      { value: 'soufflet',                fr: 'Soufflet',                it: 'Soffietto',                 en: 'Bellows',              composite: false, vantaux: 0, order: 5 },
      { value: 'porte_1_ouvrant',         fr: 'Porte 1 ouvrant',         it: 'Porta 1 anta',              en: 'Door 1 leaf',          composite: false, vantaux: 0, order: 6 },
      { value: 'mur_rideau',              fr: 'Mur rideau',              it: 'Muro cortina',              en: 'Curtain wall',         composite: false, vantaux: 0, order: 7 },
      { value: 'volet_roulant',           fr: 'Volet roulant',           it: 'Tapparella',                en: 'Rolling shutter',      composite: false, vantaux: 0, order: 8 },
      { value: 'faux_cadre',              fr: 'Faux cadre',              it: 'Falso telaio',              en: 'Sub-frame',            composite: false, vantaux: 0, order: 9 },
      { value: 'minimaliste_2_vantaux',   fr: 'Minimaliste 2 vantaux',   it: 'Minimalista 2 ante',        en: 'Minimalist 2 leaves',  composite: true,  vantaux: 2, order: 10 },
      { value: 'minimaliste_3_vantaux',   fr: 'Minimaliste 3 vantaux',   it: 'Minimalista 3 ante',        en: 'Minimalist 3 leaves',  composite: true,  vantaux: 3, order: 11 },
      { value: 'minimaliste_4_vantaux',   fr: 'Minimaliste 4 vantaux',   it: 'Minimalista 4 ante',        en: 'Minimalist 4 leaves',  composite: true,  vantaux: 4, order: 12 },
      { value: 'coulisse_2_vantaux',      fr: 'Coulisse 2 vantaux',      it: 'Scorrevole 2 ante',         en: 'Sliding 2 leaves',     composite: true,  vantaux: 2, order: 13 },
      { value: 'coulisse_3_vantaux',      fr: 'Coulisse 3 vantaux',      it: 'Scorrevole 3 ante',         en: 'Sliding 3 leaves',     composite: true,  vantaux: 3, order: 14 },
      { value: 'coulisse_4_vantaux',      fr: 'Coulisse 4 vantaux',      it: 'Scorrevole 4 ante',         en: 'Sliding 4 leaves',     composite: true,  vantaux: 4, order: 15 },
    ]);
    console.log('✅ Chassis types seeded');
  }

  const catCount = await Category.countDocuments();
  if (catCount === 0) {
    await Category.insertMany([
      { name: { it: 'Serie 6000', fr: 'Série 6000', en: '6000 Series' }, color: '#3b82f6', order: 1 },
      { name: { it: 'Serie 7000', fr: 'Série 7000', en: '7000 Series' }, color: '#8b5cf6', order: 2 },
      { name: { it: 'Serie 5000', fr: 'Série 5000', en: '5000 Series' }, color: '#10b981', order: 3 },
      { name: { it: 'Serie 2000', fr: 'Série 2000', en: '2000 Series' }, color: '#f59e0b', order: 4 },
    ]);
  }

  const itemCount = await Item.countDocuments();
  if (itemCount === 0) {
    await Item.insertMany([
      { image: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=400', designation: { it: 'Barra Alluminio 6063 - 50x25mm', fr: 'Barre Aluminium 6063 - 50x25mm', en: 'Aluminum Bar 6063 - 50x25mm' }, quantity: 45, orderedQuantity: 10, threshold: 20 },
      { image: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=400', designation: { it: 'Barra Alluminio 7075 - 30x30mm', fr: 'Barre Aluminium 7075 - 30x30mm', en: 'Aluminum Bar 7075 - 30x30mm' }, quantity: 8,  orderedQuantity: 25, threshold: 15 },
      { image: 'https://images.unsplash.com/photo-1596555544573-f7c0d5c3bbba?w=400', designation: { it: 'Barra Alluminio 5052 - 60x40mm', fr: 'Barre Aluminium 5052 - 60x40mm', en: 'Aluminum Bar 5052 - 60x40mm' }, quantity: 32, orderedQuantity: 0,  threshold: 25 },
      { image: 'https://images.unsplash.com/photo-1565793298595-6a879b1d9492?w=400', designation: { it: 'Barra Alluminio 2024 - 40x20mm', fr: 'Barre Aluminium 2024 - 40x20mm', en: 'Aluminum Bar 2024 - 40x20mm' }, quantity: 12, orderedQuantity: 20, threshold: 30 },
    ]);
    console.log('✅ Sample inventory seeded');
  }
}

// ==================== HELPERS ====================

async function populateAndReturn(project) {
  await project.populate('usedBars.itemId');
  return project.toJSON();
}

// ==================== HEALTH ====================

app.get('/health', (req, res) => res.json({
  status: 'ok', timestamp: new Date().toISOString(),
  uptime: process.uptime(),
  mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
}));

// ==================== CATEGORY ROUTES ====================

app.get('/api/categories', async (req, res) => {
  try { res.json(await Category.find().sort({ order: 1, createdAt: 1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/categories', async (req, res) => {
  try {
    const c = new Category({ name: req.body.name, color: req.body.color || '#3b82f6', order: req.body.order || 0 });
    await c.save();
    res.status(201).json(c);
  } catch (e) {
    res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    const c = await Category.findByIdAndUpdate(req.params.id, { name: req.body.name, color: req.body.color, order: req.body.order }, { new: true, runValidators: true });
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const c = await Category.findByIdAndDelete(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, id: req.params.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== INVENTORY ROUTES ====================

app.get('/api/inventory', async (req, res) => {
  try {
    const filter = {};
    if (req.query.categoryId && req.query.categoryId !== 'all') filter.categoryId = req.query.categoryId;
    res.json(await Item.find(filter).populate('categoryId').sort({ createdAt: -1 }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inventory/filter/low-stock', async (req, res) => {
  try {
    const items = await Item.find().populate('categoryId');
    res.json(items.filter(i => i.quantity + (i.orderedQuantity || 0) < i.threshold));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inventory/search', async (req, res) => {
  try {
    const filter = {};
    if (req.query.categoryId && req.query.categoryId !== 'all') filter.categoryId = req.query.categoryId;
    if (req.query.q) filter.$or = [
      { 'designation.it': { $regex: req.query.q, $options: 'i' } },
      { 'designation.fr': { $regex: req.query.q, $options: 'i' } },
      { 'designation.en': { $regex: req.query.q, $options: 'i' } },
    ];
    res.json(await Item.find(filter).populate('categoryId').sort({ createdAt: -1 }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inventory/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id).populate('categoryId');
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (e) { res.status(e.kind === 'ObjectId' ? 400 : 500).json({ error: e.message }); }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const item = new Item({ image: req.body.image || '', designation: req.body.designation, quantity: Number(req.body.quantity) || 0, orderedQuantity: Number(req.body.orderedQuantity) || 0, threshold: Number(req.body.threshold) || 0, categoryId: req.body.categoryId || null });
    await item.save();
    await item.populate('categoryId');
    res.status(201).json(item);
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});

app.put('/api/inventory/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndUpdate(req.params.id, { image: req.body.image, designation: req.body.designation, quantity: Number(req.body.quantity) || 0, orderedQuantity: Number(req.body.orderedQuantity) || 0, threshold: Number(req.body.threshold) || 0, categoryId: req.body.categoryId || null }, { new: true, runValidators: true }).populate('categoryId');
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});

app.patch('/api/inventory/:id/quantity', async (req, res) => {
  try {
    const { amount, note } = req.body;
    if (typeof amount !== 'number') return res.status(400).json({ error: 'Amount must be a number' });
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    item.quantity = Math.max(0, item.quantity + amount);
    await item.save();
    await StockMovement.create({
      itemId: item._id, type: amount >= 0 ? 'entree' : 'sortie',
      quantity: Math.abs(amount), balanceAfter: item.quantity, note: note || '',
    });
    await item.populate('categoryId');
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/inventory/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, id: req.params.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== PROJECT ROUTES ====================

app.get('/api/projects', async (req, res) => {
  try {
    const projects = await Project.find().populate('usedBars.itemId').sort({ createdAt: -1 });
    res.json(projects.map(p => p.toJSON()));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const p = await Project.findById(req.params.id).populate('usedBars.itemId');
    if (!p) return res.status(404).json({ error: 'Project not found' });
    res.json(p.toJSON());
  } catch (e) { res.status(e.kind === 'ObjectId' ? 400 : 500).json({ error: e.message }); }
});

app.post('/api/projects', async (req, res) => {
  try {
    const p = new Project({ name: req.body.name, reference: req.body.reference, ralCode: req.body.ralCode, ralColor: req.body.ralColor || '#ffffff', date: req.body.date });
    await p.save();
    res.status(201).json(p.toJSON());
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});

app.put('/api/projects/:id', async (req, res) => {
  try {
    // Note: status is NOT stored — it's computed. Only update editable metadata.
    const p = await Project.findByIdAndUpdate(req.params.id,
      { name: req.body.name, reference: req.body.reference, ralCode: req.body.ralCode, ralColor: req.body.ralColor, date: req.body.date },
      { new: true, runValidators: true }
    ).populate('usedBars.itemId');
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json(p.toJSON());
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const p = await Project.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    for (const bar of p.usedBars) {
      const restored = await Item.findByIdAndUpdate(bar.itemId, { $inc: { quantity: bar.quantity } }, { new: true });
      await StockMovement.create({
        itemId: bar.itemId, type: 'project_return', quantity: bar.quantity,
        balanceAfter: restored ? restored.quantity : 0, projectId: p._id, projectName: p.name,
      });
    }
    await Project.findByIdAndDelete(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CHASSIS ROUTES ====================

// POST — add chassis (creates N independent units from quantity)
app.post('/api/projects/:id/chassis', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const qty = Number(req.body.quantity) || 1;

    // Build independent units array
    const units = Array.from({ length: qty }, (_, i) => ({
      unitIndex:    i,
      etat:         req.body.etat || 'non_entame',
      deliveryDate: null,
      notes:        ''
    }));

    project.chassis.push({
      type:       req.body.type,
      repere:     req.body.repere,
      quantity:   qty,
      largeur:    Number(req.body.largeur) || 0,
      hauteur:    Number(req.body.hauteur) || 0,
      dimension:  req.body.dimension || `${req.body.largeur}×${req.body.hauteur}`,
      components: req.body.components || [],
      units
    });

    await project.save();
    const saved = await populateAndReturn(project);
    res.status(201).json(saved);
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});

// PUT — update chassis template fields (type, repere, dimensions, components)
// Does NOT touch individual unit states
app.put('/api/projects/:id/chassis/:cid', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const chassis = project.chassis.id(req.params.cid);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });

    // Update template fields
    if (req.body.type      !== undefined) chassis.type      = req.body.type;
    if (req.body.repere    !== undefined) chassis.repere    = req.body.repere;
    if (req.body.largeur   !== undefined) chassis.largeur   = Number(req.body.largeur);
    if (req.body.hauteur   !== undefined) chassis.hauteur   = Number(req.body.hauteur);
    if (req.body.dimension !== undefined) chassis.dimension = req.body.dimension;
    if (req.body.components !== undefined) chassis.components = req.body.components;

    // If quantity changed, sync units array
    if (req.body.quantity !== undefined) {
      const newQty = Number(req.body.quantity);
      const oldQty = chassis.quantity;
      chassis.quantity = newQty;

      if (newQty > oldQty) {
        // Add new units
        for (let i = oldQty; i < newQty; i++) {
          chassis.units.push({ unitIndex: i, etat: 'non_entame', deliveryDate: null, notes: '' });
        }
      } else if (newQty < oldQty) {
        // Remove excess units from the end
        chassis.units = chassis.units.filter(u => u.unitIndex < newQty);
      }
    }

    await project.save();
    const saved = await populateAndReturn(project);
    res.json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH — update a specific UNIT's état (non-composite only) or notes/deliveryDate
app.patch('/api/projects/:id/chassis/:cid/units/:unitIndex', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const chassis = project.chassis.id(req.params.cid);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });

    const idx  = parseInt(req.params.unitIndex, 10);
    let   unit = chassis.units.find(u => u.unitIndex === idx);
    const isComposite = (chassis.components || []).length > 0;

    if (!unit) {
      chassis.units.push({ unitIndex: idx, etat: 'non_entame', deliveryDate: null, notes: '', componentStates: [] });
      unit = chassis.units.find(u => u.unitIndex === idx);
    }

    if (req.body.etat !== undefined && !isComposite) {
      unit.etat = req.body.etat;
      if (req.body.etat === 'livre') {
        unit.deliveryDate = req.body.deliveryDate ? new Date(req.body.deliveryDate) : new Date();
      } else {
        unit.deliveryDate = null;
      }
    }
    if (req.body.deliveryDate !== undefined && req.body.etat === undefined) {
      unit.deliveryDate = req.body.deliveryDate ? new Date(req.body.deliveryDate) : null;
    }
    if (req.body.notes !== undefined) unit.notes = req.body.notes;

    await project.save();
    const saved = await populateAndReturn(project);
    res.json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH — update a specific COMPONENT's état within a specific unit (composite chassis)
app.patch('/api/projects/:id/chassis/:cid/units/:unitIndex/components/:compIndex', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const chassis = project.chassis.id(req.params.cid);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });

    const numComps = (chassis.components || []).length;
    if (!numComps) return res.status(400).json({ error: 'Chassis is not composite' });

    const unitIdx = parseInt(req.params.unitIndex, 10);
    const compIdx = parseInt(req.params.compIndex, 10);
    if (compIdx < 0 || compIdx >= numComps) return res.status(400).json({ error: 'Invalid component index' });

    let unit = chassis.units.find(u => u.unitIndex === unitIdx);
    if (!unit) {
      chassis.units.push({
        unitIndex: unitIdx, etat: 'non_entame', deliveryDate: null, notes: '',
        componentStates: Array.from({ length: numComps }, (_, ci) => ({ compIndex: ci, etat: 'non_entame' }))
      });
      unit = chassis.units.find(u => u.unitIndex === unitIdx);
    }
    if (!unit.componentStates) unit.componentStates = [];

    let cs = unit.componentStates.find(c => c.compIndex === compIdx);
    if (!cs) {
      unit.componentStates.push({ compIndex: compIdx, etat: 'non_entame', deliveryDate: null });
      cs = unit.componentStates.find(c => c.compIndex === compIdx);
    }

    if (req.body.etat !== undefined) {
      cs.etat = req.body.etat;
      cs.deliveryDate = req.body.etat === 'livre'
        ? (req.body.deliveryDate ? new Date(req.body.deliveryDate) : new Date())
        : null;
    }

    // Derive unit etat from all component states
    unit.etat = deriveCompositeUnitEtat(unit, numComps);
    if (unit.etat === 'livre') {
      const dates = (unit.componentStates || []).map(c => c.deliveryDate).filter(Boolean);
      unit.deliveryDate = dates.length ? new Date(Math.max(...dates.map(d => new Date(d)))) : new Date();
    } else {
      unit.deliveryDate = null;
    }

    await project.save();
    const saved = await populateAndReturn(project);
    res.json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE — remove chassis
app.delete('/api/projects/:id/chassis/:cid', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassis = project.chassis.id(req.params.cid);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });
    project.chassis.pull(req.params.cid);
    await project.save();
    const saved = await populateAndReturn(project);
    res.json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== BL (BON DE LIVRAISON) ROUTES ====================

/**
 * GET /api/projects/:id/bons-livraison
 * Returns all BLs for a project, derived dynamically from delivered unit/component dates.
 * BL = unique (projectId + deliveryDate).
 * No documents are stored — computed from data.
 *
 * Rules:
 *   - Non-composite unit: appears when unit.etat === 'livre'
 *   - Composite unit: each component appears individually when its componentState.etat === 'livre'
 *     (does NOT wait for the parent unit to be fully 'livre')
 */
app.get('/api/projects/:id/bons-livraison', async (req, res) => {
  try {
    const project      = await Project.findById(req.params.id).populate('usedBars.itemId');
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Resolve human-readable chassis type labels (fr) from ChassisType collection
    const chassisTypes = await ChassisType.find().lean();
    const typeLabel = (typeValue) => {
      const ct = chassisTypes.find(t => t.value === typeValue);
      return ct ? (ct.fr || ct.value) : typeValue;
    };

    const blMap = {}; // key = YYYY-MM-DD

    const ensureBL = (dateKey) => {
      if (!blMap[dateKey]) {
        blMap[dateKey] = {
          blId:         `BL-${project._id.toString().slice(-6).toUpperCase()}-${dateKey.replace(/-/g, '')}`,
          projectId:    project._id,
          projectName:  project.name,
          reference:    project.reference,
          ralCode:      project.ralCode,
          ralColor:     project.ralColor,
          deliveryDate: dateKey,
          units:        []
        };
      }
      return blMap[dateKey];
    };

    for (const chassis of project.chassis) {
      const isComposite  = (chassis.components || []).length > 0;
      const unitSuffix   = (idx) => chassis.quantity > 1 ? ` #${idx + 1}` : '';
      const designation  = typeLabel(chassis.type);

      for (const unit of chassis.units || []) {
        if (!isComposite) {
          // Simple unit — add when etat is livre
          if (unit.etat === 'livre' && unit.deliveryDate) {
            const dateKey = new Date(unit.deliveryDate).toISOString().split('T')[0];
            ensureBL(dateKey).units.push({
              chassisId:     chassis._id,
              chassisRepere: chassis.repere,
              chassisType:   designation,
              dimension:     chassis.dimension || `${chassis.largeur}×${chassis.hauteur}`,
              unitIndex:     unit.unitIndex,
              unitLabel:     `${chassis.repere}${unitSuffix(unit.unitIndex)}`,
              deliveryDate:  unit.deliveryDate,
              notes:         unit.notes || '',
              isComponent:   false,
            });
          }
        } else {
          // Composite unit — each component is independent
          for (const cs of (unit.componentStates || [])) {
            if (cs.etat === 'livre' && cs.deliveryDate) {
              const comp     = chassis.components[cs.compIndex];
              if (!comp) continue;
              const dateKey  = new Date(cs.deliveryDate).toISOString().split('T')[0];
              const roleLabel = comp.role === 'dormant' ? 'Dormant' : `Vantail ${cs.compIndex}`;
              const compRepere = comp.repere || roleLabel;
              ensureBL(dateKey).units.push({
                chassisId:     chassis._id,
                chassisRepere: chassis.repere,
                chassisType:   designation,
                dimension:     comp.largeur && comp.hauteur ? `${comp.largeur}×${comp.hauteur}` : (chassis.dimension || `${chassis.largeur}×${chassis.hauteur}`),
                unitIndex:     unit.unitIndex,
                compIndex:     cs.compIndex,
                unitLabel:     `${chassis.repere}${unitSuffix(unit.unitIndex)} — ${compRepere}`,
                deliveryDate:  cs.deliveryDate,
                notes:         unit.notes || '',
                isComponent:   true,
                role:          roleLabel,
              });
            }
          }
        }
      }
    }

    const bls = Object.values(blMap).sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
    res.json(bls);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /api/projects/:id/bons-livraison/:dateKey
 * Returns a single BL for a specific date (for preview/print).
 */
app.get('/api/projects/:id/bons-livraison/:dateKey', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate('usedBars.itemId');
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const chassisTypes = await ChassisType.find().lean();
    const typeLabel = (typeValue) => {
      const ct = chassisTypes.find(t => t.value === typeValue);
      return ct ? (ct.fr || ct.value) : typeValue;
    };

    const targetDate  = req.params.dateKey;
    const units       = [];

    for (const chassis of project.chassis) {
      const isComposite = (chassis.components || []).length > 0;
      const unitSuffix  = (idx) => chassis.quantity > 1 ? ` #${idx + 1}` : '';
      const designation = typeLabel(chassis.type);

      for (const unit of chassis.units || []) {
        if (!isComposite) {
          if (unit.etat === 'livre' && unit.deliveryDate) {
            const dateKey = new Date(unit.deliveryDate).toISOString().split('T')[0];
            if (dateKey === targetDate) {
              units.push({
                chassisId:     chassis._id,
                chassisRepere: chassis.repere,
                chassisType:   designation,
                dimension:     chassis.dimension || `${chassis.largeur}×${chassis.hauteur}`,
                unitIndex:     unit.unitIndex,
                unitLabel:     `${chassis.repere}${unitSuffix(unit.unitIndex)}`,
                deliveryDate:  unit.deliveryDate,
                notes:         unit.notes || '',
                isComponent:   false,
              });
            }
          }
        } else {
          for (const cs of (unit.componentStates || [])) {
            if (cs.etat === 'livre' && cs.deliveryDate) {
              const dateKey = new Date(cs.deliveryDate).toISOString().split('T')[0];
              if (dateKey === targetDate) {
                const comp      = chassis.components[cs.compIndex];
                if (!comp) continue;
                const roleLabel = comp.role === 'dormant' ? 'Dormant' : `Vantail ${cs.compIndex}`;
                const compRepere = comp.repere || roleLabel;
                units.push({
                  chassisId:     chassis._id,
                  chassisRepere: chassis.repere,
                  chassisType:   designation,
                  dimension:     comp.largeur && comp.hauteur ? `${comp.largeur}×${comp.hauteur}` : (chassis.dimension || `${chassis.largeur}×${chassis.hauteur}`),
                  unitIndex:     unit.unitIndex,
                  compIndex:     cs.compIndex,
                  unitLabel:     `${chassis.repere}${unitSuffix(unit.unitIndex)} — ${compRepere}`,
                  deliveryDate:  cs.deliveryDate,
                  notes:         unit.notes || '',
                  isComponent:   true,
                  role:          roleLabel,
                });
              }
            }
          }
        }
      }
    }

    if (units.length === 0) return res.status(404).json({ error: 'No delivered units on this date' });

    res.json({
      blId:         `BL-${project._id.toString().slice(-6).toUpperCase()}-${targetDate.replace(/-/g, '')}`,
      projectId:    project._id,
      projectName:  project.name,
      reference:    project.reference,
      ralCode:      project.ralCode,
      ralColor:     project.ralColor,
      deliveryDate: targetDate,
      units
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== USED BARS ROUTES ====================

app.post('/api/projects/:id/bars', async (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    if (!itemId || !quantity || quantity < 1) return res.status(400).json({ error: 'itemId and quantity (≥1) required' });

    const [project, item] = await Promise.all([Project.findById(req.params.id), Item.findById(itemId)]);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!item)    return res.status(404).json({ error: 'Item not found' });
    if (item.quantity < quantity) return res.status(400).json({ error: 'Insufficient stock', available: item.quantity });

    const existing = project.usedBars.find(b => b.itemId.toString() === itemId.toString());
    if (existing) { existing.quantity += Number(quantity); }
    else          { project.usedBars.push({ itemId, quantity: Number(quantity) }); }

    item.quantity = Math.max(0, item.quantity - Number(quantity));
    await Promise.all([item.save(), project.save()]);
    await StockMovement.create({
      itemId: item._id, type: 'project_use', quantity: Number(quantity),
      balanceAfter: item.quantity, projectId: project._id, projectName: project.name,
    });
    await project.populate('usedBars.itemId');

    res.status(201).json(project.toJSON());
  } catch (e) { res.status(e.kind === 'ObjectId' ? 400 : 500).json({ error: e.message }); }
});

app.delete('/api/projects/:id/bars/:itemId', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const barEntry = project.usedBars.find(b => b.itemId.toString() === req.params.itemId);
    if (!barEntry) return res.status(404).json({ error: 'Bar not in project' });

    const restoredItem = await Item.findByIdAndUpdate(
      req.params.itemId, { $inc: { quantity: barEntry.quantity } }, { new: true }
    );
    await StockMovement.create({
      itemId: req.params.itemId, type: 'project_return', quantity: barEntry.quantity,
      balanceAfter: restoredItem ? restoredItem.quantity : 0,
      projectId: project._id, projectName: project.name,
    });
    project.usedBars = project.usedBars.filter(b => b.itemId.toString() !== req.params.itemId);
    await project.save();
    await project.populate('usedBars.itemId');

    res.json(project.toJSON());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CHASSIS TYPE ROUTES ====================

app.get('/api/chassis-types', async (req, res) => {
  try { res.json(await ChassisType.find().sort({ order: 1, createdAt: 1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/chassis-types', async (req, res) => {
  try {
    const { value, fr, it, en, composite, vantaux } = req.body;
    if (!value || !fr) return res.status(400).json({ error: 'value and fr are required' });
    const count = await ChassisType.countDocuments();
    const ct = new ChassisType({ value, fr, it: it || fr, en: en || fr, composite: !!composite, vantaux: composite ? (Number(vantaux) || 2) : 0, order: count });
    await ct.save();
    res.status(201).json(ct);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Type value already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/chassis-types/:id', async (req, res) => {
  try {
    const ct = await ChassisType.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!ct) return res.status(404).json({ error: 'Not found' });
    res.json(ct);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/chassis-types/:id', async (req, res) => {
  try {
    await ChassisType.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== STOCK MOVEMENT ROUTES ====================

app.get('/api/movements', async (req, res) => {
  try {
    const { itemId, type, from, to, limit = 500 } = req.query;
    const filter = {};
    if (itemId) filter.itemId = itemId;
    if (type && type !== 'all') filter.type = type;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(new Date(to).setHours(23,59,59,999));
    }
    const movements = await StockMovement.find(filter)
      .populate('itemId', 'designation categoryId')
      .sort({ createdAt: -1 })
      .limit(Number(limit));
    res.json(movements);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/movements/item/:itemId', async (req, res) => {
  try {
    const movements = await StockMovement.find({ itemId: req.params.itemId })
      .sort({ createdAt: -1 }).limit(100);
    res.json(movements);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ANALYTICS ROUTES ====================

app.get('/api/analytics/dashboard', async (req, res) => {
  try {
    const [projects, items, movements] = await Promise.all([
      Project.find().lean(),
      Item.find().populate('categoryId').lean(),
      StockMovement.find().populate('itemId', 'designation').sort({ createdAt: 1 }).lean(),
    ]);

    // KPIs
    const criticalItems = items.filter(i => (i.quantity + (i.orderedQuantity||0)) < i.threshold);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const projectsInProgress = projects.filter(p => computeProjectStatus(p.chassis||[]) === 'en_cours').length;

    let deliveriesThisMonth = 0;
    for (const p of projects) {
      for (const ch of p.chassis||[]) {
        for (const u of ch.units||[]) {
          if (u.etat==='livre' && u.deliveryDate && new Date(u.deliveryDate)>=monthStart) deliveriesThisMonth++;
          for (const cs of u.componentStates||[]) {
            if (cs.etat==='livre' && cs.deliveryDate && new Date(cs.deliveryDate)>=monthStart) deliveriesThisMonth++;
          }
        }
      }
    }

    // Chassis status counts
    const chassisStatusCounts = { non_entame:0, en_cours:0, fabrique:0, livre:0 };
    for (const p of projects) {
      for (const ch of p.chassis||[]) {
        const qty = ch.quantity||1;
        const isComp = (ch.components||[]).length>0;
        for (let i=0;i<qty;i++) {
          const unit = (ch.units||[]).find(u=>u.unitIndex===i)||{etat:'non_entame',componentStates:[]};
          let etat;
          if (isComp) {
            const states=(ch.components||[]).map((_,ci)=>{const cs=(unit.componentStates||[]).find(c=>c.compIndex===ci);return cs?cs.etat:'non_entame';});
            if (states.every(e=>e==='livre')) etat='livre';
            else if (states.every(e=>e==='fabrique'||e==='livre')) etat='fabrique';
            else if (states.some(e=>e!=='non_entame')) etat='en_cours';
            else etat='non_entame';
          } else { etat=unit.etat||'non_entame'; }
          chassisStatusCounts[etat]++;
        }
      }
    }

    // Project consumption (top 10)
    const projectConsumption = projects
      .filter(p=>(p.usedBars||[]).length>0)
      .map(p=>({ projectId:p._id, projectName:p.name, reference:p.reference,
        totalBars:(p.usedBars||[]).reduce((s,b)=>s+b.quantity,0), barCount:(p.usedBars||[]).length }))
      .sort((a,b)=>b.totalBars-a.totalBars).slice(0,10);

    // Top 5 consumed items (from movement log)
    const itemConsMap = {};
    for (const m of movements) {
      if (m.type==='project_use' && m.itemId) {
        const id=m.itemId._id?.toString()||m.itemId.toString();
        const des=m.itemId.designation||{};
        if (!itemConsMap[id]) itemConsMap[id]={id,designation:des,total:0};
        itemConsMap[id].total+=m.quantity;
      }
    }
    const topItems=Object.values(itemConsMap).sort((a,b)=>b.total-a.total).slice(0,5);

    // Monthly movements (last 12 months)
    const monthlyMap={};
    for (let i=11;i>=0;i--) {
      const d=new Date(now.getFullYear(),now.getMonth()-i,1);
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthlyMap[key]={month:key,entrees:0,sorties:0,project_use:0,project_return:0};
    }
    for (const m of movements) {
      const d=new Date(m.createdAt);
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (monthlyMap[key]) {
        const typeKey = m.type === 'entree' ? 'entrees' : m.type === 'sortie' ? 'sorties' : m.type;
        monthlyMap[key][typeKey] = (monthlyMap[key][typeKey] || 0) + m.quantity;
      }
    }

    // Stock health by category
    const catMap={};
    for (const item of items) {
      const catId=item.categoryId?._id?.toString()||'none';
      const catName=item.categoryId?.name||{fr:'Sans catégorie',it:'Senza categoria',en:'No category'};
      const catColor=item.categoryId?.color||'#9ca3af';
      if (!catMap[catId]) catMap[catId]={catId,catName,catColor,total:0,ok:0,low:0,critical:0};
      catMap[catId].total++;
      const total=item.quantity+(item.orderedQuantity||0);
      if (total<item.threshold) catMap[catId].critical++;
      else if (item.quantity<item.threshold) catMap[catId].low++;
      else catMap[catId].ok++;
    }

    res.json({
      kpis:{ totalProjects:projects.length, projectsInProgress, totalItems:items.length,
        criticalItems:criticalItems.length, deliveriesThisMonth, totalMovements:movements.length },
      chassisStatusCounts, projectConsumption, topItems,
      monthlyMovements:Object.values(monthlyMap),
      stockByCategory:Object.values(catMap),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ==================== ERROR HANDLERS ====================

app.use((req, res) => res.status(404).json({ error: 'Not Found', path: req.path }));
app.use((err, req, res, next) => {
  console.error('Unhandled:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// ==================== START ====================

app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
});

process.on('SIGTERM', () => { mongoose.connection.close(); process.exit(0); });