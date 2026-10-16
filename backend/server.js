/**
 * CAMI / GIMAV — Backend Server
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const compression = require('compression');

const app = express();
// Request context: lets a stock movement know which account caused it, wherever it is created
const { AsyncLocalStorage } = require('async_hooks');
const reqContext = new AsyncLocalStorage();
const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, 'public')));
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json());
app.use((req, res, next) => reqContext.run({ req }, next));
app.use(compression()); // add this near your other app.use() calls, before routes

app.use(express.urlencoded({ extended: true }));
// Request log WITH duration and response size, to see what is slow: "GET /api/orders 200 1834ms 412kB"
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const len = Number(res.getHeader('content-length')) || 0;
    const size = len ? ` ${(len / 1024).toFixed(0)}kB` : '';
    const flag = ms > 1000 ? ' 🐢' : '';
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(0)}ms${size}${flag}`);
  });
  next();
});

// Orders list cache. Safe with several server instances: before serving it, we check in the
// database (1 cheap round trip) that no order / article / company / supplier changed since.
const ordersListCache = new Map(); // filterKey -> { at, version, data }
const ORDERS_CACHE_MS = 5 * 60 * 1000;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aluminum-inventory';

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => { console.log('✅ MongoDB connected'); initSampleData(); migrateExistingData(); migrateLaquageToLots(); fixStuckLaquageLots(); seedSuperCategories(); resyncAllOrderedQuantities(); backfillItemSearchText(); })
  .catch(err => { console.error('❌ MongoDB error:', err); process.exit(1); });



async function fixStuckLaquageLots() {
  const now = new Date();

  function barresLineKeys(lot) {
    const keys = [];
    (lot.barresBrutes || []).forEach((_, i) => keys.push(`bb-${i}`));
    (lot.barresLaquees || []).forEach((_, i) => keys.push(`bl-${i}`));
    (lot.morceauxBruts || []).forEach((_, i) => keys.push(`mb-${i}`));
    (lot.morceauxLaques || []).forEach((r, i) =>
      (r.lignes || [{}]).forEach((_, li) => keys.push(`ml-${i}-${li}`))
    );
    return keys;
  }

  for (const record of await LaquageBarres.find({})) {
    let changed = false;
    for (const lot of record.lots || []) {
      const keys = barresLineKeys(lot);
      if (!keys.length) continue;
      if (lot.status === 'sent_to_laquage' && keys.every(k => lot.lineStatuses?.[k]?.receivedLaquage)) {
        lot.status = 'received_laquage';
        record.history.push({ action: 'receive_all_laquage', by: 'system-fix', at: now, lotIndex: lot.lotIndex, note: '(auto-fix)' });
        changed = true;
      }
    }
    if (changed) { record.markModified('lots'); await record.save(); console.log('✅ Fixed stuck barres lot for project', record.projectId); }
  }

  for (const record of await LaquageAccessoires.find({})) {
    let changed = false;
    for (const lot of record.lots || []) {
      const keys = (lot.accessoires || []).map((_, i) => `acc-${i}`);
      if (!keys.length) continue;
      if (lot.status === 'sent_to_laquage' && keys.every(k => lot.lineStatuses?.[k]?.receivedLaquage)) {
        lot.status = 'received_laquage';
        record.history.push({ action: 'receive_all_laquage', by: 'system-fix', at: now, lotIndex: lot.lotIndex, note: '(auto-fix)' });
        changed = true;
      }
    }
    if (changed) { record.markModified('lots'); await record.save(); console.log('✅ Fixed stuck accessoires lot for project', record.projectId); }
  }
}

// ==================== SCHEMAS ====================

const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  logo: { type: String, default: '' },
  rc: { type: String, default: '' },
  ice: { type: String, default: '' },
  bcConfig: {
    start: { type: Number, default: 1 },     // first number admin wants, e.g. 260574
    next: { type: Number, default: null },   // managed automatically (= start until first send)
    prefix: { type: String, default: '' },     // optional, e.g. "BC-"
    suffix: { type: String, default: '' },     // optional, e.g. "/2026"
    padding: { type: Number, default: 0 },      // zero-pad width, 0 = none
  },
  color: { type: String, default: '#1a1a1a' }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const Company = mongoose.model('Company', companySchema);

const superCategorySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  label: { fr: String, it: String, en: String },
  color: { type: String, default: '#3b82f6' },
  order: { type: Number, default: 0 }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const SuperCategory = mongoose.model('SuperCategory', superCategorySchema);

const ALL_PERMISSIONS = [
  'inventory.view', 'inventory.edit', 'inventory.delete', 'inventory.quantity',
  'inventory.aluminium.view', 'inventory.aluminium.edit', 'inventory.aluminium.delete',
  'inventory.verre.view', 'inventory.verre.edit', 'inventory.verre.delete',
  'inventory.accessoires.view', 'inventory.accessoires.edit', 'inventory.accessoires.delete',
  'inventory.poudre.view', 'inventory.poudre.edit', 'inventory.poudre.delete',
  'inventory.fer.view', 'inventory.fer.edit', 'inventory.fer.delete',
  'inventory.toles.view', 'inventory.toles.edit', 'inventory.toles.delete',
  'orders.view', 'orders.edit', 'orders.delete', 'orders.receive', 'orders.accounting',
  'projects.view', 'projects.edit', 'projects.delete',
  'clients.view', 'clients.edit', 'clients.delete',
  'devis.view', 'devis.edit', 'devis.delete', 'devis.prices',
  'movements.view',
  'analytics.view',
  'admin.view',
  'ateliertables.view',
  'chantiers.view', 'chantiers.edit', 'chantiers.delete',
];

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  permissions: [{ type: String, enum: [...ALL_PERMISSIONS] }],
  color: { type: String, default: '#3b82f6' },
  isSystem: { type: Boolean, default: false }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; } } });
const Role = mongoose.model('Role', roleSchema);

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  displayName: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
  active: { type: Boolean, default: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  // Inventory articles this account may see / adjust. Empty = no restriction (all articles of its categories).
  allowedItemIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Item' }],
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; delete ret.passwordHash; return ret; } } });
const User = mongoose.model('User', userSchema);

// Article restriction of the logged-in account (null = none)
const allowedItemsOf = (req) => {
  const ids = req.user?.allowedItemIds;
  return Array.isArray(ids) && ids.length ? ids.map(id => String(id?._id || id)) : null;
};
const applyItemRestriction = (filter, req) => {
  const ids = allowedItemsOf(req);
  if (ids) filter._id = { $in: ids.map(id => new mongoose.Types.ObjectId(id)) };
  return filter;
};
const isItemAllowed = (req, itemId) => { const ids = allowedItemsOf(req); return !ids || ids.includes(String(itemId)); };

const sessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
// Expired sessions are removed automatically by MongoDB (TTL index)
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Session = mongoose.model('Session', sessionSchema);

const categorySchema = new mongoose.Schema({
  name: { it: { type: String, required: true }, fr: { type: String, required: true }, en: { type: String, required: true } },
  color: { type: String, default: '#3b82f6' },
  order: { type: Number, default: 0 },
  superCategory: { type: String, default: 'aluminium' }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const Category = mongoose.model('Category', categorySchema);

const itemSchema = new mongoose.Schema({
  image: { type: String, default: '' },
  designation: { it: { type: String, required: true }, fr: { type: String, required: true }, en: { type: String, required: true } },
  quantity: { type: Number, required: true, min: 0, default: 0 },
  orderedQuantity: { type: Number, min: 0, default: 0 },
  threshold: { type: Number, required: true, min: 0, default: 0 },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  codeInterne: { type: String, default: '' },
  supplierCodes: [{
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fournisseur', required: true },
    code: { type: String, default: '' },
  }],
  superCategory: { type: String, default: 'aluminium' },
  // Lowercase, accent-free copy of designations + codes, kept in sync on save → fast server-side search
  searchText: { type: String, default: '', select: false },
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; delete ret.searchText; } } });
// "Fenêtre ALU 20x40" → "fenetre alu 20x40"
const normalizeSearch = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const buildItemSearchText = (it) => normalizeSearch([
  it.designation?.fr, it.designation?.it, it.designation?.en, it.codeInterne,
  ...(it.supplierCodes || []).map(sc => sc.code),
].filter(Boolean).join(' '));
itemSchema.pre('save', function (next) { this.searchText = buildItemSearchText(this); next(); });
itemSchema.index({ updatedAt: -1 });
itemSchema.index({ createdAt: -1 });
itemSchema.index({ searchText: 1 });
itemSchema.index({ codeInterne: 1 });
itemSchema.index({ 'supplierCodes.code': 1 });
itemSchema.index({ superCategory: 1, createdAt: -1 });
itemSchema.index({ superCategory: 1, categoryId: 1, createdAt: -1 });
const Item = mongoose.model('Item', itemSchema);

const stockMovementSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  // initial = stock entered when the article is created · correction_plus / correction_moins = quantity changed in the article form
  type: { type: String, enum: ['entree', 'sortie', 'project_use', 'project_return', 'order_reception', 'initial', 'correction_plus', 'correction_moins'], required: true },
  quantity: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  user: { type: String, default: '' },
  note: { type: String, default: '' },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  projectName: { type: String, default: '' },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
}, { timestamps: true });
stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ itemId: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1, createdAt: -1 });
// Who: the logged-in account of the request that created the movement
stockMovementSchema.pre('validate', function (next) {
  if (!this.user) {
    const u = reqContext.getStore()?.req?.user;
    if (u) this.user = u.displayName || u.username || '';
  }
  next();
});
const MOVE_IN = new Set(['entree', 'order_reception', 'project_return', 'initial', 'correction_plus']);
const MOVE_OUT = new Set(['sortie', 'project_use', 'correction_moins']);
const moveSign = (type) => (MOVE_IN.has(type) ? 1 : MOVE_OUT.has(type) ? -1 : 0);
const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

const orderLineSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  quantityOrdered: { type: Number, required: true, min: 1 },
  quantityReceived: { type: Number, default: 0, min: 0 },
  unitPrice: { type: Number, default: 0 },
  note: { type: String, default: '' },
  // Line closed although not fully received (e.g. 198 / 200): the rest will never come,
  // so it no longer counts in Item.orderedQuantity and the line counts as complete.
  closed: { type: Boolean, default: false },
  closedAt: { type: Date, default: null },
  closedBy: { type: String, default: '' },
  closedNote: { type: String, default: '' },
}, { _id: true });

const orderSchema = new mongoose.Schema({
  number: { type: String, default: '' },
  reference: { type: String, default: '', trim: true },
  // CHANGED: from single 'category' to 'categories' array
  categories: {
    type: [String],
    enum: ['aluminium', 'verre', 'accessoires', 'poudre', 'fer', 'toles'],
    default: [],
  },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fournisseur', default: null },
  supplier: { type: String, default: '' },
  orderDate: { type: Date, required: true },
  expectedDate: { type: Date, default: null },
  status: { type: String, enum: ['brouillon', 'envoye', 'partielle', 'recue', 'annulee'], default: 'brouillon' },
  lines: [orderLineSchema],
  tva: { type: Number, default: 20 },
  notes: { type: String, default: '' },
  sentAt: { type: Date, default: null },
  sentBy: { type: String, default: '' },
  receptions: [{
    lineId: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantityReceived: { type: Number, required: true },
    blNumber: { type: String, required: true, trim: true },
    receivedBy: { type: String, default: '' },
    receivedAt: { type: Date, default: Date.now },
    // Reception entered by mistake: cancelled (stock + line reverted), kept for traceability
    cancelled: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, default: '' },
    cancelNote: { type: String, default: '' },
    // Quantity corrected after the fact (e.g. 100 entered instead of 90) — history of corrections
    adjustments: [{
      from: { type: Number, required: true },
      to: { type: Number, required: true },
      at: { type: Date, default: Date.now },
      by: { type: String, default: '' },
      note: { type: String, default: '' },
      _id: false,
    }],
  }],
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });

// Keep the index but update to use categories array
orderSchema.index({ companyId: 1, number: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ status: 1, orderDate: -1 });
orderSchema.index({ 'lines.itemId': 1 });
orderSchema.index({ updatedAt: -1 });
const Order = mongoose.model('Order', orderSchema);

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  company: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  notes: { type: String, default: '' },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const Client = mongoose.model('Client', clientSchema);

const devisLineSchema = new mongoose.Schema({
  chassisType: { type: String, default: '' },
  description: { type: String, default: '' },
  largeur: { type: Number, default: 0 },
  hauteur: { type: Number, default: 0 },
  quantity: { type: Number, default: 1, min: 1 },
  unitPrice: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  ralCode: { type: String, default: '' }
}, { _id: true });

const devisSchema = new mongoose.Schema({
  reference: { type: String, required: true, trim: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  date: { type: Date, required: true },
  validUntil: { type: Date, default: null },
  status: { type: String, enum: ['brouillon', 'envoye', 'accepte', 'refuse'], default: 'brouillon' },
  lines: [devisLineSchema],
  tva: { type: Number, default: 20 },
  notes: { type: String, default: '' },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const Devis = mongoose.model('Devis', devisSchema);

const chassisTypeSchema = new mongoose.Schema({
  value: { type: String, required: true, unique: true },
  fr: { type: String, required: true },
  it: { type: String, default: '' },
  en: { type: String, default: '' },
  composite: { type: Boolean, default: false },
  vantaux: { type: Number, default: 0 },
  order: { type: Number, default: 0 }
}, { timestamps: true });
const ChassisType = mongoose.model('ChassisType', chassisTypeSchema);

const chassisTypeAccessorySchema = new mongoose.Schema({
  chassisTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChassisType', required: true },
  itemId: { type: String, default: '' },
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  quantity: { type: Number, default: 0, min: 0 },
  formula: { type: String, default: '' },
}, { timestamps: true });
chassisTypeAccessorySchema.index({ chassisTypeId: 1 });
const ChassisTypeAccessory = mongoose.model('ChassisTypeAccessory', chassisTypeAccessorySchema);

const componentSchema = new mongoose.Schema({
  role: { type: String, enum: ['dormant', 'vantail'], required: true },
  repere: { type: String, default: '' },
  largeur: { type: Number, default: 0 },
  hauteur: { type: Number, default: 0 },
  etat: { type: String, enum: ['non_entame', 'en_cours', 'fabrique', 'livre', 'non_vitre', 'pret_a_livrer'], default: 'non_entame' }
}, { _id: true });

const unitComponentSchema = new mongoose.Schema({
  compIndex: { type: Number, required: true },
  etat: { type: String, enum: ['non_entame', 'en_cours', 'fabrique', 'livre', 'non_vitre', 'pret_a_livrer'], default: 'non_entame' },
  deliveryDate: { type: Date, default: null },
  atelierTable: { type: String, default: '' },
}, { _id: false });

const unitSchema = new mongoose.Schema({
  unitIndex: { type: Number, required: true },
  etat: { type: String, enum: ['non_entame', 'en_cours', 'fabrique', 'livre', 'non_vitre', 'pret_a_livrer'], default: 'non_entame' },
  deliveryDate: { type: Date, default: null },
  notes: { type: String, default: '' },
  atelierTable: { type: String, default: '' },
  componentStates: [unitComponentSchema]
}, { _id: true });

const chassisAccessorySchema = new mongoose.Schema({
  itemId: { type: String, default: '' },
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  quantity: { type: Number, default: 0 },
  formula: { type: String, default: '' },
}, { _id: true });

// ── Remplissage (vitrage / panneau) ──────────────────────────────────────────
const remplissageSchema = new mongoose.Schema({
  type: { type: String, required: true },
  sousType: { type: String, default: '' },
  largeur: { type: Number, required: true },
  hauteur: { type: Number, required: true },
  etat: { type: String, enum: ['non_entame', 'en_cours', 'non_vitre', 'fabrique', 'livre', 'pret_a_livrer'], default: 'non_entame' },
  deliveryDate: { type: Date, default: null },
  unitIndex: { type: Number, default: 0 },
  compIndex: { type: Number, default: null }, // null = non-composite unit; 0..N = specific component index
  atelierTable: { type: String, default: '' },
}, { _id: true });

const chassisSchema = new mongoose.Schema({
  type: { type: String, required: true },
  repere: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  largeur: { type: Number, required: true },
  hauteur: { type: Number, required: true },
  dimension: { type: String, default: '' },
  keepAsOne: { type: Boolean, default: null },   // ← ADD THIS
  multiDim: { type: Boolean, default: false },   // ← ADD THIS (already sent by ChassisForm)
  variants: { type: mongoose.Schema.Types.Mixed, default: [] }, // ← ADD THIS (already sent)
  components: [componentSchema],
  profileSerie: { type: String, default: '' }, // 'atla78' | 'atla78slim': components derived from L × H
  allege: { type: Number, default: 0 },          // allège (mm) subtracted from the vantaux height
  units: [unitSchema],
  accessories: [chassisAccessorySchema],
  remplissages: [remplissageSchema],
}, { _id: true });

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  reference: { type: String, required: true, trim: true },
  ralCode: { type: String, required: true, trim: true },
  ralColor: { type: String, default: '#ffffff' },
  date: { type: Date, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
  tab: { type: String, enum: ['aluminium', 'laquage', 'vitrage'], default: 'aluminium' },
  chassis: [chassisSchema],

  usedBars: [{ itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true }, quantity: { type: Number, required: true, min: 0.01 } }]
}, {
  timestamps: true,
  toJSON: {
    transform: function (doc, ret) {
      ret.id = ret._id; delete ret._id; delete ret.__v;
      ret.status = computeProjectStatus(ret.chassis || []);
      return ret;
    }
  }
});

// Add to projectSchema definition
projectSchema.add({
  cachedStatus: { type: String, default: 'non_entame' },
  cachedTotalPieces: { type: Number, default: 0 },
  cachedEtatCounts: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
});

projectSchema.pre('save', function (next) {
  // Always recompute — don't rely on isModified('chassis') detection,
  // which can miss deep/nested subdocument mutations and leave cachedStatus stale.
  this.cachedStatus = computeProjectStatus(this.chassis || []);
  this.cachedTotalPieces = (this.chassis || []).reduce((s, ch) => s + (ch.quantity || 1), 0);
  this.cachedEtatCounts = computeEtatCounts(this.chassis || []);
  next();
});

// Indexes for fast filtering
projectSchema.index({ tab: 1, cachedStatus: 1, createdAt: -1 });
projectSchema.index({ companyId: 1, createdAt: -1 });

const Project = mongoose.model('Project', projectSchema);

// ==================== CHANTIER SCHEMAS ====================

const chantierStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  label: { type: String, required: true, trim: true },
  color: { type: String, default: '#6b7280' },
  order: { type: Number, default: 0 },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; } } });
const ChantierState = mongoose.model('ChantierState', chantierStateSchema);

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#3b82f6' },
  description: { type: String, default: '' },
  stock: [{
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    quantity: { type: Number, default: 0, min: 0 },
  }],
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; } } });
const Team = mongoose.model('Team', teamSchema);

const teamStockMovementSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  type: { type: String, enum: ['entree', 'sortie', 'chantier_use', 'chantier_return'], required: true },
  quantity: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  note: { type: String, default: '' },
  chantierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chantier', default: null },
  chantierName: { type: String, default: '' },
}, { timestamps: true });
const TeamStockMovement = mongoose.model('TeamStockMovement', teamStockMovementSchema);

const chantierUnitSchema = new mongoose.Schema({
  chassisId: { type: String, required: true },
  unitIndex: { type: Number, required: true },
  stateKey: { type: String, required: true },
  notes: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
}, { _id: true });

const chantierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  reference: { type: String, required: true, trim: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  projectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  dateDebut: { type: Date, default: null },
  dateCloture: { type: Date, default: null },
  status: { type: String, enum: ['planifie', 'en_cours', 'suspendu', 'cloture'], default: 'planifie' },
  notes: { type: String, default: '' },
  unitStates: [chantierUnitSchema],
  unitPhotos: [{
    chassisId: String,
    unitIndex: Number,
    url: String,
    createdAt: { type: Date, default: Date.now }
  }],
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; } } });
const Chantier = mongoose.model('Chantier', chantierSchema);

// ==================== FOUR STATUS SCHEMA ====================
const fourStatusSchema = new mongoose.Schema({
  isOn: { type: Boolean, default: false },
  changedBy: { type: String, default: '' },
  changedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});
const FourStatus = mongoose.model('FourStatus', fourStatusSchema);

// ==================== BL METADATA ====================

const blMetadataSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  deliveryDate: { type: String, required: true },
  blId: { type: String, default: '' },
  localisation: { type: String, default: '' },
  transport: { type: String, default: '' },
  unitNotes: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});
blMetadataSchema.index({ projectId: 1, deliveryDate: 1 }, { unique: true });
const BLMetadata = mongoose.model('BLMetadata', blMetadataSchema);


const fournisseurSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, default: '' },       // your code for this supplier
  contact: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  ice: { type: String, default: '' },
  rc: { type: String, default: '' },
  notes: { type: String, default: '' },
  // Payment term: due date = invoice date + delaiPaiement days (null = not set; 0 = cash / on receipt),
  // finDeMois = pushed to the end of that month ("60 jours fin de mois")
  delaiPaiement: { type: Number, default: null, min: 0, max: 365 },
  finDeMois: { type: Boolean, default: false },
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; } } });
const Fournisseur = mongoose.model('Fournisseur', fournisseurSchema);


// ==================== ORDER TRACKING (Suivi des commandes) ====================
// Stores only the editable metadata per (order, BL). The rest (date, montants,
// fournisseur, état) is computed on the fly from Order + its receptions.
const orderTrackingSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  blNumber: { type: String, default: '' }, // '' = pas encore de BL (commande envoyée, non reçue)
  factureStatus: { type: String, enum: ['non_recue', 'recue'], default: 'non_recue' },
  modePaiement: { type: String, enum: ['', 'espece', 'virement', 'cheque', 'effet'], default: '' },
  typeFacture: { type: String, enum: ['', 'bl', 'facture', 'situation'], default: '' },
  remarque: { type: String, default: '' },
  // Accounting (accountant / ACHAT)
  factureNumber: { type: String, default: '', trim: true },
  factureDate: { type: Date, default: null },
  paiementStatus: { type: String, enum: ['non_paye', 'partiel', 'paye'], default: 'non_paye' },
  paiementDate: { type: Date, default: null },
  montantPaye: { type: Number, default: 0, min: 0 },
  // Invoices / delivery notes stored in Cloudflare R2 (only the key and the metadata live here)
  documents: [{
    kind: { type: String, enum: ['facture', 'bl'], required: true },
    key: { type: String, required: true },
    name: { type: String, default: '' },
    contentType: { type: String, default: 'application/pdf' },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, default: '' },
  }],
}, {
  timestamps: true,
  toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; } }
});
orderTrackingSchema.index({ orderId: 1, blNumber: 1 }, { unique: true });
orderTrackingSchema.index({ 'documents._id': 1 });
orderTrackingSchema.index({ remarque: 1 });
const OrderTracking = mongoose.model('OrderTracking', orderTrackingSchema);


app.get('/api/projects/:projectId/bl-metadata/:deliveryDate', async (req, res) => {
  try {
    const meta = await BLMetadata.findOne({
      projectId: req.params.projectId,
      deliveryDate: req.params.deliveryDate,
    });
    if (!meta) {
      return res.json({ blId: '', localisation: '', transport: '', unitNotes: {} });
    }
    res.json(meta.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/projects/:projectId/bl-metadata/:deliveryDate', async (req, res) => {
  try {
    const { blId, localisation, transport, unitNotes } = req.body;
    const meta = await BLMetadata.findOneAndUpdate(
      {
        projectId: req.params.projectId,
        deliveryDate: req.params.deliveryDate,
      },
      {
        $set: {
          blId: blId || '',
          localisation: localisation || '',
          transport: transport || '',
          unitNotes: unitNotes || {},
        }
      },
      { upsert: true, new: true, runValidators: true }
    );
    res.json(meta.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


async function assignBcNumber(companyId) {
  if (!companyId) throw new Error('Société requise pour générer le numéro de bon de commande');
  // Atomic pipeline update: next = (next ?? start ?? 1) + 1. {new:false} returns the PRE-update doc.
  const before = await Company.findByIdAndUpdate(
    companyId,
    [{ $set: { 'bcConfig.next': { $add: [{ $ifNull: ['$bcConfig.next', { $ifNull: ['$bcConfig.start', 1] }] }, 1] } } }],
    { new: false }
  );
  if (!before) throw new Error('Société introuvable');
  const cfg = before.bcConfig || {};
  const seq = (cfg.next != null) ? cfg.next : (cfg.start != null ? cfg.start : 1);
  const padded = cfg.padding ? String(seq).padStart(cfg.padding, '0') : String(seq);
  return `${cfg.prefix || ''}${padded}${cfg.suffix || ''}`;
}

const isAdmin = (req) => (req.permissions || []).includes('admin.view');

// A sent (or beyond) order can only be mutated by an admin.
function canMutateOrder(req, order) {
  if (order.status === 'brouillon') return true;
  return isAdmin(req);
}
// Editing (PUT) a sent order: Admin, or ACHAT (orders.edit) as long as it is not cancelled.
// Cancel / delete / status change stay admin-only (canMutateOrder).
function canEditOrderContent(req, order) {
  if (order.status === 'brouillon' || isAdmin(req)) return true;
  return order.status !== 'annulee' && (req.permissions || []).includes('orders.edit');
}
const CATEGORY_RECEIVE_ROLE = {
  accessoires: 'Magasinier',
  poudre: 'Laquage',
  verre: 'Coordinateur-vitrage',
  aluminium: 'Admin',
  fer: 'Admin',
};

function receivingCategoriesForRole(roleName) {
  return Object.entries(CATEGORY_RECEIVE_ROLE)
    .filter(([, role]) => role === roleName)
    .map(([cat]) => cat);
}

// Updated: Check if user can receive ANY of the order's categories
function canReceiveOrderByCategories(req, orderCategories) {
  if (!orderCategories || orderCategories.length === 0) return true; // no categories = nobody can receive

  if (isAdmin(req)) return true;

  const userRole = req.user?.roleId?.name || '';
  const allowedCats = receivingCategoriesForRole(userRole);

  // User can receive if at least one order category matches their allowed categories
  return orderCategories.some(cat => allowedCats.includes(cat));
}

// New: Check if user can receive a SPECIFIC LINE based on its item's category
async function canReceiveOrderLine(req, order, lineItemId) {
  if (isAdmin(req)) return true;

  const userRole = req.user?.roleId?.name || '';
  const allowedCats = receivingCategoriesForRole(userRole);

  if (allowedCats.length === 0) return false;

  // Find the item and get its superCategory
  const item = await Item.findById(lineItemId).populate('categoryId');
  if (!item) return false;

  const itemSuperCat = item.superCategory || 'aluminium';
  return allowedCats.includes(itemSuperCat);
}

// Can this user at least VIEW the orders list/detail (full access or as a receiver)?
function canViewOrders(req) {
  if (isAdmin(req)) return true;
  if ((req.permissions || []).includes('orders.view')) return true;
  const userRole = req.user?.roleId?.name || '';
  return receivingCategoriesForRole(userRole).length > 0;
}

// ACHAT (orders.edit) or the accountant (orders.accounting): Suivi des commandes + Fournisseurs
const canAccounting = (req) => isAdmin(req) || (req.permissions || []).some(p => p === 'orders.edit' || p === 'orders.accounting');
function requireAccounting(req, res, next) {
  if (!canAccounting(req)) return res.status(403).json({ error: 'Accès refusé — permission requise: orders.edit ou orders.accounting' });
  next();
}

function requireOrdersView(req, res, next) {
  if (!canViewOrders(req)) {
    return res.status(403).json({ error: 'Accès refusé — permission requise: orders.view' });
  }
  next();
}

function canReceiveOrderCategory(req, category) {
  if (isAdmin(req)) return true; // l'admin peut toujours réceptionner
  const userRole = req.user?.roleId?.name || '';
  const requiredRole = CATEGORY_RECEIVE_ROLE[category];
  return !!requiredRole && requiredRole === userRole;
}

function sanitizeSupplierCodes(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(s => s && s.supplierId)
    .map(s => ({ supplierId: s.supplierId, code: (s.code || '').trim() }));
}
// ==================== STATUS COMPUTATION ====================

/* function computeProjectStatus(chassis) {
  if (!chassis || chassis.length === 0) return 'non_entame';

  const allEtats = [];

  for (const ch of chassis) {
    const units = ch.units || [];
    const qty = ch.quantity || 1;
    const numComps = (ch.components || []).length;
    const composite = numComps > 0;

    if (units.length === 0) {
      for (let i = 0; i < qty; i++) allEtats.push('non_entame');
    } else {
      for (const u of units) {
        const etat = composite
          ? deriveCompositeUnitEtat(u, numComps)
          : (u.etat || 'non_entame');
        allEtats.push(etat);
      }
    }
  }

  if (allEtats.length === 0) return 'en_cours';

  if (allEtats.every(e => e === 'non_entame')) return 'non_entame';

  if (allEtats.every(e => e === 'livre')) return 'cloture';

  if (allEtats.every(e => e === 'pret_a_livrer' || e === 'livre'))
    return 'pret_a_livrer';

  // ✅ YOUR RULE (must come before "fabrique")
  const allowed = ['non_vitre', 'fabrique', 'livre', 'pret_a_livrer'];

  if (
    allEtats.every(e => allowed.includes(e)) &&
    allEtats.some(e => e === 'non_vitre')
  ) {
    return 'non_vitre';
  }

  if (allEtats.every(e => e === 'fabrique' || e === 'livre'))
    return 'fabrique';

  if (allEtats.every(e => e === 'non_vitre'))
    return 'non_vitre';

  return 'en_cours';
}
 */

// ── shared helper: one flat array of every unit/component's état ──
function getAllUnitEtats(chassis) {
  const allEtats = [];
  for (const ch of chassis || []) {
    const units = ch.units || [];
    const qty = ch.quantity || 1;
    const numComps = (ch.components || []).length;
    const composite = numComps > 0;

    if (units.length === 0) {
      for (let i = 0; i < qty; i++) allEtats.push('non_entame');
    } else {
      for (const u of units) {
        const etat = composite
          ? deriveCompositeUnitEtat(u, numComps)
          : (u.etat || 'non_entame');
        allEtats.push(etat);
      }
    }
  }
  return allEtats;
}

function computeProjectStatus(chassis) {
  return projectStatusFromEtats(getAllUnitEtats(chassis), (chassis || []).length);
}

// Project status from every unit / composite état (shared by the cards and the dashboard)
function projectStatusFromEtats(allEtats, chassisCount = 1) {
  if (!chassisCount) return 'non_entame';

  if (allEtats.length === 0) return 'en_cours';

  if (allEtats.every(e => e === 'non_entame')) return 'non_entame';

  if (allEtats.every(e => e === 'livre')) return 'cloture';

  if (allEtats.every(e => e === 'pret_a_livrer' || e === 'livre'))
    return 'pret_a_livrer';

  const allowed = ['non_vitre', 'fabrique', 'livre', 'pret_a_livrer'];

  if (
    allEtats.every(e => allowed.includes(e)) &&
    allEtats.some(e => e === 'non_vitre')
  ) {
    return 'non_vitre';
  }

  if (allEtats.every(e => e === 'fabrique' || e === 'livre'))
    return 'fabrique';

  if (allEtats.every(e => e === 'non_vitre'))
    return 'non_vitre';

  return 'en_cours';
}

// ── NEW: cached per-project état tally used by the card's progress bar ──
function computeEtatCounts(chassis) {
  const counts = { non_entame: 0, en_cours: 0, non_vitre: 0, fabrique: 0, livre: 0, pret_a_livrer: 0 };
  for (const e of getAllUnitEtats(chassis)) counts[e] = (counts[e] || 0) + 1;
  return counts;
}



function deriveCompositeUnitEtat(unit, numComponents) {
  if (!numComponents) return unit.etat || 'non_entame';
  const states = [];
  for (let i = 0; i < numComponents; i++) {
    const cs = (unit.componentStates || []).find(c => c.compIndex === i);
    states.push(cs ? cs.etat : 'non_entame');
  }
  const allowed = ['non_vitre', 'fabrique', 'livre', 'pret_a_livrer'];

  if (
    states.every(e => allowed.includes(e)) &&
    states.some(e => e === 'non_vitre')
  ) {
    return 'non_vitre';
  }
  if (states.every(e => e === 'livre')) return 'livre';
  if (states.every(e => e === 'pret_a_livrer' || e === 'livre')) return 'pret_a_livrer';

  if (states.every(e => e === 'fabrique' || e === 'pret_a_livrer' || e === 'livre')) return 'fabrique';
  if (states.every(e => e === 'non_vitre')) return 'non_vitre';
  if (states.some(e => e !== 'non_entame')) return 'en_cours';
  return 'non_entame';
}

function syncUnits(chassis) {
  const qty = chassis.quantity || 1;
  const numComps = (chassis.components || []).length;
  const isComposite = numComps > 0;
  const existing = chassis.units || [];
  const synced = [];
  for (let i = 0; i < qty; i++) {
    const found = existing.find(u => u.unitIndex === i);
    if (found) {
      if (isComposite && (!found.componentStates || found.componentStates.length < numComps)) {
        const existingStates = found.componentStates || [];
        found.componentStates = Array.from({ length: numComps }, (_, ci) => {
          const ex = existingStates.find(cs => cs.compIndex === ci);
          return ex || { compIndex: ci, etat: 'non_entame', deliveryDate: null };
        });
        found.etat = deriveCompositeUnitEtat(found, numComps);
      }
      synced.push(found);
    } else {
      synced.push({
        unitIndex: i, etat: 'non_entame', deliveryDate: null, notes: '',
        componentStates: isComposite ? Array.from({ length: numComps }, (_, ci) => ({ compIndex: ci, etat: 'non_entame', deliveryDate: null })) : []
      });
    }
  }
  chassis.units = synced;
}

// ==================== SEED DATA ====================



// Fills searchText for items created before the field existed (or edited by a bulk update)
async function backfillItemSearchText() {
  try {
    const missing = await Item.find({ $or: [{ searchText: { $exists: false } }, { searchText: '' }] })
      .select('designation codeInterne supplierCodes.code').lean();
    if (!missing.length) return;
    for (let i = 0; i < missing.length; i += 500) {
      await Item.bulkWrite(missing.slice(i, i + 500).map(it => ({
        updateOne: { filter: { _id: it._id }, update: { $set: { searchText: buildItemSearchText(it) } } },
      })));
    }
    console.log(`✅ searchText filled for ${missing.length} item(s)`);
  } catch (e) { console.error('searchText backfill error:', e.message); }
}

async function seedSuperCategories() {
  const BUILTIN = [
    { key: 'aluminium', label: { fr: 'Aluminium', it: 'Alluminio', en: 'Aluminium' }, color: '#3b82f6', order: 0 },
    { key: 'verre', label: { fr: 'Verre', it: 'Vetro', en: 'Glass' }, color: '#06b6d4', order: 1 },
    { key: 'accessoires', label: { fr: 'Accessoires', it: 'Accessori', en: 'Accessories' }, color: '#f59e0b', order: 2 },
    { key: 'poudre', label: { fr: 'Poudre', it: 'Polvere', en: 'Powder' }, color: '#ef4444', order: 3 },
  ];
  for (const b of BUILTIN) {
    const exists = await SuperCategory.findOne({ key: b.key });
    if (!exists) {
      await SuperCategory.create(b);
      console.log(`✅ Seeded built-in super-category: ${b.key}`);
    }
  }
}

async function createDefaultAdminUser() {
  let adminRole = await Role.findOne({ name: 'Admin' });
  if (!adminRole) {
    adminRole = await Role.create({ name: 'Admin', permissions: ALL_PERMISSIONS, color: '#1a1a1a', isSystem: true });
    console.log('✅ Admin role created');
  } else {
    const missing = ALL_PERMISSIONS.filter(p => !adminRole.permissions.includes(p));
    if (missing.length > 0) {
      adminRole.permissions = ALL_PERMISSIONS;
      await adminRole.save();
      console.log('✅ Admin role synced, added:', missing.join(', '));
    }
  }
  const existing = await User.findOne({ username: 'admin' });
  if (!existing) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await User.create({ username: 'admin', displayName: 'Administrateur', passwordHash, roleId: adminRole._id, active: true });
    console.log('✅ Default user created: admin / admin123');
  }
}

async function initSampleData() {
  const compCount = await Company.countDocuments();
  if (compCount === 0) {
    await Company.insertMany([
      { name: 'CAMI', address: 'Zone Industrielle, Marrakech, Maroc', phone: '+212 5XX-XXXXXX', email: 'contact@cami.ma', color: '#f10000', logo: '/cami.png', rc: '', ice: '' },
      { name: 'GIMAV', address: 'Zone Industrielle, Marrakech, Maroc', phone: '+212 5XX-XXXXXX', email: 'contact@gimav.ma', color: '#032699', logo: '/gimav.png', rc: '', ice: '' },
    ]);
    console.log('✅ Companies seeded');
  }

  const ctCount = await ChassisType.countDocuments();
  if (ctCount === 0) {
    await ChassisType.insertMany([
      { value: 'chassis_fixe', fr: 'Châssis fixe', it: 'Telaio fisso', en: 'Fixed frame', composite: false, vantaux: 0, order: 1 },
      { value: 'fenetre_1_ouvrant', fr: 'Fenêtre 1 ouvrant', it: 'Finestra 1 anta', en: 'Window 1 sash', composite: false, vantaux: 0, order: 2 },
      { value: 'fenetre_2_ouvrants', fr: 'Fenêtre 2 ouvrants', it: 'Finestra 2 ante', en: 'Window 2 sashes', composite: false, vantaux: 0, order: 3 },
      { value: 'fenetre_oscillo_battant', fr: 'Fenêtre oscillo-battant', it: 'Finestra oscillo-battente', en: 'Tilt & turn window', composite: false, vantaux: 0, order: 4 },
      { value: 'soufflet', fr: 'Soufflet', it: 'Soffietto', en: 'Bellows', composite: false, vantaux: 0, order: 5 },
      { value: 'porte_1_ouvrant', fr: 'Porte 1 ouvrant', it: 'Porta 1 anta', en: 'Door 1 leaf', composite: false, vantaux: 0, order: 6 },
      { value: 'mur_rideau', fr: 'Mur rideau', it: 'Muro cortina', en: 'Curtain wall', composite: false, vantaux: 0, order: 7 },
      { value: 'volet_roulant', fr: 'Volet roulant', it: 'Tapparella', en: 'Rolling shutter', composite: false, vantaux: 0, order: 8 },
      { value: 'faux_cadre', fr: 'Faux cadre', it: 'Falso telaio', en: 'Sub-frame', composite: false, vantaux: 0, order: 9 },
      { value: 'minimaliste_2_vantaux', fr: 'Minimaliste 2 vantaux', it: 'Minimalista 2 ante', en: 'Minimalist 2 leaves', composite: true, vantaux: 2, order: 10 },
      { value: 'minimaliste_3_vantaux', fr: 'Minimaliste 3 vantaux', it: 'Minimalista 3 ante', en: 'Minimalist 3 leaves', composite: true, vantaux: 3, order: 11 },
      { value: 'minimaliste_4_vantaux', fr: 'Minimaliste 4 vantaux', it: 'Minimalista 4 ante', en: 'Minimalist 4 leaves', composite: true, vantaux: 4, order: 12 },
      { value: 'coulisse_2_vantaux', fr: 'Coulisse 2 vantaux', it: 'Scorrevole 2 ante', en: 'Sliding 2 leaves', composite: true, vantaux: 2, order: 13 },
      { value: 'coulisse_3_vantaux', fr: 'Coulisse 3 vantaux', it: 'Scorrevole 3 ante', en: 'Sliding 3 leaves', composite: true, vantaux: 3, order: 14 },
      { value: 'coulisse_4_vantaux', fr: 'Coulisse 4 vantaux', it: 'Scorrevole 4 ante', en: 'Sliding 4 leaves', composite: true, vantaux: 4, order: 15 },
    ]);
    console.log('✅ Chassis types seeded');
  }

  const catCount = await Category.countDocuments();
  if (catCount === 0) {
    await Category.insertMany([
      { name: { it: 'Serie 6000', fr: 'Série 6000', en: '6000 Series' }, color: '#3b82f6', order: 1, superCategory: 'aluminium' },
      { name: { it: 'Serie 7000', fr: 'Série 7000', en: '7000 Series' }, color: '#8b5cf6', order: 2, superCategory: 'aluminium' },
      { name: { it: 'Serie 5000', fr: 'Série 5000', en: '5000 Series' }, color: '#10b981', order: 3, superCategory: 'aluminium' },
      { name: { it: 'Serie 2000', fr: 'Série 2000', en: '2000 Series' }, color: '#f59e0b', order: 4, superCategory: 'aluminium' },
    ]);
  }

  const itemCount = await Item.countDocuments();
  if (itemCount === 0) {
    await Item.insertMany([
      { image: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=400', designation: { it: 'Barra Alluminio 6063 - 50x25mm', fr: 'Barre Aluminium 6063 - 50x25mm', en: 'Aluminum Bar 6063 - 50x25mm' }, quantity: 45, orderedQuantity: 10, threshold: 20, superCategory: 'aluminium' },
      { image: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=400', designation: { it: 'Barra Alluminio 7075 - 30x30mm', fr: 'Barre Aluminium 7075 - 30x30mm', en: 'Aluminum Bar 7075 - 30x30mm' }, quantity: 8, orderedQuantity: 25, threshold: 15, superCategory: 'aluminium' },
      { image: 'https://images.unsplash.com/photo-1596555544573-f7c0d5c3bbba?w=400', designation: { it: 'Barra Alluminio 5052 - 60x40mm', fr: 'Barre Aluminium 5052 - 60x40mm', en: 'Aluminum Bar 5052 - 60x40mm' }, quantity: 32, orderedQuantity: 0, threshold: 25, superCategory: 'aluminium' },
      { image: 'https://images.unsplash.com/photo-1565793298595-6a879b1d9492?w=400', designation: { it: 'Barra Alluminio 2024 - 40x20mm', fr: 'Barre Aluminium 2024 - 40x20mm', en: 'Aluminum Bar 2024 - 40x20mm' }, quantity: 12, orderedQuantity: 20, threshold: 30, superCategory: 'aluminium' },
    ]);
    console.log('✅ Sample inventory seeded');
  }

  await seedChantierStates();
}

async function seedChantierStates() {
  const count = await ChantierState.countDocuments();
  if (count === 0) {
    await ChantierState.insertMany([
      { key: 'non_pose', label: 'Non posé', color: '#9ca3af', order: 1, isDefault: true },
      { key: 'en_cours_de_pose', label: 'En cours de pose', color: '#f59e0b', order: 2 },
      { key: 'pose', label: 'Posé', color: '#22c55e', order: 3 },
      { key: 'retourne_atelier', label: "Retourné à l'atelier", color: '#ef4444', order: 4 },
      { key: 'pose_partiel', label: 'Posé partiellement', color: '#a855f7', order: 5 },
    ]);
    console.log('✅ Default chantier states seeded');
  }
}

mongoose.connection.once('open', async () => {
  console.log('Connected to MongoDB');
  await createDefaultAdminUser();
});

// ==================== HELPERS ====================

async function populateAndReturn(project) {
  await project.populate('usedBars.itemId');
  await project.populate('companyId');
  await project.populate('clientId');
  return project.toJSON();
}

// ==================== HEALTH ====================
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime(), mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

// ==================== MIGRATION ====================
async function migrateExistingData() {
  try {
    const itemResult = await Item.updateMany(
      { $or: [{ superCategory: { $exists: false } }, { superCategory: null }, { superCategory: '' }] },
      { $set: { superCategory: 'aluminium' } }
    );
    const catResult = await Category.updateMany(
      { $or: [{ superCategory: { $exists: false } }, { superCategory: null }, { superCategory: '' }] },
      { $set: { superCategory: 'aluminium' } }
    );
    if (itemResult.modifiedCount > 0 || catResult.modifiedCount > 0) {
      console.log(`✅ Migration: ${itemResult.modifiedCount} items + ${catResult.modifiedCount} categories → superCategory='aluminium'`);
    }
  } catch (e) { console.error('Migration error:', e.message); }
}

app.post('/api/migrate/super-categories', async (req, res) => {
  try {
    const itemResult = await Item.updateMany(
      { $or: [{ superCategory: { $exists: false } }, { superCategory: null }, { superCategory: '' }] },
      { $set: { superCategory: 'aluminium' } }
    );
    const catResult = await Category.updateMany(
      { $or: [{ superCategory: { $exists: false } }, { superCategory: null }, { superCategory: '' }] },
      { $set: { superCategory: 'aluminium' } }
    );
    res.json({ success: true, itemsMigrated: itemResult.modifiedCount, categoriesMigrated: catResult.modifiedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== COMPANY ROUTES ====================
app.get('/api/companies', async (req, res) => {
  try { res.json(await Company.find().sort({ createdAt: 1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/companies', async (req, res) => {
  try { const c = new Company(req.body); await c.save(); res.status(201).json(c); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/companies/:id', async (req, res) => {
  try {
    const c = await Company.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/companies/:id', async (req, res) => {
  try {
    const c = await Company.findByIdAndDelete(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== FOUR STATUS ROUTES ====================

// GET — anyone authenticated can read the status
app.get('/api/four-status', requireAuth, async (req, res) => {
  try {
    let doc = await FourStatus.findOne({});
    if (!doc) {
      doc = await FourStatus.create({ isOn: false });
    }
    res.json(doc.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT — only Laquage role (or Admin) can toggle
app.put('/api/four-status', requireAuth, async (req, res) => {
  try {
    const userRole = req.user?.roleId?.name || '';
    const isAdmin = userRole === 'Admin';
    const canToggle = isAdmin || userRole === 'Laquage';

    if (!canToggle) {
      return res.status(403).json({
        error: 'Seul le rôle Laquage peut modifier l\'état du four.'
      });
    }

    const { isOn } = req.body;
    const displayName = req.user?.displayName || req.user?.username || userRole;

    let doc = await FourStatus.findOne({});
    if (!doc) {
      doc = await FourStatus.create({ isOn: !!isOn, changedBy: displayName, changedAt: new Date() });
    } else {
      doc.isOn = !!isOn;
      doc.changedBy = displayName;
      doc.changedAt = new Date();
      await doc.save();
    }

    res.json(doc.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});// ==================== FOUR STATUS ROUTES ====================

// GET — anyone authenticated can read the status
app.get('/api/four-status', requireAuth, async (req, res) => {
  try {
    let doc = await FourStatus.findOne({});
    if (!doc) {
      doc = await FourStatus.create({ isOn: false });
    }
    res.json(doc.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT — only Laquage role (or Admin) can toggle
app.put('/api/four-status', requireAuth, async (req, res) => {
  try {
    const userRole = req.user?.roleId?.name || '';
    const isAdmin = userRole === 'Admin';
    const canToggle = isAdmin || userRole === 'Laquage';

    if (!canToggle) {
      return res.status(403).json({
        error: 'Seul le rôle Laquage peut modifier l\'état du four.'
      });
    }

    const { isOn } = req.body;
    const displayName = req.user?.displayName || req.user?.username || userRole;

    let doc = await FourStatus.findOne({});
    if (!doc) {
      doc = await FourStatus.create({ isOn: !!isOn, changedBy: displayName, changedAt: new Date() });
    } else {
      doc.isOn = !!isOn;
      doc.changedBy = displayName;
      doc.changedAt = new Date();
      await doc.save();
    }

    res.json(doc.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== AUTH MIDDLEWARE ====================

// Short in-memory cache of authenticated sessions: avoids 3 round trips to Atlas on EVERY request.
// Cleared on logout and whenever users / roles change.
const AUTH_CACHE_MS = 30 * 1000;
const authCache = new Map(); // token -> { user, permissions, until, expiresAt }
function clearAuthCache() { authCache.clear(); }

async function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const now = Date.now();
    const cached = authCache.get(token);
    if (cached && cached.until > now && cached.expiresAt > now) {
      req.user = cached.user;
      req.permissions = cached.permissions;
      return next();
    }
    const session = await Session.findOne({ token, expiresAt: { $gt: new Date() } }).lean();
    if (!session) { authCache.delete(token); return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' }); }
    const user = await User.findById(session.userId).populate('roleId');
    if (!user || !user.active) { authCache.delete(token); return res.status(401).json({ error: 'Compte désactivé' }); }
    req.user = user;
    req.permissions = user.roleId?.permissions || [];
    if (authCache.size > 1000) authCache.clear();
    authCache.set(token, { user, permissions: req.permissions, until: now + AUTH_CACHE_MS, expiresAt: new Date(session.expiresAt).getTime() });
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.permissions.includes(perm)) return res.status(403).json({ error: `Accès refusé — permission requise: ${perm}` });
    next();
  };
}

async function resolveAllowedSCs(permissions) {
  if (!permissions || permissions.length === 0) return [];
  const BUILTIN = ["aluminium", "verre", "accessoires", "poudre"];
  let ALL_SC = [...BUILTIN];
  try {
    const dbSCs = await SuperCategory.find().lean();
    ALL_SC = [...new Set([...BUILTIN, ...dbSCs.map(s => s.key)])];
  } catch { }
  if (permissions.includes("admin.view")) return null;
  const scPerms = ALL_SC.filter(sc => permissions.includes(`inventory.${sc}.view`));
  if (scPerms.length > 0) return scPerms;
  if (permissions.includes("inventory.view")) return null;
  return [];
}

function canEditSC(permissions, sc) {
  if (!permissions || permissions.length === 0) return false;
  if (permissions.includes(`inventory.${sc}.edit`)) return true;
  const BUILTIN = ["aluminium", "verre", "accessoires", "poudre"];
  const hasAnySCEdit = BUILTIN.some(s => permissions.includes(`inventory.${s}.edit`));
  if (hasAnySCEdit) return false;
  return permissions.includes("inventory.edit");
}

// −/+ stock adjustment: full edit right, or the "adjust only" permission for a category the account can see
function canAdjustQty(req, sc) {
  if (canEditSC(req.permissions, sc)) return true;
  if (!(req.permissions || []).includes('inventory.quantity')) return false;
  const allowed = req.allowedSuperCategories;
  return allowed === null || allowed === undefined || allowed.includes(sc);
}

function canDeleteSC(permissions, sc) {
  if (!permissions || permissions.length === 0) return false;
  if (permissions.includes(`inventory.${sc}.delete`)) return true;
  const BUILTIN = ["aluminium", "verre", "accessoires", "poudre"];
  const hasAnySCDelete = BUILTIN.some(s => permissions.includes(`inventory.${s}.delete`));
  if (hasAnySCDelete) return false;
  return permissions.includes("inventory.delete");
}

async function optionalAuth(req, res, next) {
  const token = req.headers["x-auth-token"] || req.headers["authorization"]?.replace("Bearer ", "");
  if (!token) { req.permissions = []; req.allowedSuperCategories = null; return next(); }
  try {
    const now = Date.now();
    const cached = authCache.get(token);
    if (cached && cached.until > now && cached.expiresAt > now && cached.allowedSuperCategories !== undefined) {
      req.user = cached.user;
      req.permissions = cached.permissions;
      req.allowedSuperCategories = cached.allowedSuperCategories;
      return next();
    }
    const session = await Session.findOne({ token, expiresAt: { $gt: new Date() } }).lean();
    if (!session) { req.permissions = []; req.allowedSuperCategories = null; return next(); }
    const user = await User.findById(session.userId).populate("roleId");
    req.user = user;
    req.permissions = user?.roleId?.permissions || [];
    req.allowedSuperCategories = await resolveAllowedSCs(req.permissions);
    if (user && user.active) {
      if (authCache.size > 1000) authCache.clear();
      authCache.set(token, {
        user, permissions: req.permissions, allowedSuperCategories: req.allowedSuperCategories,
        until: now + AUTH_CACHE_MS, expiresAt: new Date(session.expiresAt).getTime(),
      });
    }
    next();
  } catch (e) { req.permissions = []; req.allowedSuperCategories = null; next(); }
}

// ==================== AUTH ROUTES ====================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username et mot de passe requis' });
    const user = await User.findOne({ username: username.toLowerCase().trim() }).populate('roleId');
    if (!user || !user.active) return res.status(401).json({ error: 'Identifiants incorrects' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });
    const token = crypto.randomBytes(48).toString('hex');
    await Session.create({ token, userId: user._id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
    res.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.roleId?.name, permissions: user.roleId?.permissions || [], companyId: user.companyId, restrictedItems: (user.allowedItemIds || []).length } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', async (req, res) => {
  const token = req.headers['x-auth-token'] || req.headers['authorization']?.replace('Bearer ', '');
  if (token) { await Session.deleteOne({ token }); authCache.delete(token); }
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, displayName: req.user.displayName, role: req.user.roleId?.name, permissions: req.permissions, companyId: req.user.companyId, restrictedItems: (req.user.allowedItemIds || []).length });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  clearAuthCache();
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Nouveau mot de passe trop court (min 4 caractères)' });
    const user = await User.findById(req.user._id);
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ROLE ROUTES ====================

app.get('/api/roles', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try { res.json(await Role.find().sort({ createdAt: 1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/roles', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const r = await Role.create({ name: req.body.name, permissions: req.body.permissions || [], color: req.body.color || '#3b82f6' });
    res.status(201).json(r);
  } catch (e) { res.status(e.code === 11000 ? 409 : 400).json({ error: e.message }); }
});
app.put('/api/roles/:id', requireAuth, requirePermission('admin.view'), async (req, res) => {
  clearAuthCache();
  try {
    const r = await Role.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    r.name = req.body.name || r.name;
    r.permissions = req.body.permissions ?? r.permissions;
    r.color = req.body.color || r.color;
    await r.save(); res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/roles/:id', requireAuth, requirePermission('admin.view'), async (req, res) => {
  clearAuthCache();
  try {
    const r = await Role.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.isSystem) return res.status(400).json({ error: 'Impossible de supprimer le rôle Admin système' });
    const usersWithRole = await User.countDocuments({ roleId: req.params.id });
    if (usersWithRole > 0) return res.status(400).json({ error: `${usersWithRole} utilisateur(s) ont ce rôle.` });
    await Role.findByIdAndDelete(req.params.id); res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== USER ROUTES ====================

const cleanItemIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(id => String(id?.id || id?._id || id)).filter(id => mongoose.Types.ObjectId.isValid(id)))];
app.get('/api/users', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try { res.json(await User.find().populate('roleId').populate('companyId').populate('allowedItemIds', 'designation codeInterne image superCategory').sort({ createdAt: -1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/users', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const { username, displayName, password, roleId, companyId, active, allowedItemIds } = req.body;
    if (!username || !password || !roleId) return res.status(400).json({ error: 'username, password et roleId requis' });
    if (password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court' });
    const hash = await bcrypt.hash(password, 10);
    const u = await User.create({ username: username.toLowerCase().trim(), displayName, passwordHash: hash, roleId, companyId: companyId || null, active: active !== false, allowedItemIds: cleanItemIds(allowedItemIds) });
    await u.populate('roleId'); await u.populate('companyId'); await u.populate('allowedItemIds', 'designation codeInterne image superCategory');
    res.status(201).json(u);
  } catch (e) { res.status(e.code === 11000 ? 409 : 400).json({ error: e.message }); }
});
app.put('/api/users/:id', requireAuth, requirePermission('admin.view'), async (req, res) => {
  clearAuthCache();
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    if (req.body.displayName) u.displayName = req.body.displayName;
    if (req.body.roleId) u.roleId = req.body.roleId;
    if (req.body.companyId !== undefined) u.companyId = req.body.companyId || null;
    if (req.body.active !== undefined) u.active = req.body.active;
    if (req.body.allowedItemIds !== undefined) u.allowedItemIds = cleanItemIds(req.body.allowedItemIds);
    if (req.body.password && req.body.password.length >= 4) u.passwordHash = await bcrypt.hash(req.body.password, 10);
    await u.save(); await u.populate('roleId'); await u.populate('companyId'); await u.populate('allowedItemIds', 'designation codeInterne image superCategory');
    res.json(u);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/users/:id', requireAuth, requirePermission('admin.view'), async (req, res) => {
  clearAuthCache();
  try {
    if (req.user.id === req.params.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    await User.findByIdAndDelete(req.params.id);
    await Session.deleteMany({ userId: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/permissions', requireAuth, requirePermission('admin.view'), async (req, res) => {
  const superCats = await SuperCategory.find().sort({ order: 1 }).lean();
  const allSuperCats = superCats.length ? superCats : [
    { key: 'aluminium', label: { fr: 'Aluminium' } }, { key: 'verre', label: { fr: 'Verre' } },
    { key: 'accessoires', label: { fr: 'Accessoires' } }, { key: 'poudre', label: { fr: 'Poudre' } },
  ];
  const scPerms = [];
  for (const sc of allSuperCats) {
    const name = sc.label?.fr || sc.key;
    scPerms.push(
      { key: `inventory.${sc.key}.view`, label: `${name} — Voir`, group: `Inventaire › ${name}` },
      { key: `inventory.${sc.key}.edit`, label: `${name} — Ajouter/Modifier`, group: `Inventaire › ${name}` },
      { key: `inventory.${sc.key}.delete`, label: `${name} — Supprimer`, group: `Inventaire › ${name}` },
    );
  }
  res.json([
    { key: 'inventory.view', label: 'Inventaire — Voir (tout)', group: 'Inventaire' },
    { key: 'inventory.edit', label: 'Inventaire — Modifier (tout)', group: 'Inventaire' },
    { key: 'inventory.delete', label: 'Inventaire — Supprimer (tout)', group: 'Inventaire' },
    { key: 'inventory.quantity', label: 'Inventaire — Ajuster le stock (− / +) uniquement', group: 'Inventaire' },
    ...scPerms,
    { key: 'orders.view', label: 'Commandes — Voir', group: 'Commandes' },
    { key: 'orders.edit', label: 'Commandes — Créer/Modifier', group: 'Commandes' },
    { key: 'orders.receive', label: 'Commandes — Réceptionner', group: 'Commandes' },
    { key: 'orders.delete', label: 'Commandes — Supprimer', group: 'Commandes' },
    { key: 'orders.accounting', label: 'Commandes — Comptabilité (factures, paiements, délais fournisseurs)', group: 'Commandes' },
    { key: 'projects.view', label: 'Projets — Voir', group: 'Projets' },
    { key: 'projects.edit', label: 'Projets — Créer/Modifier', group: 'Projets' },
    { key: 'projects.delete', label: 'Projets — Supprimer', group: 'Projets' },
    { key: 'clients.view', label: 'Clients — Voir', group: 'Clients' },
    { key: 'clients.edit', label: 'Clients — Ajouter/Modifier', group: 'Clients' },
    { key: 'clients.delete', label: 'Clients — Supprimer', group: 'Clients' },
    { key: 'devis.view', label: 'Devis — Voir', group: 'Devis' },
    { key: 'devis.edit', label: 'Devis — Créer/Modifier', group: 'Devis' },
    { key: 'devis.delete', label: 'Devis — Supprimer', group: 'Devis' },
    { key: 'devis.prices', label: 'Devis — Voir les prix', group: 'Devis' },
    { key: 'movements.view', label: 'Mouvements — Voir', group: 'Mouvements' },
    { key: 'analytics.view', label: 'Analytics — Voir', group: 'Analytics' },
    { key: 'admin.view', label: 'Administration — Accès total', group: 'Administration' },
    { key: 'chantiers.view', label: 'Chantiers — Voir', group: 'Chantiers' },
    { key: 'chantiers.edit', label: 'Chantiers — Créer/Modifier', group: 'Chantiers' },
    { key: 'chantiers.delete', label: 'Chantiers — Supprimer', group: 'Chantiers' },
  ]);
});

// ==================== CATEGORY ROUTES ====================
app.get('/api/categories', async (req, res) => {
  try {
    const filter = {};
    if (req.query.superCategory) filter.superCategory = req.query.superCategory;
    res.json(await Category.find(filter).sort({ order: 1, createdAt: 1 }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/categories', async (req, res) => {
  try {
    const c = new Category({ name: req.body.name, color: req.body.color || '#3b82f6', order: req.body.order || 0, superCategory: req.body.superCategory || 'aluminium' });
    await c.save(); res.status(201).json(c);
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});
app.put('/api/categories/:id', async (req, res) => {
  try {
    const c = await Category.findByIdAndUpdate(req.params.id, { name: req.body.name, color: req.body.color, order: req.body.order, superCategory: req.body.superCategory }, { new: true, runValidators: true });
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
// ── helper: keep only valid {supplierId, code} pairs ──
function sanitizeSupplierCodes(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(s => s && s.supplierId)
    .map(s => ({ supplierId: s.supplierId, code: (s.code || '').trim() }));
}

function applyScFilter(filter, allowedSC) {
  if (allowedSC === null) return true;
  if (allowedSC.length === 0) return false;
  const requested = filter.superCategory;
  if (requested && typeof requested === 'string') {
    if (allowedSC.includes(requested)) return true;
    filter.superCategory = { $in: allowedSC };
    return true;
  }
  filter.superCategory = { $in: allowedSC };
  return true;
}

app.get('/api/inventory/allowed-supercategories', optionalAuth, (req, res) => {
  res.json({ allowedSuperCategories: req.allowedSuperCategories });
});
// GET /api/inventory
//  - without ?page → full array (used by Commandes, Chantiers, Ateliers…)
//  - with ?page=1&limit=40 → { items, total, page, limit, hasMore }: the Inventory page loads
//    only what is on screen. Search (?q=) and filters (?stock=critical|warning|ordered) run in MongoDB.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Accent-insensitive regex for an already normalized (accent-free) word: "fenetre" matches "Fenêtre"
const ACCENT_CLASSES = { a: '[aàáâãäå]', c: '[cç]', e: '[eèéêë]', i: '[iìíîï]', n: '[nñ]', o: '[oòóôõö]', u: '[uùúûü]', y: '[yýÿ]' };
const accentRegex = (w) => new RegExp(escapeRegex(w).replace(/[aceinouy]/g, ch => ACCENT_CLASSES[ch]), 'i');
// Every word must appear in the item's searchText (one indexed field instead of 5 regexes)
const searchWordsFilter = (q) => normalizeSearch(q).split(' ').filter(Boolean).slice(0, 8)
  .map(w => ({ searchText: { $regex: escapeRegex(w) } }));

// GET /api/inventory/lookup?q=&superCategory=&categoryId=&limit=20
// Lightweight search for pickers (order form lines…): only the fields a picker shows, max 50 rows.
app.get('/api/inventory/lookup', optionalAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.superCategory && req.query.superCategory !== 'all') filter.superCategory = req.query.superCategory;
    if (req.query.categoryId && req.query.categoryId !== 'all' && mongoose.Types.ObjectId.isValid(req.query.categoryId)) filter.categoryId = req.query.categoryId;
    if (!applyScFilter(filter, req.allowedSuperCategories)) return res.json({ items: [], hasMore: false });
    applyItemRestriction(filter, req);
    const and = searchWordsFilter(req.query.q);
    if (and.length) filter.$and = and;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const rows = await Item.find(filter)
      .select('designation codeInterne image superCategory categoryId quantity threshold orderedQuantity supplierCodes.code')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate('categoryId', 'name color')
      .lean();
    const items = rows.slice(0, limit).map(it => ({
      ...it, id: String(it._id), _id: undefined,
      categoryId: it.categoryId ? { ...it.categoryId, id: String(it.categoryId._id) } : null,
    }));
    res.json({ items, hasMore: rows.length > limit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inventory', optionalAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.categoryId && req.query.categoryId !== 'all') filter.categoryId = req.query.categoryId;
    if (req.query.superCategory && req.query.superCategory !== 'all') filter.superCategory = req.query.superCategory;
    const paged = req.query.page !== undefined;
    if (!applyScFilter(filter, req.allowedSuperCategories)) return res.json(paged ? { items: [], total: 0, page: 1, hasMore: false } : []);
    applyItemRestriction(filter, req);

    if (!paged) return res.json(await Item.find(filter).populate('categoryId').sort({ createdAt: -1 }));

    // Every word must appear in the designation, the internal code or a supplier code
    const and = searchWordsFilter(req.query.q);
    // Stock filters, same rules as the badges on the cards
    const total = { $add: ['$quantity', { $ifNull: ['$orderedQuantity', 0] }] };
    if (req.query.stock === 'critical') and.push({ $expr: { $lt: [total, '$threshold'] } });
    else if (req.query.stock === 'warning') and.push({ $expr: { $and: [{ $lt: ['$quantity', '$threshold'] }, { $gte: [total, '$threshold'] }] } });
    else if (req.query.stock === 'ordered') and.push({ orderedQuantity: { $nin: [0, null] } });
    if (and.length) filter.$and = and;

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const [items, count] = await Promise.all([
      Item.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('categoryId', 'name color')
        .lean(),
      Item.countDocuments(filter),
    ]);
    for (const it of items) {
      it.id = String(it._id);
      delete it.__v;
      if (it.categoryId?._id) it.categoryId.id = String(it.categoryId._id);
    }
    res.json({ items, total: count, page, limit, hasMore: page * limit < count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/inventory/filter/low-stock', optionalAuth, async (req, res) => {
  try {
    const filter = {};
    if (!applyScFilter(filter, req.allowedSuperCategories)) return res.json([]);
    applyItemRestriction(filter, req);
    const items = await Item.find(filter).populate('categoryId');
    res.json(items.filter(i => i.quantity + (i.orderedQuantity || 0) < i.threshold));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/inventory/search', optionalAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.categoryId && req.query.categoryId !== 'all') filter.categoryId = req.query.categoryId;
    if (req.query.superCategory && req.query.superCategory !== 'all') filter.superCategory = req.query.superCategory;
    if (!applyScFilter(filter, req.allowedSuperCategories)) return res.json([]);
    applyItemRestriction(filter, req);
    const and = searchWordsFilter(req.query.q);
    if (and.length) filter.$and = and;
    res.json(await Item.find(filter).populate('categoryId').sort({ createdAt: -1 }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// GET /api/inventory/order-badges?ids=a,b,c (max 200) — badges of the article cards:
//   draftQty    = quantity of the article in DRAFT purchase orders (only ACHAT / Admin see drafts)
//   pendingReqs = admin requests not yet marked "commandé"
app.get('/api/inventory/order-badges', requireAuth, async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').filter(id => mongoose.Types.ObjectId.isValid(id)).slice(0, 200)
      .map(id => new mongoose.Types.ObjectId(id));
    if (!ids.length) return res.json({});
    const seesDrafts = isAdmin(req) || (req.permissions || []).includes('orders.edit');
    // Few drafts / pending requests at a time → plain indexed finds, summed here
    const [drafts, requests] = await Promise.all([
      seesDrafts
        ? Order.find({ status: 'brouillon', 'lines.itemId': { $in: ids } }).select('lines.itemId lines.quantityOrdered').lean()
        : [],
      PurchaseRequest.find({ status: 'pending', itemId: { $in: ids } }).select('itemId quantity').lean(),
    ]);
    const wanted = new Set(ids.map(String));
    const out = {};
    const row = (id) => (out[id] ||= { draftQty: 0, draftOrders: 0, pendingReqs: 0, pendingReqQty: 0 });
    drafts.forEach(o => {
      const seen = new Set();
      (o.lines || []).forEach(l => {
        const id = String(l.itemId);
        if (!wanted.has(id)) return;
        const r = row(id);
        r.draftQty += l.quantityOrdered || 0;
        if (!seen.has(id)) { seen.add(id); r.draftOrders += 1; }
      });
    });
    requests.forEach(pr => { const r = row(String(pr.itemId)); r.pendingReqs += 1; r.pendingReqQty += pr.quantity || 0; });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inventory/:id', optionalAuth, async (req, res, next) => {
  // Not an id (e.g. /api/inventory/poudres) → let the later named route handle it
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return next();
  try {
    const item = await Item.findById(req.params.id).populate('categoryId');
    if (!item) return res.status(404).json({ error: 'Not found' });
    const sc = item.superCategory || 'aluminium';
    const allowed = req.allowedSuperCategories;
    if (allowed !== null && !allowed.includes(sc)) return res.status(403).json({ error: 'Accès refusé à cette catégorie' });
    if (!isItemAllowed(req, item._id)) return res.status(403).json({ error: 'Accès refusé à cet article' });
    res.json(item);
  } catch (e) { res.status(e.kind === 'ObjectId' ? 400 : 500).json({ error: e.message }); }
});
app.post('/api/inventory', optionalAuth, async (req, res) => {
  try {
    const sc = req.body.superCategory || 'aluminium';
    if (!canEditSC(req.permissions, sc)) return res.status(403).json({ error: `Accès refusé — permission requise: inventory.${sc}.edit` });
    const item = new Item({
      image: req.body.image || '',
      designation: req.body.designation,
      quantity: Number(req.body.quantity) || 0,
      // orderedQuantity starts at 0: it is derived from sent orders (recomputeOrderedQuantity)
      threshold: Number(req.body.threshold) || 0,
      categoryId: req.body.categoryId || null,
      superCategory: sc,
      codeInterne: req.body.codeInterne || '',
      supplierCodes: sanitizeSupplierCodes(req.body.supplierCodes),
    });
    await item.save();
    if (item.quantity > 0) await StockMovement.create({ itemId: item._id, type: 'initial', quantity: item.quantity, balanceAfter: item.quantity, note: 'Stock initial' });
    await item.populate('categoryId');
    res.status(201).json(item);
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});
app.put('/api/inventory/:id', optionalAuth, async (req, res) => {
  try {
    const sc = req.body.superCategory || 'aluminium';
    if (!canEditSC(req.permissions, sc)) return res.status(403).json({ error: `Accès refusé — permission requise: inventory.${sc}.edit` });
    const before = await Item.findById(req.params.id).select('quantity').lean();
    const item = await Item.findByIdAndUpdate(req.params.id, {
      image: req.body.image,
      designation: req.body.designation,
      quantity: Number(req.body.quantity) || 0,
      // orderedQuantity is NOT taken from the form: it is derived from sent orders (recomputeOrderedQuantity)
      threshold: Number(req.body.threshold) || 0,
      categoryId: req.body.categoryId || null,
      superCategory: sc,
      codeInterne: req.body.codeInterne || '',
      supplierCodes: sanitizeSupplierCodes(req.body.supplierCodes),
      searchText: buildItemSearchText({ designation: req.body.designation, codeInterne: req.body.codeInterne, supplierCodes: req.body.supplierCodes }),
    }, { new: true, runValidators: true }).populate('categoryId');
    if (!item) return res.status(404).json({ error: 'Not found' });
    const diff = Math.round(((item.quantity || 0) - (before?.quantity || 0)) * 1000) / 1000;
    if (before && diff !== 0) {
      await StockMovement.create({ itemId: item._id, type: diff > 0 ? 'correction_plus' : 'correction_moins', quantity: Math.abs(diff), balanceAfter: item.quantity, note: 'Correction via la fiche article' });
    }
    res.json(item);
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});
app.patch('/api/inventory/:id/quantity', optionalAuth, async (req, res) => {
  try {
    const { amount, note } = req.body;
    if (typeof amount !== 'number') return res.status(400).json({ error: 'Amount must be a number' });
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    const sc = item.superCategory || 'aluminium';
    if (!canAdjustQty(req, sc)) return res.status(403).json({ error: `Accès refusé — permission requise: inventory.${sc}.edit` });
    if (!isItemAllowed(req, item._id)) return res.status(403).json({ error: 'Accès refusé à cet article' });
    const previous = item.quantity;
    item.quantity = Math.max(0, item.quantity + amount);
    await item.save();
    // the quantity really applied (stock never goes below 0), so the history stays exact
    const applied = Math.round((item.quantity - previous) * 1000) / 1000;
    if (applied !== 0) await StockMovement.create({ itemId: item._id, type: applied > 0 ? 'entree' : 'sortie', quantity: Math.abs(applied), balanceAfter: item.quantity, note: note || '' });
    await item.populate('categoryId');
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/inventory/:id', optionalAuth, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    const sc = item.superCategory || 'aluminium';
    if (!canDeleteSC(req.permissions, sc)) return res.status(403).json({ error: `Accès refusé — permission requise: inventory.${sc}.delete` });
    await Item.findByIdAndDelete(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ==================== ORDER ROUTES ====================

// Purchase prices are only for Admin, ACHAT (orders.edit) and the accountant (orders.accounting):
// for everyone else, every `unitPrice` is removed from the order responses (list, detail,
// receptions, article → orders). Checked when the response is sent, i.e. after requireAuth.
const stripUnitPrices = (v) => {
  if (Array.isArray(v)) { v.forEach(stripUnitPrices); return v; }
  if (v && typeof v === 'object') { delete v.unitPrice; Object.values(v).forEach(stripUnitPrices); }
  return v;
};
app.use(['/api/orders', '/api/inventory/:id/orders'], (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (!req.user || canAccounting(req) || body == null || typeof body !== 'object') return json(body);
    // Copy first: the list may come from ordersListCache, shared with other users
    return json(stripUnitPrices(JSON.parse(JSON.stringify(body))));
  };
  next();
});

const populateOrder = (q) => q
  .populate({ path: 'lines.itemId', populate: { path: 'categoryId' } })
  .populate('companyId').populate('supplierId');

// Fast version for the orders LIST: plain objects (lean) + only the article fields the page uses.
// Adds the `id` fields the frontend expects (toJSON is not applied on lean documents).
const ORDER_LIST_ITEM_FIELDS = 'designation image codeInterne supplierCodes categoryId superCategory';
const withId = (d) => (d && typeof d === 'object' && d._id ? Object.assign(d, { id: String(d._id) }) : d);
// Changes whenever an order / article / company / supplier is created, edited or deleted
async function ordersListVersion() {
  const last = (M) => M.findOne({}, 'updatedAt').sort({ updatedAt: -1 }).lean().then(d => d?.updatedAt?.getTime() || 0);
  const [o, i, c, f, nO, nI] = await Promise.all([
    last(Order), last(Item), last(Company), last(Fournisseur),
    Order.estimatedDocumentCount(), Item.estimatedDocumentCount(),
  ]);
  return `${o}-${i}-${c}-${f}-${nO}-${nI}`;
}

async function findOrdersForList(filter) {
  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .populate({ path: 'lines.itemId', select: ORDER_LIST_ITEM_FIELDS, populate: { path: 'categoryId', select: 'name color' } })
    .populate('companyId')
    .populate('supplierId')
    .lean();
  for (const o of orders) {
    withId(o);
    delete o.__v;
    withId(o.companyId);
    withId(o.supplierId);
    for (const l of o.lines || []) {
      withId(l.itemId);
      if (l.itemId) withId(l.itemId.categoryId);
    }
  }
  return orders;
}

// Item.orderedQuantity = sum of (quantityOrdered - quantityReceived) over every
// SENT order (envoye / partielle), closed lines excluded. Recomputed from the orders themselves instead of
// $inc counters, so it can never drift (e.g. after an inventory edit overwrote it).
const PENDING_ORDER_STATUSES = ['envoye', 'partielle'];
async function recomputeOrderedQuantity(itemIds) {
  const ids = [...new Set((itemIds || []).filter(Boolean).map(id => String(id._id || id)))]
    .map(id => new mongoose.Types.ObjectId(id));
  if (!ids.length) return;
  const rows = await Order.aggregate([
    { $match: { status: { $in: PENDING_ORDER_STATUSES }, 'lines.itemId': { $in: ids } } },
    { $unwind: '$lines' },
    { $match: { 'lines.itemId': { $in: ids }, 'lines.closed': { $ne: true } } },
    { $group: {
      _id: '$lines.itemId',
      pending: { $sum: { $max: [0, { $subtract: ['$lines.quantityOrdered', { $ifNull: ['$lines.quantityReceived', 0] }] }] } },
    } },
  ]);
  const pendingById = new Map(rows.map(r => [String(r._id), r.pending]));
  await Item.bulkWrite(ids.map(id => ({
    updateOne: { filter: { _id: id }, update: { $set: { orderedQuantity: pendingById.get(String(id)) || 0 } } },
  })));
}
// Every order line must point to an existing inventory article
async function assertOrderItemsExist(lines) {
  const ids = [...new Set((lines || []).map(l => String(l.itemId?._id || l.itemId?.id || l.itemId || '')))];
  if (ids.some(id => !mongoose.Types.ObjectId.isValid(id))) {
    const err = new Error('Chaque ligne doit avoir un article sélectionné.');
    err.status = 400;
    throw err;
  }
  const found = await Item.countDocuments({ _id: { $in: ids } });
  if (found !== ids.length) {
    const err = new Error('Un article sélectionné n\'existe plus dans l\'inventaire. Rechargez la page et re-sélectionnez-le.');
    err.status = 400;
    throw err;
  }
}

// A line is done when fully received or closed; derive the order status from its lines
const isOrderLineDone = (l) => l.closed || (l.quantityReceived || 0) >= l.quantityOrdered;
function refreshOrderStatus(o) {
  if (o.status === 'brouillon' || o.status === 'annulee') return;
  if (o.lines.every(isOrderLineDone)) o.status = 'recue';
  else if (o.lines.some(l => (l.quantityReceived || 0) > 0 || l.closed)) o.status = 'partielle';
  else o.status = 'envoye';
}

async function resyncAllOrderedQuantities() {
  try {
    const items = await Item.find({}, '_id').lean();
    await recomputeOrderedQuantity(items.map(i => i._id));
    console.log(`✅ orderedQuantity resynced for ${items.length} items`);
  } catch (e) { console.error('orderedQuantity resync error:', e.message); }
}

// GET all — full access sees everything; receiving-only roles see just their
// category, and only sent orders (drafts stay hidden from them).
app.get('/api/orders', requireAuth, requireOrdersView, async (req, res) => {
  try {
    const filter = {};

    if (!isAdmin(req) && !(req.permissions || []).includes('orders.view')) {
      const userRole = req.user?.roleId?.name || '';
      const allowedCats = receivingCategoriesForRole(userRole);
      if (allowedCats.length === 0) return res.json([]);
      filter.categories = { $in: allowedCats };
      filter.status = { $ne: 'brouillon' };
    } else {
      // Only ACHAT (orders.edit) and Admin see drafts
      const hasOrdersEdit = (req.permissions || []).includes('orders.edit');
      if (!hasOrdersEdit && !isAdmin(req)) filter.status = { $ne: 'brouillon' };
    }

    // Cached list (cleared by any write) — Atlas free tier is slow, the list rarely changes
    const key = JSON.stringify(filter);
    const version = await ordersListVersion();
    const hit = ordersListCache.get(key);
    if (hit && hit.version === version && Date.now() - hit.at < ORDERS_CACHE_MS) {
      res.set('X-Cache', 'HIT');
      return res.json(hit.data);
    }
    const data = await findOrdersForList(filter);
    ordersListCache.set(key, { at: Date.now(), version, data });
    res.set('X-Cache', 'MISS');
    res.json(data);
  } catch (e) {
    console.error('❌ GET /api/orders:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Orders containing an article (inventory → "Bons de commande" button). Same visibility rules as
// the orders list: receiving-only roles see their categories and no drafts.
app.get('/api/inventory/:id/orders', requireAuth, requireOrdersView, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Article invalide' });
    const itemId = new mongoose.Types.ObjectId(req.params.id);
    const filter = { 'lines.itemId': itemId };
    if (!isAdmin(req) && !(req.permissions || []).includes('orders.view')) {
      const allowedCats = receivingCategoriesForRole(req.user?.roleId?.name || '');
      if (allowedCats.length === 0) return res.json([]);
      filter.categories = { $in: allowedCats };
      filter.status = { $ne: 'brouillon' };
    } else if (!(req.permissions || []).includes('orders.edit') && !isAdmin(req)) {
      filter.status = { $ne: 'brouillon' };
    }

    const orders = await Order.find(filter)
      .select('number reference status orderDate expectedDate supplier supplierId companyId lines receptions createdAt')
      .sort({ createdAt: -1 })
      .populate('supplierId', 'name')
      .populate('companyId', 'name color')
      .lean();

    const rows = [];
    for (const o of orders) {
      for (const l of o.lines || []) {
        if (String(l.itemId) !== String(itemId)) continue;
        const lastReception = (o.receptions || [])
          .filter(r => !r.cancelled && String(r.lineId) === String(l._id))
          .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))[0];
        rows.push({
          orderId: String(o._id),
          number: o.number || '',
          reference: o.reference || '',
          status: o.status,
          orderDate: o.orderDate,
          expectedDate: o.expectedDate,
          supplierName: o.supplierId?.name || o.supplier || '',
          companyName: o.companyId?.name || '',
          companyColor: o.companyId?.color || '',
          quantityOrdered: l.quantityOrdered || 0,
          quantityReceived: l.quantityReceived || 0,
          unitPrice: l.unitPrice || 0,
          closed: !!l.closed,
          lastReceptionAt: lastReception?.receivedAt || null,
          lastBlNumber: lastReception?.blNumber || '',
        });
      }
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/orders/bls-to-receive → delivery notes filed in the Suivi (scan + BL number) that are not
// received in stock yet, limited to the orders where this user has something to receive
// (Magasinier: accessoires, Laquage: poudre, Coordinateur-vitrage: verre, Admin: everything).
// Polled by the badge / banner of the receiving accounts.
app.get('/api/orders/bls-to-receive', requireAuth, async (req, res) => {
  try {
    const admin = isAdmin(req);
    const allowed = admin ? null : receivingCategoriesForRole(req.user?.roleId?.name || '');
    if (!admin && !allowed.length) return res.json({ count: 0, items: [] });
    const filter = { status: { $in: ['envoye', 'partielle'] } };
    if (!admin) filter.categories = { $in: allowed };
    const orders = await Order.find(filter)
      .select('number reference supplier supplierId lines.itemId lines.closed lines.quantityOrdered lines.quantityReceived receptions.blNumber receptions.cancelled')
      .populate('supplierId', 'name').populate('lines.itemId', 'superCategory').lean();
    // only orders with an open line this user may receive
    const mine = orders.filter(o => (o.lines || []).some(l => !l.closed && (l.quantityReceived || 0) < l.quantityOrdered
      && (admin || allowed.includes(l.itemId?.superCategory || 'aluminium'))));
    if (!mine.length) return res.json({ count: 0, items: [] });
    const byId = new Map(mine.map(o => [String(o._id), o]));
    const rows = await OrderTracking.find({ orderId: { $in: mine.map(o => o._id) }, blNumber: { $ne: '' }, 'documents.kind': 'bl' })
      .select('orderId blNumber documents').lean();
    const items = [];
    for (const r of rows) {
      const o = byId.get(String(r.orderId));
      if (!o || (o.receptions || []).some(x => !x.cancelled && x.blNumber === r.blNumber)) continue;
      const docs = (r.documents || []).filter(d => d.kind === 'bl')
        .map(d => ({ id: String(d._id), kind: 'bl', blNumber: r.blNumber, name: d.name, contentType: d.contentType, size: d.size, uploadedAt: d.uploadedAt, uploadedBy: d.uploadedBy }));
      if (!docs.length) continue;
      const first = docs.reduce((m, d) => (new Date(d.uploadedAt) < new Date(m.uploadedAt) ? d : m), docs[0]);
      items.push({
        key: `${o._id}::${r.blNumber}`, orderId: String(o._id), orderNumber: o.number || o.reference || '',
        supplier: o.supplierId?.name || o.supplier || '', blNumber: r.blNumber,
        filedAt: first.uploadedAt, filedBy: first.uploadedBy || '', docs,
      });
    }
    items.sort((a, b) => new Date(b.filedAt) - new Date(a.filedAt));
    res.json({ count: items.length, items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders/recent-receptions', requireAuth, requireOrdersView, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const filter = { 'receptions.0': { $exists: true } };
    if (!isAdmin(req) && !(req.permissions || []).includes('orders.view')) {
      const userRole = req.user?.roleId?.name || '';
      filter.category = { $in: receivingCategoriesForRole(userRole) };
    }
    const orders = await Order.find(filter)
      .select('number reference category companyId lines._id lines.itemId receptions')
      .populate({ path: 'lines.itemId', select: 'designation' })
      .populate('companyId', 'name')
      .lean();

    const events = [];
    for (const o of orders) {
      for (const rec of o.receptions || []) {
        if (rec.cancelled) continue;
        const line = (o.lines || []).find(l => String(l._id) === String(rec.lineId));
        const item = line?.itemId;
        events.push({
          orderId: o._id,
          lineId: rec.lineId,
          orderNumber: o.number || o.reference || '',
          category: o.category,
          companyName: o.companyId?.name || '',
          itemName: item?.designation?.fr || item?.designation?.it || item?.designation?.en || 'Article',
          quantityReceived: rec.quantityReceived,
          blNumber: rec.blNumber,
          receivedBy: rec.receivedBy || '',
          receivedAt: rec.receivedAt,
        });
      }
    }
    events.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
    res.json(events.slice(0, limit));
  } catch (e) { res.status(500).json({ error: e.message }); }
});


app.get('/api/orders/:id', requireAuth, requireOrdersView, async (req, res) => {
  try {
    const o = await populateOrder(Order.findById(req.params.id));
    if (!o) return res.status(404).json({ error: 'Not found' });

    // Permission check for non-admin users
    if (!isAdmin(req) && !(req.permissions || []).includes('orders.view')) {
      const userRole = req.user?.roleId?.name || '';
      const allowedCats = receivingCategoriesForRole(userRole);

      // Order must have at least one allowed category AND not be draft
      const orderCats = o.categories || [];
      const canAccess = orderCats.some(cat => allowedCats.includes(cat));

      if (!canAccess || o.status === 'brouillon') {
        return res.status(403).json({ error: 'Accès refusé à cette commande.' });
      }
    }

    res.json(o);
  } catch (e) {
    console.error('❌ Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});
// Create — always starts as a DRAFT. No number, no orderedQuantity impact yet.
app.post('/api/orders', requireAuth, requirePermission('orders.edit'), async (req, res) => {
  try {
    const categories = Array.isArray(req.body.categories)
      ? req.body.categories.filter(c => c)
      : (req.body.category ? [req.body.category] : []);

    if (categories.length === 0) {
      return res.status(400).json({ error: 'Au moins une catégorie est requise' });
    }

    // Check for duplicate order number on the same company
    const orderNumber = (req.body.number || '').trim();
    if (orderNumber) {
      const existing = await Order.findOne({
        companyId: req.body.companyId,
        number: orderNumber,
      });
      if (existing) {
        return res.status(409).json({
          error: `Un bon de commande avec le numéro "${orderNumber}" existe déjà pour cette société.`,
          code: 'DUPLICATE_ORDER_NUMBER',
          existingOrderId: existing.id,
        });
      }
    }

    let supplierName = req.body.supplier || '';
    if (req.body.supplierId) {
      const f = await Fournisseur.findById(req.body.supplierId);
      if (f) supplierName = f.name;
    }

    await assertOrderItemsExist(req.body.lines);

    const o = new Order({
      reference: req.body.reference || '',
      number: orderNumber,
      categories: categories,  // CHANGED
      companyId: req.body.companyId || null,
      supplierId: req.body.supplierId || null,
      supplier: supplierName,
      orderDate: req.body.orderDate,
      expectedDate: req.body.expectedDate || null,
      tva: req.body.tva != null ? Number(req.body.tva) : 20,
      notes: req.body.notes || '',
      status: 'brouillon',
      lines: (req.body.lines || []).map(l => ({
        itemId: l.itemId,
        quantityOrdered: Number(l.quantityOrdered) || 1,
        quantityReceived: 0,
        unitPrice: Number(l.unitPrice) || 0,
        note: l.note || '',
      })),
    });

    await o.save();
    res.status(201).json(await populateOrder(Order.findById(o._id)));
  } catch (e) {
    res.status(e.status || (e.name === 'ValidationError' ? 400 : 500)).json({ error: e.message });
  }
});

// Edit — drafts: anyone with orders.edit. Sent/beyond: ADMIN ONLY.
// Edit — drafts: anyone with orders.edit. Sent/beyond: ADMIN ONLY.
app.put('/api/orders/:id', requireAuth, requirePermission('orders.edit'), async (req, res) => {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Not found' });
    if (!canEditOrderContent(req, o))
      return res.status(403).json({ error: 'Bon de commande annulé — seul un administrateur peut le modifier.' });
    const editable = canEditOrderContent(req, o);

    let supplierName = req.body.supplier || o.supplier;
    if (req.body.supplierId !== undefined) {
      const f = req.body.supplierId ? await Fournisseur.findById(req.body.supplierId) : null;
      supplierName = f ? f.name : (req.body.supplier || '');
      o.supplierId = req.body.supplierId || null;
    }

    o.reference = req.body.reference ?? o.reference;

    if (req.body.number !== undefined && editable) {
      const newNumber = (req.body.number || '').trim();
      if (newNumber && newNumber !== o.number) {
        const existing = await Order.findOne({
          companyId: o.companyId,
          number: newNumber,
          _id: { $ne: o._id },
        });
        if (existing) {
          return res.status(409).json({
            error: `Un bon de commande avec le numéro "${newNumber}" existe déjà pour cette société.`,
            code: 'DUPLICATE_ORDER_NUMBER',
          });
        }
      }
      o.number = newNumber;
    }

    if (req.body.categories !== undefined) {
      const categories = Array.isArray(req.body.categories)
        ? req.body.categories.filter(c => c)
        : [];
      if (editable && categories.length > 0) {
        o.categories = categories;
      }
    } else if (req.body.category !== undefined && editable) {
      o.categories = [req.body.category];
    }

    o.companyId = req.body.companyId || null;
    o.supplier = supplierName;
    o.orderDate = req.body.orderDate || o.orderDate;
    o.expectedDate = req.body.expectedDate || null;
    o.notes = req.body.notes || '';
    if (req.body.tva != null) o.tva = Number(req.body.tva);
    if (req.body.status && isAdmin(req)) o.status = req.body.status;

    // Items on the order before the edit — orderedQuantity is recomputed for them + new lines after save
    const touchedItemIds = o.lines.map(l => l.itemId);

    // ── LINES: persist edits, reverse stock for deleted received lines ──
    if (req.body.lines !== undefined && editable) {
      await assertOrderItemsExist(req.body.lines);
      const existingById = new Map(o.lines.map(l => [String(l._id), l]));

      // Lines already (partly) received: same article, quantity not below what came in — checked before any stock change
      for (const l of req.body.lines) {
        const existing = l._id ? existingById.get(String(l._id)) : null;
        const received = existing ? (existing.quantityReceived || 0) : 0;
        if (!received) continue;
        if (String(l.itemId) !== String(existing.itemId))
          return res.status(400).json({ error: `Une ligne déjà réceptionnée (${received}) ne peut pas changer d'article.` });
        if ((Number(l.quantityOrdered) || 1) < received)
          return res.status(400).json({ error: `Quantité commandée inférieure à la quantité déjà reçue (${received}).` });
      }
      const incomingIds = new Set(req.body.lines.filter(l => l._id).map(l => String(l._id)));

      // 1) Lines removed entirely: reverse received stock, release pending reservation
      for (const l of o.lines) {
        if (incomingIds.has(String(l._id))) continue; // still present, handled below

        const received = l.quantityReceived || 0;

        if (received > 0) {
          const item = await Item.findById(l.itemId);
          if (item) {
            item.quantity = Math.max(0, item.quantity - received);
            await item.save();
            await StockMovement.create({
              itemId: item._id, type: 'sortie', quantity: received,
              balanceAfter: item.quantity, orderId: o._id,
              note: `Annulation ligne supprimée — ${o.number || o.reference}`,
            });
          }
        }

      }

      // 2) Rebuild lines array (orderedQuantity is recomputed after save)
      const newLines = [];
      for (const l of req.body.lines) {
        const existing = l._id ? existingById.get(String(l._id)) : null;
        const newQtyOrdered = Number(l.quantityOrdered) || 1;
        const receivedQty = existing ? (existing.quantityReceived || 0) : 0;

        newLines.push({
          _id: existing ? existing._id : undefined,
          itemId: l.itemId,
          quantityOrdered: newQtyOrdered,
          quantityReceived: receivedQty,
          unitPrice: Number(l.unitPrice) || 0,
          note: l.note || '',
          closed: existing ? !!existing.closed : false,
          closedAt: existing ? existing.closedAt : null,
          closedBy: existing ? existing.closedBy : '',
          closedNote: existing ? existing.closedNote : '',
        });
      }
      o.lines = newLines;
    }

    await o.save();
    await recomputeOrderedQuantity([...touchedItemIds, ...o.lines.map(l => l.itemId)]);
    res.json(await populateOrder(Order.findById(o._id)));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// SEND to supplier — draft → envoye. Assigns BC number + reserves orderedQuantity.
app.post('/api/orders/:id/send', requireAuth, requirePermission('orders.edit'), async (req, res) => {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Not found' });
    if (o.status !== 'brouillon') return res.status(400).json({ error: 'Ce bon de commande a déjà été envoyé.' });
    if (!o.companyId) return res.status(400).json({ error: 'Sélectionnez une société avant l\'envoi.' });
    if (!o.lines.length) return res.status(400).json({ error: 'Impossible d\'envoyer un bon de commande vide.' });

    if (!o.number) {                                    // ← CHANGED: only auto-assign if empty
      o.number = await assignBcNumber(o.companyId);
    }
    o.status = 'envoye';
    o.sentAt = new Date();
    o.sentBy = req.user?.displayName || req.user?.username || '';
    await o.save();
    await recomputeOrderedQuantity(o.lines.map(l => l.itemId));
    res.json(await populateOrder(Order.findById(o._id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Receive — achat allowed even on sent orders (normal workflow).
// Receive — réservé au rôle concerné par la catégorie du BC (ou Admin). BL obligatoire.
// POST /api/orders/:id/receive-batch  { blNumber, lines: [{ lineId, quantity }] }
// One delivery (one BL) received in one go: `quantity` is what arrives NOW for each line (not the
// running total). Everything is checked first (BL, permissions, closed lines, quantities); nothing
// is written if one line is refused.
app.post('/api/orders/:id/receive-batch', requireAuth, async (req, res) => {
  try {
    const blNumber = String(req.body?.blNumber || '').trim().slice(0, 80);
    if (!blNumber) return res.status(400).json({ error: 'Le numéro de BL de réception est requis.' });
    const wanted = (Array.isArray(req.body?.lines) ? req.body.lines : [])
      .map(l => ({ lineId: String(l?.lineId || ''), quantity: Number(l?.quantity) }))
      .filter(l => l.quantity !== 0);
    if (!wanted.length) return res.status(400).json({ error: 'Indiquez au moins une quantité reçue.' });
    if (wanted.some(l => !Number.isFinite(l.quantity) || l.quantity < 0)) return res.status(400).json({ error: 'Quantité invalide.' });
    if (new Set(wanted.map(l => l.lineId)).size !== wanted.length) return res.status(400).json({ error: 'Une ligne apparaît deux fois.' });

    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });
    if (o.status === 'brouillon') return res.status(400).json({ error: 'Envoyez le bon de commande avant de réceptionner.' });
    if (o.status === 'annulee') return res.status(400).json({ error: 'Bon de commande annulé.' });

    const plan = [];
    for (const w of wanted) {
      const line = mongoose.Types.ObjectId.isValid(w.lineId) ? o.lines.id(w.lineId) : null;
      if (!line) return res.status(404).json({ error: 'Ligne introuvable dans ce bon de commande.' });
      const item = await Item.findById(line.itemId);
      const label = item?.designation?.fr || item?.codeInterne || 'article';
      if (line.closed) return res.status(400).json({ error: `La ligne « ${label} » est clôturée.` });
      if (!(await canReceiveOrderLine(req, o, line.itemId))) {
        const sc = item?.superCategory || 'aluminium';
        return res.status(403).json({ error: `Vous ne pouvez pas réceptionner les articles "${sc}" (« ${label} »). Cette action est réservée au rôle "${CATEGORY_RECEIVE_ROLE[sc] || 'Admin'}" (ou Admin).` });
      }
      plan.push({ line, item, quantity: w.quantity });
    }

    const by = req.user?.displayName || req.user?.username || '';
    const now = new Date();
    for (const { line, item, quantity } of plan) {
      line.quantityReceived = (line.quantityReceived || 0) + quantity;
      if (item) {
        item.quantity += quantity;
        await item.save();
        await StockMovement.create({
          itemId: item._id, type: 'order_reception', quantity,
          balanceAfter: item.quantity, orderId: o._id,
          note: `Réception ${o.number || o.reference} — BL ${blNumber}`,
        });
      }
      o.receptions.push({ lineId: line._id, quantityReceived: quantity, blNumber, receivedBy: by, receivedAt: now });
    }
    refreshOrderStatus(o);
    await o.save();
    await recomputeOrderedQuantity(plan.map(p => p.line.itemId));
    res.json(await populateOrder(Order.findById(o._id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/orders/:id/receive', requireAuth, async (req, res) => {
  try {
    const { lineId, quantityReceived, blNumber } = req.body;

    if (!blNumber || !blNumber.trim()) {
      return res.status(400).json({ error: 'Le numéro de BL de réception est requis.' });
    }

    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });

    if (o.status === 'brouillon') return res.status(400).json({ error: 'Envoyez le bon de commande avant de réceptionner.' });
    if (o.status === 'annulee') return res.status(400).json({ error: 'Bon de commande annulé.' });

    const line = o.lines.id(lineId);
    if (!line) return res.status(404).json({ error: 'Line not found' });

    // NEW: Check if user can receive THIS SPECIFIC LINE based on its item's superCategory
    const canReceiveThisLine = await canReceiveOrderLine(req, o, line.itemId);

    if (!canReceiveThisLine) {
      const item = await Item.findById(line.itemId).populate('categoryId');
      const itemSuperCat = item?.superCategory || 'aluminium';
      const requiredRole = CATEGORY_RECEIVE_ROLE[itemSuperCat];
      return res.status(403).json({
        error: `Vous ne pouvez pas réceptionner les articles "${itemSuperCat}". Cette action est réservée au rôle "${requiredRole || 'Admin'}" (ou Admin).`,
      });
    }

    if (line.closed) return res.status(400).json({ error: 'Cette ligne est clôturée.' });

    const alreadyReceived = line.quantityReceived || 0;
    const newlyReceived = Number(quantityReceived) - alreadyReceived;
    if (newlyReceived <= 0) return res.status(400).json({ error: 'La quantité reçue doit dépasser le déjà reçu.' });

    line.quantityReceived = Number(quantityReceived);

    const item = await Item.findById(line.itemId);
    if (item) {
      item.quantity += newlyReceived;
      await item.save();
      await StockMovement.create({
        itemId: item._id, type: 'order_reception', quantity: newlyReceived,
        balanceAfter: item.quantity, orderId: o._id,
        note: `Réception ${o.number || o.reference} — BL ${blNumber.trim()}`,
      });
    }

    o.receptions.push({
      lineId: line._id,
      quantityReceived: newlyReceived,
      blNumber: blNumber.trim(),
      receivedBy: req.user?.displayName || req.user?.username || '',
      receivedAt: new Date(),
    });

    refreshOrderStatus(o);

    await o.save();
    await recomputeOrderedQuantity([line.itemId]);
    res.json(await populateOrder(Order.findById(o._id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Take `qty` out of an article's stock. If the stock is lower (part already used), refuse with
// 409 INSUFFICIENT_STOCK unless `force` → then the stock goes down to 0 (never negative).
// Returns { item, removed } or { conflict: { available } }.
async function takeOutStock(itemId, qty, force) {
  const item = await Item.findOneAndUpdate(
    { _id: itemId, quantity: { $gte: qty } },
    { $inc: { quantity: -qty } },
    { new: true }
  );
  if (item) return { item, removed: qty };
  const current = await Item.findById(itemId, 'quantity');
  if (!current) return { item: null, removed: 0 };
  if (!force) return { conflict: { available: current.quantity || 0 } };
  const before = current.quantity || 0;
  const forced = await Item.findByIdAndUpdate(itemId, { $set: { quantity: 0 } }, { new: true });
  return { item: forced, removed: before };
}

// Cancel a reception entered by mistake: the quantity leaves the stock and the line again.
// The entry stays in the history (struck through) — then receive again with the right quantity.
app.post('/api/orders/:id/receptions/:receptionId/cancel', requireAuth, async (req, res) => {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });
    if (o.status === 'annulee') return res.status(400).json({ error: 'Bon de commande annulé.' });

    const rec = o.receptions.id(req.params.receptionId);
    if (!rec) return res.status(404).json({ error: 'Réception introuvable' });
    if (rec.cancelled) return res.status(400).json({ error: 'Cette réception est déjà annulée.' });

    const line = o.lines.id(rec.lineId);
    if (!line) return res.status(404).json({ error: 'Ligne introuvable' });

    if (!isAdmin(req) && !(await canReceiveOrderLine(req, o, line.itemId)))
      return res.status(403).json({ error: 'Vous ne pouvez pas annuler cette réception.' });

    const qty = rec.quantityReceived || 0;
    const blLabel = `${o.number || o.reference} — BL ${rec.blNumber}`;

    // Take the quantity back out of the stock. If part of it was already used, ask for confirmation
    // (409) — with force the stock goes down to 0.
    const out = await takeOutStock(line.itemId, qty, !!req.body.force);
    if (out.conflict) {
      return res.status(409).json({
        code: 'INSUFFICIENT_STOCK', needed: qty, available: out.conflict.available,
        error: `Le stock actuel (${out.conflict.available}) est inférieur à la quantité de la réception (${qty}) : une partie a déjà été utilisée.`,
      });
    }
    if (out.item) {
      await StockMovement.create({
        itemId: out.item._id, type: 'sortie', quantity: out.removed,
        balanceAfter: out.item.quantity, orderId: o._id,
        note: `Annulation réception ${blLabel}${out.removed < qty ? ` (stock insuffisant : ${out.removed} retiré(s) sur ${qty})` : ''}${req.body.note ? ` — ${req.body.note}` : ''}`,
      });
    }

    line.quantityReceived = Math.max(0, (line.quantityReceived || 0) - qty);
    rec.cancelled = true;
    rec.cancelledAt = new Date();
    rec.cancelledBy = req.user?.displayName || req.user?.username || '';
    rec.cancelNote = (req.body.note || '').trim();

    refreshOrderStatus(o);
    await o.save();
    await recomputeOrderedQuantity([line.itemId]);
    res.json(await populateOrder(Order.findById(o._id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Adjust the quantity of a reception (e.g. 100 entered, 90 really received):
// only the difference is applied to the stock and to the line — no need to cancel and receive again.
app.patch('/api/orders/:id/receptions/:receptionId', requireAuth, async (req, res) => {
  try {
    const newQty = Number(req.body.quantity);
    if (!Number.isFinite(newQty) || newQty <= 0)
      return res.status(400).json({ error: 'La nouvelle quantité doit être supérieure à 0 (pour tout retirer, utilisez « Annuler »).' });

    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });
    if (o.status === 'annulee') return res.status(400).json({ error: 'Bon de commande annulé.' });

    const rec = o.receptions.id(req.params.receptionId);
    if (!rec) return res.status(404).json({ error: 'Réception introuvable' });
    if (rec.cancelled) return res.status(400).json({ error: 'Cette réception est annulée.' });

    const line = o.lines.id(rec.lineId);
    if (!line) return res.status(404).json({ error: 'Ligne introuvable' });

    if (!isAdmin(req) && !(await canReceiveOrderLine(req, o, line.itemId)))
      return res.status(403).json({ error: 'Vous ne pouvez pas ajuster cette réception.' });

    const oldQty = rec.quantityReceived || 0;
    const delta = newQty - oldQty;
    if (delta === 0) return res.status(400).json({ error: 'La quantité est inchangée.' });

    // Stock: +delta when raising; -delta when lowering (confirmation asked if part was already used)
    let item, moved = Math.abs(delta);
    if (delta > 0) {
      item = await Item.findByIdAndUpdate(line.itemId, { $inc: { quantity: delta } }, { new: true });
    } else {
      const out = await takeOutStock(line.itemId, -delta, !!req.body.force);
      if (out.conflict) {
        return res.status(409).json({
          code: 'INSUFFICIENT_STOCK', needed: -delta, available: out.conflict.available,
          error: `Le stock actuel (${out.conflict.available}) est inférieur aux ${-delta} à retirer : une partie a déjà été utilisée.`,
        });
      }
      item = out.item;
      moved = out.removed;
    }
    if (!item) return res.status(404).json({ error: 'Article introuvable dans l\'inventaire' });
    const note = (req.body.note || '').trim();
    await StockMovement.create({
      itemId: item._id,
      type: delta > 0 ? 'entree' : 'sortie',
      quantity: moved,
      balanceAfter: item.quantity,
      orderId: o._id,
      note: `Ajustement réception ${o.number || o.reference} — BL ${rec.blNumber} : ${oldQty} → ${newQty}${note ? ` — ${note}` : ''}`,
    });

    line.quantityReceived = Math.max(0, (line.quantityReceived || 0) + delta);
    rec.quantityReceived = newQty;
    rec.adjustments = rec.adjustments || [];
    rec.adjustments.push({ from: oldQty, to: newQty, at: new Date(), by: req.user?.displayName || req.user?.username || '', note });

    refreshOrderStatus(o);
    await o.save();
    await recomputeOrderedQuantity([line.itemId]);
    res.json(await populateOrder(Order.findById(o._id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Close a line that will never be fully delivered (e.g. 198 / 200 received).
// The remaining quantity leaves Item.orderedQuantity. Reopen (closed: false) → admin only.
app.patch('/api/orders/:id/lines/:lineId/close', requireAuth, async (req, res) => {
  try {
    const closed = req.body.closed !== false;
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });
    if (o.status === 'brouillon' || o.status === 'annulee')
      return res.status(400).json({ error: 'Seul un bon de commande envoyé peut avoir des lignes clôturées.' });

    const line = o.lines.id(req.params.lineId);
    if (!line) return res.status(404).json({ error: 'Line not found' });

    if (closed) {
      if (!isAdmin(req) && !(await canReceiveOrderLine(req, o, line.itemId)))
        return res.status(403).json({ error: 'Vous ne pouvez pas clôturer cette ligne.' });
      if ((line.quantityReceived || 0) >= line.quantityOrdered)
        return res.status(400).json({ error: 'Cette ligne est déjà entièrement reçue.' });
      line.closed = true;
      line.closedAt = new Date();
      line.closedBy = req.user?.displayName || req.user?.username || '';
      line.closedNote = (req.body.note || '').trim();
    } else {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Seul un administrateur peut rouvrir une ligne.' });
      line.closed = false;
      line.closedAt = null;
      line.closedBy = '';
      line.closedNote = '';
    }

    refreshOrderStatus(o);
    await o.save();
    await recomputeOrderedQuantity([line.itemId]);
    res.json(await populateOrder(Order.findById(o._id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Cancel — restores unreceived reservation. Sent order → admin only.
app.post('/api/orders/:id/cancel', requireAuth, requirePermission('orders.edit'), async (req, res) => {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Not found' });
    if (!canMutateOrder(req, o)) return res.status(403).json({ error: 'Bon de commande envoyé — seul un administrateur peut l\'annuler.' });
    o.status = 'annulee';
    await o.save();
    await recomputeOrderedQuantity(o.lines.map(l => l.itemId));
    res.json(await populateOrder(Order.findById(o._id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete — draft: orders.delete. Sent/beyond: ADMIN ONLY (restores reservation).
app.delete('/api/orders/:id', requireAuth, async (req, res) => {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Not found' });
    const draft = o.status === 'brouillon';
    if (draft) {
      if (!(req.permissions || []).includes('orders.delete') && !isAdmin(req))
        return res.status(403).json({ error: 'Permission requise : orders.delete' });
    } else if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Bon de commande envoyé — seul un administrateur peut le supprimer.' });
    }
    await Order.findByIdAndDelete(req.params.id);
    await recomputeOrderedQuantity(o.lines.map(l => l.itemId));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Recent receptions across all orders (for the notif bell)


// ==================== ORDER TRACKING ROUTES ====================
// Access: only users with 'orders.edit' — i.e. Achat role + Admin (Admin has ALL_PERMISSIONS).

// Due date of an invoice: base date + supplier term (days), optionally pushed to the end of that month
function dueDate(base, delai, finDeMois) {
  if (!base || delai == null) return null;
  const d = new Date(base);
  d.setDate(d.getDate() + Number(delai));
  if (finDeMois) { d.setMonth(d.getMonth() + 1, 0); }
  d.setHours(23, 59, 59, 999);
  return d;
}

// One row per (order, BL), with invoice + payment follow-up. Shared by the Suivi table and the supplier figures.
async function buildTrackingRows(orderFilter) {
  const orders = await Order.find(orderFilter)
    .select('number reference orderDate tva status supplier supplierId lines._id lines.quantityOrdered lines.unitPrice receptions.blNumber receptions.cancelled receptions.lineId receptions.quantityReceived receptions.receivedAt')
    .populate('supplierId', 'name delaiPaiement finDeMois')
    .sort({ orderDate: -1 })
    .lean();
  // Older orders only carry the supplier name: find their supplier (and its payment term) by name
  const byName = new Map((await Fournisseur.find().select('name delaiPaiement finDeMois').lean()).map(f => [String(f.name || '').trim().toLowerCase(), f]));

  const trackingDocs = orders.length
    ? await OrderTracking.find({ orderId: { $in: orders.map(o => o._id) } })
      .select('orderId blNumber factureStatus modePaiement typeFacture remarque documents factureNumber factureDate paiementStatus paiementDate montantPaye').lean()
    : [];
  const trackingMap = {};
  const trackingByOrder = new Map();
  trackingDocs.forEach(t => {
    trackingMap[`${t.orderId}::${t.blNumber || ''}`] = t;
    const k = String(t.orderId);
    if (!trackingByOrder.has(k)) trackingByOrder.set(k, []);
    trackingByOrder.get(k).push(t);
  });
  const today = new Date();

  const rows = [];
  for (const o of orders) {
    const priceByLine = new Map((o.lines || []).map(l => [String(l._id), l.unitPrice || 0]));
    const totalHT = (o.lines || []).reduce((s, l) => s + (l.quantityOrdered || 0) * (l.unitPrice || 0), 0);
    const tvaRate = o.tva != null ? Number(o.tva) : 20;
    const montantBC = parseFloat((totalHT * (1 + tvaRate / 100)).toFixed(2));
    const sup = o.supplierId || byName.get(String(o.supplier || '').trim().toLowerCase()) || null;
    const supplierName = o.supplierId?.name || o.supplier || '';
    const orderNumber = o.number || o.reference || '';

    const blGroups = {};
    for (const rec of o.receptions || []) {
      if (rec.cancelled) continue;
      const key = rec.blNumber || '';
      (blGroups[key] = blGroups[key] || []).push(rec);
    }
    const blKeys = Object.keys(blGroups);

    const buildRow = (blNumber, date, montantBL) => {
      const t = trackingMap[`${o._id}::${blNumber}`];
      const paiementStatus = t?.paiementStatus || 'non_paye';
      const montantDu = blNumber ? montantBL : montantBC;          // what this row should cost
      const montantPaye = paiementStatus === 'paye' ? montantDu : paiementStatus === 'partiel' ? (t?.montantPaye || 0) : 0;
      // Due date from the invoice date; without it, from the BL date (estimate)
      const base = t?.factureDate || (blNumber ? date : null);
      const echeance = sup ? dueDate(base, sup.delaiPaiement, sup.finDeMois) : null;
      const reste = Math.max(0, parseFloat((montantDu - montantPaye).toFixed(2)));
      const retardJours = echeance && paiementStatus !== 'paye' && reste > 0 && echeance < today
        ? Math.floor((today - echeance) / 86400000) + 1 : 0;
      return {
        orderId: String(o._id), blNumber, date, supplierName, supplierId: sup?._id ? String(sup._id) : null, orderNumber,
        montantBC, montantBL, status: o.status,
        factureStatus: t?.factureStatus || 'non_recue',
        modePaiement: t?.modePaiement || '',
        typeFacture: t?.typeFacture || '',
        remarque: t?.remarque || '',
        documents: (t?.documents || []).map(d => ({
          id: String(d._id), kind: d.kind, name: d.name, contentType: d.contentType, size: d.size, uploadedAt: d.uploadedAt, uploadedBy: d.uploadedBy,
        })),
        factureNumber: t?.factureNumber || '',
        factureDate: t?.factureDate || null,
        paiementStatus, paiementDate: t?.paiementDate || null,
        montantPaye: parseFloat(montantPaye.toFixed(2)), montantDu, reste,
        delaiPaiement: sup?.delaiPaiement ?? null, finDeMois: !!sup?.finDeMois,
        echeance, echeanceEstimee: !!echeance && !t?.factureDate, retardJours,
      };
    };

    // BL filed in the Suivi but not received in stock yet: own row, amount known at reception
    const pending = (trackingByOrder.get(String(o._id)) || []).filter(t => t.blNumber && !blGroups[t.blNumber]
      && (t.documents || []).some(d => d.kind === 'bl'));
    for (const t of pending) {
      const first = t.documents.filter(d => d.kind === 'bl').reduce((m, d) => (!m || new Date(d.uploadedAt) < new Date(m) ? d.uploadedAt : m), null);
      rows.push({ ...buildRow(t.blNumber, first, 0), blPending: true });
    }
    if (blKeys.length === 0) {
      rows.push(buildRow('', o.orderDate, 0));
    } else {
      for (const bl of blKeys) {
        const recs = blGroups[bl];
        let montantBLHT = 0;
        for (const rec of recs) montantBLHT += (rec.quantityReceived || 0) * (priceByLine.get(String(rec.lineId)) || 0);
        const montantBL = parseFloat((montantBLHT * (1 + tvaRate / 100)).toFixed(2));
        const lastDate = recs.reduce((max, r) => new Date(r.receivedAt) > new Date(max) ? r.receivedAt : max, recs[0].receivedAt);
        rows.push(buildRow(bl, lastDate, montantBL));
      }
    }
  }
  return rows;
}
// A row is "to pay" once the goods or the invoice came in (BL received or invoice received) and it is not paid
const isToPay = (r) => r.paiementStatus !== 'paye' && r.reste > 0 && r.status !== 'annulee' && (r.blNumber || r.factureStatus === 'recue');

// GET /api/order-tracking?page=1&limit=25&q=&facture=all|recue|non_recue|sans_pdf|a_payer|retard
// One row per (order, BL). Only the fields the table needs are read (lean + projection), tracking
// docs are fetched for the matching orders only, then rows are filtered, totalled and paginated.
// Without ?page the full array is returned (backward compatible).
app.get('/api/order-tracking', requireAuth, requireAccounting, async (req, res) => {
  try {
    const words = normalizeSearch(req.query.q).split(' ').filter(Boolean).slice(0, 6);
    const facture = ['recue', 'non_recue', 'sans_pdf', 'a_payer', 'retard'].includes(req.query.facture) ? req.query.facture : 'all';

    const orderFilter = { status: { $ne: 'brouillon' } };
    // Narrow the orders in MongoDB when searching: each word must hit the order number/reference,
    // the supplier (free text or linked supplier), a BL number, a tracking remark or an invoice number.
    if (words.length) {
      const and = [];
      for (const w of words) {
        const rx = accentRegex(w);
        const [sups, trk] = await Promise.all([
          Fournisseur.find({ name: rx }).select('_id').lean(),
          OrderTracking.find({ $or: [{ remarque: rx }, { factureNumber: rx }] }).select('orderId').lean(),
        ]);
        and.push({ $or: [
          { number: rx }, { reference: rx }, { supplier: rx }, { 'receptions.blNumber': rx },
          { supplierId: { $in: sups.map(x => x._id) } },
          { _id: { $in: trk.map(x => x.orderId) } },
        ] });
      }
      orderFilter.$and = and;
    }

    let rows = await buildTrackingRows(orderFilter);

    // Row-level filters (same rules as the screen)
    if (facture === 'sans_pdf') rows = rows.filter(r => !r.documents.some(d => d.kind === 'facture'));
    else if (facture === 'a_payer') rows = rows.filter(isToPay);
    else if (facture === 'retard') rows = rows.filter(r => isToPay(r) && r.retardJours > 0);
    else if (facture !== 'all') rows = rows.filter(r => r.factureStatus === facture);
    if (words.length) rows = rows.filter(r => {
      const hay = normalizeSearch([r.supplierName, r.orderNumber, r.blNumber, r.remarque, r.factureNumber].join(' '));
      return words.every(w => hay.includes(w));
    });

    // Most recent first; "à payer" / "en retard": the oldest due date first
    if (facture === 'a_payer' || facture === 'retard') rows.sort((a, b) => (a.echeance ? new Date(a.echeance) : Infinity) - (b.echeance ? new Date(b.echeance) : Infinity));
    else rows.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (req.query.page === undefined) return res.json(rows);

    const totals = rows.reduce((acc, r) => ({
      bc: acc.bc + (r.montantBC || 0), bl: acc.bl + (r.montantBL || 0),
      reste: acc.reste + (isToPay(r) ? r.reste : 0), retard: acc.retard + (isToPay(r) && r.retardJours > 0 ? r.reste : 0),
    }), { bc: 0, bl: 0, reste: 0, retard: 0 });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), pages);
    res.json({
      rows: rows.slice((page - 1) * limit, page * limit),
      total, page, pages, limit,
      totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, parseFloat(v.toFixed(2))])),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/order-tracking', requireAuth, requireAccounting, async (req, res) => {
  try {
    const { orderId, blNumber } = req.body;
    if (!mongoose.Types.ObjectId.isValid(orderId)) return res.status(400).json({ error: 'orderId requis' });
    const set = {};
    const b = req.body;
    const oneOf = (v, list) => list.includes(v);
    if (b.factureStatus !== undefined) { if (!oneOf(b.factureStatus, ['non_recue', 'recue'])) return res.status(400).json({ error: 'Statut facture invalide' }); set.factureStatus = b.factureStatus; }
    if (b.modePaiement !== undefined) { if (!oneOf(b.modePaiement, ['', 'espece', 'virement', 'cheque', 'effet'])) return res.status(400).json({ error: 'Mode de paiement invalide' }); set.modePaiement = b.modePaiement; }
    if (b.typeFacture !== undefined) { if (!oneOf(b.typeFacture, ['', 'bl', 'facture', 'situation'])) return res.status(400).json({ error: 'Type de facture invalide' }); set.typeFacture = b.typeFacture; }
    if (b.remarque !== undefined) set.remarque = String(b.remarque).slice(0, 500);
    if (b.factureNumber !== undefined) set.factureNumber = String(b.factureNumber).trim().slice(0, 80);
    const date = (v) => { if (v === null || v === '') return null; const d = new Date(v); return isNaN(d) ? undefined : d; };
    if (b.factureDate !== undefined) { const d = date(b.factureDate); if (d === undefined) return res.status(400).json({ error: 'Date de facture invalide' }); set.factureDate = d; }
    if (b.paiementDate !== undefined) { const d = date(b.paiementDate); if (d === undefined) return res.status(400).json({ error: 'Date de paiement invalide' }); set.paiementDate = d; }
    if (b.montantPaye !== undefined) { const n = Number(b.montantPaye); if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Montant payé invalide' }); set.montantPaye = Math.round(n * 100) / 100; }
    if (b.paiementStatus !== undefined) {
      if (!oneOf(b.paiementStatus, ['non_paye', 'partiel', 'paye'])) return res.status(400).json({ error: 'Statut de paiement invalide' });
      set.paiementStatus = b.paiementStatus;
      if (b.paiementStatus === 'non_paye') { set.paiementDate = null; set.montantPaye = 0; }
    }
    const filter = { orderId, blNumber: blNumber || '' };
    // Marked paid without a date → today
    if (set.paiementStatus === 'paye' && b.paiementDate === undefined) {
      const cur = await OrderTracking.findOne(filter).select('paiementDate').lean();
      if (!cur?.paiementDate) set.paiementDate = new Date();
    }
    const t = await OrderTracking.findOneAndUpdate(filter, { $set: set }, { upsert: true, new: true, runValidators: true });
    res.json(t.toJSON());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== DOCUMENTS (Cloudflare R2) ====================
// Invoices and delivery notes of the "Suivi des commandes". Files go through this server to a private
// R2 bucket (S3-compatible); opening one returns a link valid for a few minutes.
// .env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET   (npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner)
// R2_ENDPOINT is optional (another S3-compatible service, or a local test server).
const DOC_MAX_BYTES = 15 * 1024 * 1024;
// Storage cap — stays under Cloudflare's free 10 GB. Uploads are refused beyond it; warning from 80 %.
const GB = 1024 * 1024 * 1024;
const DOC_QUOTA_BYTES = Math.min(Number(process.env.R2_QUOTA_GB) || 9, 9.5) * GB;
const DOC_WARN_RATIO = 0.8;
// Space used = sum of the sizes recorded for every document (every file goes through this server)
let docUsageCache = null; // { bytes, count, at }
async function docUsage(force = false) {
  if (!force && docUsageCache && Date.now() - docUsageCache.at < 60000) return docUsageCache;
  const rows = await OrderTracking.find({ 'documents.0': { $exists: true } }).select('documents.size').lean();
  let bytes = 0, count = 0;
  for (const r of rows) for (const d of r.documents || []) { bytes += d.size || 0; count++; }
  docUsageCache = { bytes, count, at: Date.now() };
  return docUsageCache;
}
const usageView = (u) => ({
  used: u.bytes, count: u.count, limit: DOC_QUOTA_BYTES, warnAt: Math.round(DOC_QUOTA_BYTES * DOC_WARN_RATIO),
  pct: Math.round((u.bytes / DOC_QUOTA_BYTES) * 1000) / 10, full: u.bytes >= DOC_QUOTA_BYTES,
});
let r2Client = null;
function r2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT } = process.env;
  if (!R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || (!R2_ACCOUNT_ID && !R2_ENDPOINT)) {
    const e = new Error('Stockage des documents non configuré (variables R2_… manquantes dans .env).'); e.status = 503; throw e;
  }
  let sdk, presigner;
  try { sdk = require('@aws-sdk/client-s3'); presigner = require('@aws-sdk/s3-request-presigner'); }
  catch { const e = new Error('Module manquant : lancez « npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner » dans backend.'); e.status = 503; throw e; }
  if (!r2Client) {
    r2Client = new sdk.S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: !!R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
  }
  return { client: r2Client, sdk, presigner, bucket: R2_BUCKET };
}
// Real file type from the first bytes (the browser's content-type is not trusted)
function sniffDoc(buf) {
  if (buf.length >= 5 && buf.slice(0, 5).toString('latin1') === '%PDF-') return { type: 'application/pdf', ext: 'pdf' };
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return { type: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return { type: 'image/png', ext: 'png' };
  if (buf.length >= 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}
const safeKeyPart = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';

// POST /api/order-tracking/documents?orderId=&blNumber=&kind=facture|bl&name=  — body: the file itself (max 15 MB)
const docBody = express.raw({ type: () => true, limit: DOC_MAX_BYTES });
// Body reader with a readable answer when the file is too large
const readDocBody = (req, res, next) => docBody(req, res, (err) => {
  if (!err) return next();
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Fichier trop lourd (15 Mo maximum).' });
  res.status(400).json({ error: 'Envoi du fichier interrompu.' });
});
app.post('/api/order-tracking/documents', requireAuth, requireAccounting, readDocBody, async (req, res) => {
    try {
      const { orderId, kind } = req.query;
      const blNumber = String(req.query.blNumber || '').trim().slice(0, 80);
      if (!mongoose.Types.ObjectId.isValid(orderId)) return res.status(400).json({ error: 'Commande invalide' });
      if (!['facture', 'bl'].includes(kind)) return res.status(400).json({ error: 'Type de document invalide' });
      // A delivery note is filed under its own number: the warehouse then picks it at reception
      if (kind === 'bl' && !blNumber.trim()) return res.status(400).json({ error: 'Indiquez le numéro du BL.' });
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!buf.length) return res.status(400).json({ error: 'Fichier vide' });
      const sniff = sniffDoc(buf);
      if (!sniff) return res.status(415).json({ error: 'Format non accepté : PDF, JPG, PNG ou WebP uniquement.' });
      const order = await Order.findById(orderId).select('number reference orderDate').lean();
      if (!order) return res.status(404).json({ error: 'Commande introuvable' });
      // Free-tier guard: never go past the cap
      const usage = await docUsage(true);
      if (usage.bytes + buf.length > DOC_QUOTA_BYTES) {
        const go = (b) => (b / GB).toFixed(2).replace('.', ',');
        return res.status(507).json({ error: `Plus assez d'espace de stockage : ${go(usage.bytes)} Go utilisés sur ${go(DOC_QUOTA_BYTES)} Go (limite fixée pour rester gratuit). Supprimez d'anciens documents pour en ajouter.`, storage: usageView(usage) });
      }
      const { client, sdk, bucket } = r2();
      const year = new Date(order.orderDate || Date.now()).getFullYear();
      const base = String(req.query.name || `${kind}.${sniff.ext}`).replace(/\.[^.]+$/, '');
      const key = `achats/${year}/${safeKeyPart(order.number || order.reference || orderId)}/${kind}${blNumber ? `-${safeKeyPart(blNumber)}` : ''}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${sniff.ext}`;
      await client.send(new sdk.PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: sniff.type }));
      const doc = { kind, key, name: `${base.slice(0, 120)}.${sniff.ext}`, contentType: sniff.type, size: buf.length, uploadedAt: new Date(), uploadedBy: req.user?.displayName || req.user?.username || '' };
      const update = { $push: { documents: doc } };
      if (kind === 'facture') update.$set = { factureStatus: 'recue' }; // an invoice is attached → it was received
      const t = await OrderTracking.findOneAndUpdate({ orderId, blNumber }, update, { upsert: true, new: true });
      const saved = t.documents[t.documents.length - 1];
      const after = await docUsage(true);
      res.status(201).json({ id: String(saved._id), kind: saved.kind, blNumber, name: saved.name, contentType: saved.contentType, size: saved.size, uploadedAt: saved.uploadedAt, uploadedBy: saved.uploadedBy, factureStatus: t.factureStatus, storage: usageView(after) });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Same rule as the purchase order page: orders.view / admin see every order; receiving roles only
// the sent orders of their categories.
function canSeeOrder(req, order) {
  if (isAdmin(req) || (req.permissions || []).includes('orders.view')) return true;
  const allowed = receivingCategoriesForRole(req.user?.roleId?.name || '');
  return order.status !== 'brouillon' && (order.categories || []).some(c => allowed.includes(c));
}

// GET /api/orders/:id/documents → documents attached to the order in the Suivi:
//   delivery notes (everyone who can see the order) + invoices (ACHAT / accountant / admin only)
app.get('/api/orders/:id/documents', requireAuth, requireOrdersView, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Commande invalide' });
    const order = await Order.findById(req.params.id).select('status categories').lean();
    if (!order) return res.status(404).json({ error: 'Not found' });
    if (!canSeeOrder(req, order)) return res.status(403).json({ error: 'Accès refusé à cette commande.' });
    const withInvoices = canAccounting(req);
    const rows = await OrderTracking.find({ orderId: order._id, 'documents.0': { $exists: true } }).select('blNumber documents').lean();
    const docs = [];
    for (const r of rows) for (const d of r.documents || []) {
      if (d.kind === 'facture' && !withInvoices) continue;
      docs.push({ id: String(d._id), kind: d.kind, blNumber: r.blNumber || '', name: d.name, contentType: d.contentType, size: d.size, uploadedAt: d.uploadedAt, uploadedBy: d.uploadedBy });
    }
    docs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
    res.json({ documents: docs, canManage: withInvoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/order-tracking/storage → space used by the documents vs the free-tier cap
app.get('/api/order-tracking/storage', requireAuth, requireAccounting, async (req, res) => {
  try { res.json(usageView(await docUsage())); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/order-tracking/documents/:docId/url → { url } valid 5 minutes (opens in the browser)
app.get('/api/order-tracking/documents/:docId/url', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.docId)) return res.status(400).json({ error: 'Document invalide' });
    const t = await OrderTracking.findOne({ 'documents._id': req.params.docId }).select('orderId documents').lean();
    const d = t?.documents.find(x => String(x._id) === req.params.docId);
    if (!d) return res.status(404).json({ error: 'Document introuvable' });
    if (!canAccounting(req)) {
      // Delivery notes are visible to whoever can see the order (warehouse…); invoices are not
      const order = d.kind === 'bl' && canViewOrders(req) ? await Order.findById(t.orderId).select('status categories').lean() : null;
      if (!order || !canSeeOrder(req, order)) return res.status(403).json({ error: 'Accès refusé à ce document.' });
    }
    const { client, sdk, presigner, bucket } = r2();
    const disposition = `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${safeKeyPart(d.name)}"; filename*=UTF-8''${encodeURIComponent(d.name)}`;
    const url = await presigner.getSignedUrl(client, new sdk.GetObjectCommand({
      Bucket: bucket, Key: d.key, ResponseContentDisposition: disposition, ResponseContentType: d.contentType,
    }), { expiresIn: 300 });
    res.json({ url });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// DELETE /api/order-tracking/documents/:docId — removes the file from R2 and from the row
app.delete('/api/order-tracking/documents/:docId', requireAuth, requireAccounting, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.docId)) return res.status(400).json({ error: 'Document invalide' });
    const t = await OrderTracking.findOne({ 'documents._id': req.params.docId }).select('documents').lean();
    const d = t?.documents.find(x => String(x._id) === req.params.docId);
    if (!d) return res.status(404).json({ error: 'Document introuvable' });
    const { client, sdk, bucket } = r2();
    await client.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key: d.key }));
    // the list is rewritten without this document (no $pull: works on every MongoDB-compatible database)
    await OrderTracking.updateOne({ _id: t._id }, { $set: { documents: t.documents.filter(x => String(x._id) !== req.params.docId) } });
    res.json({ success: true, storage: usageView(await docUsage(true)) });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ==================== CLIENT ROUTES ====================
app.get('/api/clients', async (req, res) => {
  try { res.json(await Client.find().populate('companyId').sort({ name: 1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/clients/:id', async (req, res) => {
  try {
    const c = await Client.findById(req.params.id).populate('companyId');
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/clients', async (req, res) => {
  try { const c = new Client(req.body); await c.save(); await c.populate('companyId'); res.status(201).json(c); }
  catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});
app.put('/api/clients/:id', async (req, res) => {
  try {
    const c = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('companyId');
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const c = await Client.findByIdAndDelete(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== DEVIS ROUTES ====================
app.get('/api/devis', async (req, res) => {
  try {
    const filter = {};
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.companyId) filter.companyId = req.query.companyId;
    if (req.query.status) filter.status = req.query.status;
    res.json(await Devis.find(filter).populate('clientId').populate('companyId').sort({ createdAt: -1 }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/devis/:id', async (req, res) => {
  try {
    const d = await Devis.findById(req.params.id).populate('clientId').populate('companyId');
    if (!d) return res.status(404).json({ error: 'Not found' });
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/devis', async (req, res) => {
  try { const d = new Devis(req.body); await d.save(); await d.populate('clientId'); await d.populate('companyId'); res.status(201).json(d); }
  catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});
app.put('/api/devis/:id', async (req, res) => {
  try {
    const d = await Devis.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('clientId').populate('companyId');
    if (!d) return res.status(404).json({ error: 'Not found' });
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/devis/:id', async (req, res) => {
  try {
    const d = await Devis.findByIdAndDelete(req.params.id);
    if (!d) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== PROJECT ROUTES ====================
app.get('/api/projects', async (req, res) => {
  try {
    const filter = {};
    if (req.query.companyId) filter.companyId = req.query.companyId;
    const projects = await Project.find(filter).populate('usedBars.itemId').populate('companyId').populate('clientId').sort({ createdAt: -1 });
    res.json(projects.map(p => p.toJSON()));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/projects/list', async (req, res) => {
  try {
    const { tab, status, page = 1, limit = 12, companyId, search, category } = req.query;
    const match = {};
    if (tab) match.tab = tab;
    if (companyId && mongoose.Types.ObjectId.isValid(companyId)) match.companyId = new mongoose.Types.ObjectId(companyId);
    if (status && status !== 'all') match.cachedStatus = status;
    if (search) match.$or = [
      { name: new RegExp(search, 'i') },
      { reference: new RegExp(search, 'i') },
    ];

    const pipeline = [
      { $match: match },
      { $lookup: { from: 'clients', localField: 'clientId', foreignField: '_id', as: 'client' } },
      { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
    ];

    const TGALU_RE = /infinite|tgalu/i;
    if (category === 'tgalu') {
      pipeline.push({ $match: { 'client.name': { $regex: TGALU_RE } } });
    } else if (category === 'particuliers') {
      pipeline.push({
        $match: {
          $or: [
            { client: { $exists: false } },
            { 'client.name': { $not: TGALU_RE } },
          ],
        },
      });
    }

    pipeline.push(
      { $lookup: { from: 'companies', localField: 'companyId', foreignField: '_id', as: 'company' } },
      { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: (Number(page) - 1) * Number(limit) },
            { $limit: Number(limit) },
            {
              $project: {
                name: 1, reference: 1, ralCode: 1, ralColor: 1, date: 1, tab: 1,
                cachedStatus: { $ifNull: ['$cachedStatus', 'non_entame'] },
                cachedTotalPieces: { $ifNull: ['$cachedTotalPieces', 0] },
                cachedEtatCounts: { $ifNull: ['$cachedEtatCounts', {}] },
                createdAt: 1,
                company: 1, client: 1,
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
        },
      }
    );

    const [result] = await Project.aggregate(pipeline);
    const total = result.totalCount[0]?.count || 0;

    const projects = result.data.map(p => ({
      id: p._id.toString(),
      name: p.name,
      reference: p.reference,
      ralCode: p.ralCode,
      ralColor: p.ralColor,
      date: p.date,
      tab: p.tab,
      status: p.cachedStatus,
      cachedTotalPieces: p.cachedTotalPieces,
      etatCounts: p.cachedEtatCounts || {},
      createdAt: p.createdAt,
      companyId: p.company ? { ...p.company, id: p.company._id?.toString(), _id: undefined } : null,
      clientId: p.client ? { ...p.client, id: p.client._id?.toString(), _id: undefined } : null,
    }));

    // Laquage summary per project card (bars sent to laquage, number of lots) — one indexed query for the page
    if (projects.length) {
      const laq = await LaquageBarres.find({ projectId: { $in: result.data.map(p => p._id) } })
        .select('projectId lots.status').lean();
      const byProject = new Map(laq.map(r => [String(r.projectId), r.lots || []]));
      for (const pr of projects) {
        const lots = byProject.get(pr.id) || [];
        const sent = lots.filter(l => l.status && l.status !== 'draft');
        if (sent.length) {
          // stage = least advanced lot: sent_to_laquage → received_laquage → returned_to_coord → received_coord
          pr.laquage = { lots: sent.length, stage: deriveLaquageRecordStatus(sent) };
        }
      }
    }

    res.json({ projects, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/projects/lite', async (req, res) => {
  try {
    const filter = {};
    if (req.query.companyId) filter.companyId = req.query.companyId;
    const projects = await Project.find(filter)
      .select('name reference ralCode ralColor companyId clientId')
      .populate('companyId', 'name color')
      .populate('clientId', 'name')
      .sort({ createdAt: -1 })
      .lean();
    res.json(projects.map(p => ({
      id: p._id.toString(),
      name: p.name,
      reference: p.reference,
      ralCode: p.ralCode,
      ralColor: p.ralColor,
      companyId: p.companyId ? { id: p.companyId._id.toString(), name: p.companyId.name, color: p.companyId.color } : null,
      clientId: p.clientId ? { id: p.clientId._id.toString(), name: p.clientId.name } : null,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/migrate/cached-status', requireAuth, requirePermission('admin.view'), async (req, res) => {
  const projects = await Project.find({});
  for (const p of projects) {
    await p.save(); // pre-save hook recomputes cachedStatus, cachedTotalPieces, cachedEtatCounts
  }
  res.json({ migrated: projects.length });
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const p = await Project.findById(req.params.id).populate('usedBars.itemId').populate('companyId').populate('clientId');
    if (!p) return res.status(404).json({ error: 'Project not found' });
    res.json(p.toJSON());
  } catch (e) { res.status(e.kind === 'ObjectId' ? 400 : 500).json({ error: e.message }); }
});
app.post('/api/projects', async (req, res) => {
  try {
    const p = new Project({
      name: req.body.name,
      reference: req.body.reference,
      ralCode: req.body.ralCode,
      ralColor: req.body.ralColor || '#ffffff',
      date: req.body.date,
      companyId: req.body.companyId || null,
      clientId: req.body.clientId || null,
      tab: req.body.tab || 'aluminium',        // ← ADD THIS
    });
    await p.save(); res.status(201).json(p.toJSON());
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});
app.put('/api/projects/:id', async (req, res) => {
  try {
    const p = await Project.findByIdAndUpdate(req.params.id, {
      name: req.body.name,
      reference: req.body.reference,
      ralCode: req.body.ralCode,
      ralColor: req.body.ralColor,
      date: req.body.date,
      companyId: req.body.companyId || null,
      clientId: req.body.clientId || null,
      tab: req.body.tab || 'aluminium',        // ← ADD THIS
    }, { new: true, runValidators: true })
      .populate('usedBars.itemId').populate('companyId').populate('clientId');
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
      await StockMovement.create({ itemId: bar.itemId, type: 'project_return', quantity: bar.quantity, balanceAfter: restored ? restored.quantity : 0, projectId: p._id, projectName: p.name });
    }
    await Project.findByIdAndDelete(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CHASSIS ROUTES ====================
app.post('/api/projects/:id/chassis', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const isMultiDim = !!req.body.multiDim && Array.isArray(req.body.variants) && req.body.variants.length > 0;

    const buildOne = (repere, largeur, hauteur, qty) => ({
      type: req.body.type,
      repere,
      quantity: qty,
      largeur: Number(largeur) || 0,
      hauteur: Number(hauteur) || 0,
      dimension: `${largeur}×${hauteur}`,
      keepAsOne: req.body.keepAsOne ?? null,
      multiDim: false,
      variants: [],
      components: req.body.components || [],
      profileSerie: req.body.profileSerie || '',
      allege: Number(req.body.allege) || 0,
      units: Array.from({ length: qty }, (_, i) => ({
        unitIndex: i, etat: req.body.etat || 'non_entame', deliveryDate: null, notes: ''
      })),
    });

    if (isMultiDim) {
      for (const v of req.body.variants) {
        project.chassis.push(buildOne(v.repere, v.largeur, v.hauteur, Number(v.quantity) || 1));
      }
    } else {
      project.chassis.push(buildOne(req.body.repere, req.body.largeur, req.body.hauteur, Number(req.body.quantity) || 1));
    }

    await project.save();
    res.status(201).json(await populateAndReturn(project));
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});

app.put('/api/projects/:id/chassis/:cid', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassis = project.chassis.id(req.params.cid);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });

    const isMultiDim = !!req.body.multiDim && Array.isArray(req.body.variants) && req.body.variants.length > 1;

    if (isMultiDim) {
      // First variant overwrites the existing row; the rest become new rows.
      const [first, ...rest] = req.body.variants;
      if (req.body.type !== undefined) chassis.type = req.body.type;
      chassis.repere = first.repere;
      chassis.largeur = Number(first.largeur) || 0;
      chassis.hauteur = Number(first.hauteur) || 0;
      chassis.dimension = `${first.largeur}×${first.hauteur}`;
      chassis.multiDim = false;
      chassis.variants = [];
      if (req.body.components !== undefined) chassis.components = req.body.components;
      if (req.body.profileSerie !== undefined) chassis.profileSerie = req.body.profileSerie || '';
      if (req.body.allege !== undefined) chassis.allege = Number(req.body.allege) || 0;
      const newQty = Number(first.quantity) || 1, oldQty = chassis.quantity;
      chassis.quantity = newQty;
      if (newQty > oldQty) for (let i = oldQty; i < newQty; i++) chassis.units.push({ unitIndex: i, etat: 'non_entame', deliveryDate: null, notes: '' });
      else if (newQty < oldQty) chassis.units = chassis.units.filter(u => u.unitIndex < newQty);

      for (const v of rest) {
        const qty = Number(v.quantity) || 1;
        project.chassis.push({
          type: req.body.type || chassis.type,
          repere: v.repere,
          quantity: qty,
          largeur: Number(v.largeur) || 0,
          hauteur: Number(v.hauteur) || 0,
          dimension: `${v.largeur}×${v.hauteur}`,
          keepAsOne: req.body.keepAsOne ?? null,
          multiDim: false,
          variants: [],
          components: req.body.components || [],
          profileSerie: req.body.profileSerie || '',
          allege: Number(req.body.allege) || 0,
          units: Array.from({ length: qty }, (_, i) => ({ unitIndex: i, etat: 'non_entame', deliveryDate: null, notes: '' })),
        });
      }
    } else {
      if (req.body.type !== undefined) chassis.type = req.body.type;
      if (req.body.repere !== undefined) chassis.repere = req.body.repere;
      if (req.body.largeur !== undefined) chassis.largeur = Number(req.body.largeur);
      if (req.body.hauteur !== undefined) chassis.hauteur = Number(req.body.hauteur);
      if (req.body.dimension !== undefined) chassis.dimension = req.body.dimension;
      if (req.body.keepAsOne !== undefined) chassis.keepAsOne = req.body.keepAsOne;
      chassis.multiDim = false;
      chassis.variants = [];
      if (req.body.components !== undefined) chassis.components = req.body.components;
      if (req.body.profileSerie !== undefined) chassis.profileSerie = req.body.profileSerie || '';
      if (req.body.allege !== undefined) chassis.allege = Number(req.body.allege) || 0;
      if (req.body.quantity !== undefined) {
        const newQty = Number(req.body.quantity), oldQty = chassis.quantity;
        chassis.quantity = newQty;
        if (newQty > oldQty) { for (let i = oldQty; i < newQty; i++) chassis.units.push({ unitIndex: i, etat: 'non_entame', deliveryDate: null, notes: '' }); }
        else if (newQty < oldQty) { chassis.units = chassis.units.filter(u => u.unitIndex < newQty); }
      }
    }

    await project.save();
    res.json(await populateAndReturn(project));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/projects/:id/chassis/:cid/units/:unitIndex', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassis = project.chassis.id(req.params.cid);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });
    const idx = parseInt(req.params.unitIndex, 10);
    let unit = chassis.units.find(u => u.unitIndex === idx);
    const isComposite = (chassis.components || []).length > 0;
    if (!unit) { chassis.units.push({ unitIndex: idx, etat: 'non_entame', deliveryDate: null, notes: '', componentStates: [] }); unit = chassis.units.find(u => u.unitIndex === idx); }
    if (req.body.etat !== undefined && !isComposite) { unit.etat = req.body.etat; unit.deliveryDate = req.body.etat === 'livre' ? (req.body.deliveryDate ? new Date(req.body.deliveryDate) : new Date()) : null; }
    if (req.body.deliveryDate !== undefined && req.body.etat === undefined) unit.deliveryDate = req.body.deliveryDate ? new Date(req.body.deliveryDate) : null;
    if (req.body.notes !== undefined) unit.notes = req.body.notes;
    if (req.body.atelierTable !== undefined) unit.atelierTable = req.body.atelierTable;
    await project.save(); res.json(await populateAndReturn(project));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/projects/:id/chassis/:cid/units/:unitIndex/components/:compIndex', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassis = project.chassis.id(req.params.cid);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });
    const numComps = (chassis.components || []).length;
    if (!numComps) return res.status(400).json({ error: 'Chassis is not composite' });
    const unitIdx = parseInt(req.params.unitIndex, 10); const compIdx = parseInt(req.params.compIndex, 10);
    if (compIdx < 0 || compIdx >= numComps) return res.status(400).json({ error: 'Invalid component index' });
    let unit = chassis.units.find(u => u.unitIndex === unitIdx);
    if (!unit) { chassis.units.push({ unitIndex: unitIdx, etat: 'non_entame', deliveryDate: null, notes: '', componentStates: Array.from({ length: numComps }, (_, ci) => ({ compIndex: ci, etat: 'non_entame' })) }); unit = chassis.units.find(u => u.unitIndex === unitIdx); }
    if (!unit.componentStates) unit.componentStates = [];
    let cs = unit.componentStates.find(c => c.compIndex === compIdx);
    if (!cs) { unit.componentStates.push({ compIndex: compIdx, etat: 'non_entame', deliveryDate: null }); cs = unit.componentStates.find(c => c.compIndex === compIdx); }
    if (req.body.etat !== undefined) { cs.etat = req.body.etat; cs.deliveryDate = req.body.etat === 'livre' ? (req.body.deliveryDate ? new Date(req.body.deliveryDate) : new Date()) : null; }
    if (req.body.atelierTable !== undefined) cs.atelierTable = req.body.atelierTable;
    unit.etat = deriveCompositeUnitEtat(unit, numComps);
    if (unit.etat === 'livre') { const dates = (unit.componentStates || []).map(c => c.deliveryDate).filter(Boolean); unit.deliveryDate = dates.length ? new Date(Math.max(...dates.map(d => new Date(d)))) : new Date(); }
    else { unit.deliveryDate = null; }
    await project.save(); res.json(await populateAndReturn(project));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/projects/:id/chassis/:cid', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassis = project.chassis.id(req.params.cid);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });
    project.chassis.pull(req.params.cid); await project.save();
    res.json(await populateAndReturn(project));
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// rooooooooooouttttttttttes

// Suppliers list — same visibility rule, so the search/labels work for receivers too
app.get('/api/fournisseurs', requireAuth, requireOrdersView, async (req, res) => {
  try { res.json(await Fournisseur.find().sort({ name: 1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
// Only the supplier fields — nothing else from the request body is stored
const SUPPLIER_FIELDS = ['name', 'code', 'contact', 'phone', 'email', 'address', 'city', 'ice', 'rc', 'notes'];
const cleanSupplier = (body = {}) => {
  const out = Object.fromEntries(SUPPLIER_FIELDS.filter(k => body[k] !== undefined).map(k => [k, String(body[k] ?? '').trim()]));
  Object.assign(out, cleanPaymentTerms(body));
  return out;
};
// Payment term only (what the accountant may change): days (empty = not set) + "fin de mois"
function cleanPaymentTerms(body = {}) {
  const out = {};
  if (body.delaiPaiement !== undefined) {
    if (body.delaiPaiement === null || body.delaiPaiement === '') out.delaiPaiement = null;
    else {
      const n = Math.round(Number(body.delaiPaiement));
      if (!Number.isFinite(n) || n < 0 || n > 365) { const e = new Error('Délai de paiement invalide (0 à 365 jours).'); e.status = 400; throw e; }
      out.delaiPaiement = n;
    }
  }
  if (body.finDeMois !== undefined) out.finDeMois = !!body.finDeMois;
  return out;
}
const sameName = (name, exceptId) => Fournisseur.findOne({
  name: new RegExp(`^${escapeRegex(String(name).trim())}$`, 'i'), ...(exceptId ? { _id: { $ne: exceptId } } : {}),
}).lean();

app.post('/api/fournisseurs', requireAuth, requirePermission('orders.edit'), async (req, res) => {
  try {
    const data = cleanSupplier(req.body);
    if (!data.name) return res.status(400).json({ error: 'Nom requis' });
    if (await sameName(data.name)) return res.status(409).json({ error: `Un fournisseur « ${data.name} » existe déjà.` });
    const f = await Fournisseur.create(data);
    res.status(201).json(f);
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});
// ACHAT edits everything; the accountant (orders.accounting) only the payment term
app.put('/api/fournisseurs/:id', requireAuth, requireAccounting, async (req, res) => {
  try {
    const full = isAdmin(req) || (req.permissions || []).includes('orders.edit');
    if (!full && SUPPLIER_FIELDS.some(k => req.body[k] !== undefined))
      return res.status(403).json({ error: 'Vous pouvez seulement modifier le délai de paiement.' });
    const data = full ? cleanSupplier(req.body) : cleanPaymentTerms(req.body);
    if (data.name !== undefined && !data.name) return res.status(400).json({ error: 'Nom requis' });
    if (data.name && await sameName(data.name, req.params.id)) return res.status(409).json({ error: `Un fournisseur « ${data.name} » existe déjà.` });
    const f = await Fournisseur.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!f) return res.status(404).json({ error: 'Not found' });
    // Orders keep the supplier name as text too: follow a rename
    if (data.name) await Order.updateMany({ supplierId: f._id }, { $set: { supplier: f.name } });
    res.json(f);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
// Delete: refused while orders use the supplier. Articles holding a code at this supplier:
// the first call answers 409 with their number, ?force=1 removes those codes then deletes.
app.delete('/api/fournisseurs/:id', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const sup = await Fournisseur.findById(req.params.id).select('name').lean();
    if (!sup) return res.status(404).json({ error: 'Not found' });
    // orders linked by id, and older orders that only carry the supplier name
    const inUse = await Order.countDocuments({ $or: [{ supplierId: sup._id }, { supplierId: null, supplier: new RegExp(`^${escapeRegex(sup.name.trim())}$`, 'i') }] });
    if (inUse > 0) return res.status(400).json({ error: `Ce fournisseur est utilisé par ${inUse} commande(s).` });
    const items = await Item.countDocuments({ 'supplierCodes.supplierId': sup._id });
    if (items > 0 && req.query.force !== '1') return res.status(409).json({ error: 'ITEMS_LINKED', items });
    if (items > 0) {
      const linked = await Item.find({ 'supplierCodes.supplierId': sup._id }).select('supplierCodes').lean();
      await Item.bulkWrite(linked.map(it => ({
        updateOne: { filter: { _id: it._id }, update: { $set: { supplierCodes: (it.supplierCodes || []).filter(sc => String(sc.supplierId) !== String(sup._id)) } } },
      })));
    }
    await Fournisseur.findByIdAndDelete(req.params.id);
    res.json({ success: true, itemsUnlinked: items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Supplier figures (Commandes › Fournisseurs) ──────────────────────────────
// An order belongs to a supplier by its supplierId, or — older orders without id — by the same supplier name.
const orderAmount = (o) => (o.lines || []).reduce((s, l) => s + (l.quantityOrdered || 0) * (l.unitPrice || 0), 0);
const supplierKey = (v) => String(v || '').trim().toLowerCase();
function orderStatusLate(o, today) {
  return (o.status === 'envoye' || o.status === 'partielle') && o.expectedDate && new Date(o.expectedDate) < today;
}

// GET /api/fournisseurs/stats → { [supplierId]: { orders, open, late, amount, lastOrder, items } }
app.get('/api/fournisseurs/stats', requireAuth, requireAccounting, async (req, res) => {
  try {
    const [suppliers, orders, items] = await Promise.all([
      Fournisseur.find().select('name').lean(),
      Order.find({ status: { $nin: ['brouillon', 'annulee'] } }).select('supplierId supplier status orderDate sentAt expectedDate lines.quantityOrdered lines.unitPrice').lean(),
      Item.find({ 'supplierCodes.0': { $exists: true } }).select('supplierCodes.supplierId').lean(),
    ]);
    const byName = new Map(suppliers.map(f => [supplierKey(f.name), String(f._id)]));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const out = Object.fromEntries(suppliers.map(f => [String(f._id), { orders: 0, open: 0, late: 0, amount: 0, lastOrder: null, items: 0 }]));
    for (const o of orders) {
      const id = o.supplierId ? String(o.supplierId) : byName.get(supplierKey(o.supplier));
      const r = out[id];
      if (!r) continue;
      r.orders++;
      if (o.status === 'envoye' || o.status === 'partielle') r.open++;
      if (orderStatusLate(o, today)) r.late++;
      r.amount += orderAmount(o);
      const d = o.sentAt || o.orderDate;
      if (d && (!r.lastOrder || new Date(d) > new Date(r.lastOrder))) r.lastOrder = d;
    }
    for (const it of items) {
      const seen = new Set();
      for (const sc of it.supplierCodes || []) { const id = String(sc.supplierId); if (!seen.has(id) && out[id]) { seen.add(id); out[id].items++; } }
    }
    // Payments (same rows and rules as the Suivi table)
    for (const r of Object.values(out)) { r.toPay = 0; r.payLate = 0; r.payLateAmount = 0; }
    for (const row of await buildTrackingRows({ status: { $ne: 'brouillon' } })) {
      const r = row.supplierId && out[row.supplierId];
      if (!r || !isToPay(row)) continue;
      r.toPay += row.reste;
      if (row.retardJours > 0) { r.payLate++; r.payLateAmount += row.reste; }
    }
    for (const r of Object.values(out)) {
      r.amount = Math.round(r.amount * 100) / 100; r.toPay = Math.round(r.toPay * 100) / 100; r.payLateAmount = Math.round(r.payLateAmount * 100) / 100;
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fournisseurs/:id/details → supplier + its orders (most recent first) + the articles it supplies
app.get('/api/fournisseurs/:id/details', requireAuth, requireAccounting, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Fournisseur invalide' });
    const f = await Fournisseur.findById(req.params.id);
    if (!f) return res.status(404).json({ error: 'Not found' });
    const nameRx = new RegExp(`^${escapeRegex(f.name.trim())}$`, 'i');
    const [orders, items] = await Promise.all([
      Order.find({ $or: [{ supplierId: f._id }, { supplierId: null, supplier: nameRx }] })
        .select('number reference status orderDate sentAt expectedDate lines.quantityOrdered lines.quantityReceived lines.unitPrice lines.closed companyId')
        .populate('companyId', 'name color').sort({ orderDate: -1, createdAt: -1 }).limit(200).lean(),
      Item.find({ 'supplierCodes.supplierId': f._id })
        .select('designation codeInterne image quantity threshold superCategory supplierCodes').sort({ 'designation.fr': 1 }).limit(500).lean(),
    ]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    res.json({
      supplier: f,
      orders: orders.map(o => {
        const ordered = (o.lines || []).reduce((s, l) => s + (l.quantityOrdered || 0), 0);
        const received = (o.lines || []).reduce((s, l) => s + Math.min(l.quantityReceived || 0, l.quantityOrdered || 0), 0);
        return {
          id: String(o._id), number: o.number || '', reference: o.reference || '', status: o.status,
          orderDate: o.orderDate, sentAt: o.sentAt, expectedDate: o.expectedDate,
          amount: Math.round(orderAmount(o) * 100) / 100, lines: (o.lines || []).length,
          receivedPct: ordered ? Math.round((received / ordered) * 100) : 0, late: !!orderStatusLate(o, today),
          company: o.companyId ? { name: o.companyId.name, color: o.companyId.color } : null,
        };
      }),
      items: items.map(it => ({
        id: String(it._id), designation: it.designation, code: it.codeInterne || '', image: it.image || '',
        quantity: it.quantity || 0, threshold: it.threshold || 0, superCategory: it.superCategory,
        supplierCode: (it.supplierCodes || []).find(sc => String(sc.supplierId) === String(f._id))?.code || '',
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* ─────────────────────────────────────────────────────────────────────────
 * 8) BC NUMBERING CONFIG ROUTES (admin)  →  ADD
 * ───────────────────────────────────────────────────────────────────────── */
// Read every company's BC config (for the admin settings screen)
app.get('/api/bc-config', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: 1 });
    res.json(companies.map(c => ({
      companyId: c._id, name: c.name,
      bcConfig: c.bcConfig || { start: 1, next: null, prefix: '', suffix: '', padding: 0 },
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Set a company's start number / format. Resets `next` to `start`.
app.put('/api/bc-config/:companyId', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const { start, prefix, suffix, padding } = req.body;
    const startN = Number(start);
    if (!Number.isFinite(startN)) return res.status(400).json({ error: 'Numéro de départ invalide' });
    const c = await Company.findByIdAndUpdate(
      req.params.companyId,
      { $set: { bcConfig: { start: startN, next: startN, prefix: prefix || '', suffix: suffix || '', padding: Number(padding) || 0 } } },
      { new: true }
    );
    if (!c) return res.status(404).json({ error: 'Société introuvable' });
    res.json({ companyId: c._id, name: c.name, bcConfig: c.bcConfig });
  } catch (e) { res.status(500).json({ error: e.message }); }
});





// rooooooooooouttttttttttes



// ==================== CHASSIS ACCESSORIES ====================
app.get('/api/projects/:id/chassis/:cid/accessories', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassis = project.chassis.id(req.params.cid);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });
    res.json(chassis.accessories || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/projects/:id/chassis/:cid/accessories', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassis = project.chassis.id(req.params.cid);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });
    chassis.accessories = (req.body.accessories || []).map(a => {
      const hasFormula = a.formula && a.formula.trim() !== '';
      return { itemId: a.itemId || '', label: a.label || '', unit: a.unit || '', quantity: hasFormula ? 0 : (Number(a.quantity) || 0), formula: hasFormula ? a.formula.trim() : '' };
    });
    await project.save(); res.json(chassis.accessories);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== BONS DE LIVRAISON ====================
app.get('/api/projects/:id/bons-livraison', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate('usedBars.itemId').populate('companyId').populate('clientId');
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassisTypes = await ChassisType.find().lean();
    const typeLabel = (v) => { const ct = chassisTypes.find(t => t.value === v); return ct ? (ct.fr || ct.value) : v; };
    const blMap = {};
    const ensureBL = (dateKey) => {
      if (!blMap[dateKey]) blMap[dateKey] = { blId: `BL-${project._id.toString().slice(-6).toUpperCase()}-${dateKey.replace(/-/g, '')}`, projectId: project._id, projectName: project.name, reference: project.reference, ralCode: project.ralCode, ralColor: project.ralColor, company: project.companyId || null, client: project.clientId || null, deliveryDate: dateKey, units: [] };
      return blMap[dateKey];
    };

    const m2 = (l, h) => l && h ? parseFloat(((l * h) / 1e6).toFixed(2)) : null;

    for (const chassis of project.chassis) {
      const isComposite = (chassis.components || []).length > 0;
      const unitSuffix = (idx) => (chassis.quantity > 1 && !chassis.keepAsOne) ? ` #${idx + 1}` : '';
      const designation = typeLabel(chassis.type);
      const remplissages = chassis.remplissages || [];

      const isKeepAsOneGroup = isComposite ? false : (chassis.keepAsOne === true && (chassis.quantity || 1) > 1);
      const groupQty = chassis.quantity || 1;

      // Only iterate the representative unit (index 0) for a grouped ×N chassis;
      // otherwise iterate every unit as before.
      const unitsToProcess = isKeepAsOneGroup
        ? (chassis.units || []).filter(u => u.unitIndex === 0)
        : (chassis.units || []);

      for (const unit of unitsToProcess) {
        if (!isComposite) {
          const rowQty = isKeepAsOneGroup ? groupQty : 1;
          const unitRemplissages = remplissages.filter(r => (r.unitIndex ?? 0) === unit.unitIndex && r.compIndex == null);

          if (unit.etat === 'livre' && unit.deliveryDate) {
            const dateKey = new Date(unit.deliveryDate).toISOString().split('T')[0];
            const undeliveredRempLabels = unitRemplissages
              .filter(r => {
                if (r.etat !== 'livre' || !r.deliveryDate) return true;
                const rDateKey = new Date(r.deliveryDate).toISOString().split('T')[0];
                return rDateKey !== dateKey;
              })
              .map(r => r.sousType ? `${r.type} (${r.sousType})` : r.type);
            const autoNote = undeliveredRempLabels.length > 0
              ? `sans remplissage (${undeliveredRempLabels.join(', ')})`
              : '';
            const chassisDim = chassis.dimension || `${chassis.largeur}×${chassis.hauteur}`;
            const unitM2 = m2(chassis.largeur, chassis.hauteur);
            const chassisM2 = unitM2 != null ? parseFloat((unitM2 * rowQty).toFixed(2)) : null;

            ensureBL(dateKey).units.push({
              chassisId: chassis._id, chassisRepere: chassis.repere, chassisType: designation,
              dimension: chassisDim, m2: chassisM2, quantity: rowQty,
              unitIndex: unit.unitIndex,
              unitLabel: rowQty > 1
                ? `${chassis.repere} ×${rowQty}`
                : `${chassis.repere}${unitSuffix(unit.unitIndex)}`,
              deliveryDate: unit.deliveryDate, notes: unit.notes || autoNote, isComponent: false,
            });

            // Same-date remplissages for this unit (unchanged — remplissages are
            // independent records and were never duplicated by the qty bug)
            for (const r of unitRemplissages) {
              if (!r.deliveryDate) continue;
              const rDateKey = new Date(r.deliveryDate).toISOString().split('T')[0];
              if (r.etat === 'livre' && rDateKey === dateKey) {
                const rLabel = r.sousType ? `${r.type} — ${r.sousType}` : r.type;
                ensureBL(dateKey).units.push({
                  chassisId: chassis._id, chassisRepere: chassis.repere,
                  chassisType: `↳ Remplissage ${rLabel}`,
                  dimension: `${r.largeur}×${r.hauteur}`, m2: m2(r.largeur, r.hauteur), quantity: 1,
                  unitIndex: unit.unitIndex,
                  unitLabel: `${chassis.repere}${unitSuffix(unit.unitIndex)} — ${rLabel}`,
                  deliveryDate: r.deliveryDate, notes: '', isComponent: false, isRemplissage: true,
                  remplissageId: r._id,
                });
              }
            }
          }

          // Different-date remplissages for this unit (unchanged)
          for (const r of unitRemplissages) {
            if (!r.deliveryDate || r.etat !== 'livre') continue;
            const rDateKey = new Date(r.deliveryDate).toISOString().split('T')[0];
            const parentDelivered = unit.etat === 'livre' && unit.deliveryDate
              ? new Date(unit.deliveryDate).toISOString().split('T')[0]
              : null;
            if (parentDelivered === rDateKey) continue;
            const already = blMap[rDateKey]?.units.some(u => u.remplissageId?.toString() === r._id.toString());
            if (already) continue;
            const rLabel = r.sousType ? `${r.type} — ${r.sousType}` : r.type;
            ensureBL(rDateKey).units.push({
              chassisId: chassis._id, chassisRepere: chassis.repere,
              chassisType: `↳ Remplissage ${rLabel} (${designation})`,
              dimension: `${r.largeur}×${r.hauteur}`, m2: m2(r.largeur, r.hauteur), quantity: 1,
              unitIndex: unit.unitIndex,
              unitLabel: `${chassis.repere}${unitSuffix(unit.unitIndex)} — ${rLabel}`,
              deliveryDate: r.deliveryDate, notes: '', isComponent: false, isRemplissage: true,
              remplissageId: r._id,
            });
          }


        } else {
          // Composite chassis — iterate every component definition (not just delivered ones)
          // so that remplissages can appear in BL even when their parent component isn't yet delivered.
          const numComps = chassis.components.length;
          for (let ci = 0; ci < numComps; ci++) {
            const comp = chassis.components[ci];
            if (!comp) continue;
            const cs = (unit.componentStates || []).find(c => c.compIndex === ci) || { compIndex: ci, etat: 'non_entame', deliveryDate: null };
            const roleLabel = comp.role === 'dormant' ? 'Dormant' : `Vantail ${ci}`;
            const compRepere = comp.repere || roleLabel;
            const compDim = comp.largeur && comp.hauteur ? `${comp.largeur}×${comp.hauteur}` : (chassis.dimension || `${chassis.largeur}×${chassis.hauteur}`);
            const compM2 = comp.largeur && comp.hauteur ? m2(comp.largeur, comp.hauteur) : m2(chassis.largeur, chassis.hauteur);

            // Emit the component itself when delivered
            if (cs.etat === 'livre' && cs.deliveryDate) {
              const dateKey = new Date(cs.deliveryDate).toISOString().split('T')[0];
              ensureBL(dateKey).units.push({
                chassisId: chassis._id, chassisRepere: chassis.repere, chassisType: designation,
                dimension: compDim, m2: compM2,
                unitIndex: unit.unitIndex, compIndex: ci,
                unitLabel: `${chassis.repere}${unitSuffix(unit.unitIndex)} — ${compRepere}`,
                deliveryDate: cs.deliveryDate, notes: unit.notes || '', isComponent: true, role: roleLabel,
              });
            }

            // Emit remplissages for this component independently of the component's own delivery state
            const compRemplissages = remplissages.filter(r =>
              (r.unitIndex ?? 0) === unit.unitIndex && r.compIndex === ci
            );
            for (const r of compRemplissages) {
              if (!r.deliveryDate || r.etat !== 'livre') continue;
              const rDateKey = new Date(r.deliveryDate).toISOString().split('T')[0];
              const already = blMap[rDateKey]?.units.some(u => u.remplissageId?.toString() === r._id.toString());
              if (already) continue;
              const rLabel = r.sousType ? `${r.type} — ${r.sousType}` : r.type;
              // Note whether the parent component was NOT delivered on the same date
              const parentDeliveredSameDate = cs.etat === 'livre' && cs.deliveryDate &&
                new Date(cs.deliveryDate).toISOString().split('T')[0] === rDateKey;
              const rNote = parentDeliveredSameDate ? '' : `sans cadre (${compRepere})`;
              ensureBL(rDateKey).units.push({
                chassisId: chassis._id, chassisRepere: chassis.repere,
                chassisType: `↳ Remplissage ${rLabel} (${compRepere})`,
                dimension: `${r.largeur}×${r.hauteur}`, m2: m2(r.largeur, r.hauteur),
                unitIndex: unit.unitIndex, compIndex: ci,
                unitLabel: `${chassis.repere}${unitSuffix(unit.unitIndex)} — ${compRepere} — ${rLabel}`,
                deliveryDate: r.deliveryDate, notes: rNote, isComponent: true, isRemplissage: true,
                remplissageId: r._id,
              });
            }
          }
        }
      }
    }

    // Sort units within each BL
    for (const bl of Object.values(blMap)) {
      bl.units.sort((a, b) => {
        const aKey = `${a.chassisRepere}-${a.unitIndex}-${a.compIndex ?? -1}-${a.isRemplissage ? 1 : 0}`;
        const bKey = `${b.chassisRepere}-${b.unitIndex}-${b.compIndex ?? -1}-${b.isRemplissage ? 1 : 0}`;
        return aKey.localeCompare(bKey, 'fr', { numeric: true });
      });
    }

    res.json(Object.values(blMap).sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Remplissage CRUD ──────────────────────────────────────────────────────────

/** GET all remplissages for a chassis, with optional unitIndex and compIndex filters */
app.get('/api/projects/:projectId/chassis/:chassisId/remplissages', async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassis = project.chassis.id(req.params.chassisId);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });
    let remplissages = chassis.remplissages || [];

    if (req.query.unitIndex !== undefined) {
      const ui = parseInt(req.query.unitIndex, 10);
      remplissages = remplissages.filter(r => (r.unitIndex ?? 0) === ui);
    }

    if (req.query.compIndex !== undefined) {
      // Fetch remplissages for a specific component of a composite chassis
      const ci = parseInt(req.query.compIndex, 10);
      remplissages = remplissages.filter(r => r.compIndex === ci);
    } else if (req.query.unitIndex !== undefined) {
      // Fetching for a non-composite unit: exclude any that belong to a component
      remplissages = remplissages.filter(r => r.compIndex == null);
    }

    res.json(remplissages);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST — add a remplissage (supports compIndex for composite chassis components) */
app.post('/api/projects/:projectId/chassis/:chassisId/remplissages', async (req, res) => {
  try {
    const { type, sousType, largeur, hauteur, etat, unitIndex, compIndex } = req.body;
    if (!type || !largeur || !hauteur) return res.status(400).json({ error: 'type, largeur and hauteur are required' });
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassis = project.chassis.id(req.params.chassisId);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });
    chassis.remplissages.push({
      type,
      sousType: sousType || '',
      largeur: Number(largeur),
      hauteur: Number(hauteur),
      etat: etat || 'non_entame',
      deliveryDate: null,
      unitIndex: unitIndex !== undefined ? Number(unitIndex) : 0,
      compIndex: compIndex !== undefined ? Number(compIndex) : null, // null = non-composite
    });
    await project.save();
    res.status(201).json(chassis.remplissages[chassis.remplissages.length - 1]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** PATCH — update etat / deliveryDate / fields of one remplissage */
app.patch('/api/projects/:projectId/chassis/:chassisId/remplissages/:remplissageId', async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassis = project.chassis.id(req.params.chassisId);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });
    const remp = chassis.remplissages.id(req.params.remplissageId);
    if (!remp) return res.status(404).json({ error: 'Remplissage not found' });
    const allowed = ['type', 'sousType', 'largeur', 'hauteur', 'etat', 'deliveryDate', 'atelierTable'];
    for (const k of allowed) { if (req.body[k] !== undefined) remp[k] = req.body[k]; }
    await project.save();
    res.json(remp);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** DELETE one remplissage */
app.delete('/api/projects/:projectId/chassis/:chassisId/remplissages/:remplissageId', async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassis = project.chassis.id(req.params.chassisId);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });
    chassis.remplissages.pull(req.params.remplissageId);
    await project.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== USED BARS ====================
app.post('/api/projects/:id/bars', async (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    if (!itemId || !quantity || quantity <= 0) return res.status(400).json({ error: 'itemId and quantity (>0) required' });
    const [project, item] = await Promise.all([Project.findById(req.params.id), Item.findById(itemId)]);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.quantity < quantity) return res.status(400).json({ error: 'Insufficient stock', available: item.quantity });
    const existing = project.usedBars.find(b => b.itemId.toString() === itemId.toString());
    if (existing) { existing.quantity += Number(quantity); } else { project.usedBars.push({ itemId, quantity: Number(quantity) }); }
    item.quantity = Math.max(0, item.quantity - Number(quantity));
    await Promise.all([item.save(), project.save()]);
    await StockMovement.create({ itemId: item._id, type: 'project_use', quantity: Number(quantity), balanceAfter: item.quantity, projectId: project._id, projectName: project.name });
    await project.populate('usedBars.itemId'); await project.populate('companyId'); await project.populate('clientId');
    res.status(201).json(project.toJSON());
  } catch (e) { res.status(e.kind === 'ObjectId' ? 400 : 500).json({ error: e.message }); }
});
app.delete('/api/projects/:id/bars/:itemId', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const barEntry = project.usedBars.find(b => b.itemId.toString() === req.params.itemId);
    if (!barEntry) return res.status(404).json({ error: 'Bar not in project' });
    const restoredItem = await Item.findByIdAndUpdate(req.params.itemId, { $inc: { quantity: barEntry.quantity } }, { new: true });
    await StockMovement.create({ itemId: req.params.itemId, type: 'project_return', quantity: barEntry.quantity, balanceAfter: restoredItem ? restoredItem.quantity : 0, projectId: project._id, projectName: project.name });
    project.usedBars = project.usedBars.filter(b => b.itemId.toString() !== req.params.itemId);
    await project.save(); await project.populate('usedBars.itemId'); await project.populate('companyId'); await project.populate('clientId');
    res.json(project.toJSON());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CHASSIS TYPE ROUTES ====================
app.get('/api/chassis-types', async (req, res) => {
  try {
    const types = await ChassisType.find().sort({ order: 1, createdAt: 1 });
    const ids = types.map(t => t._id);
    const counts = await ChassisTypeAccessory.aggregate([{ $match: { chassisTypeId: { $in: ids } } }, { $group: { _id: '$chassisTypeId', count: { $sum: 1 } } }]);
    const countMap = Object.fromEntries(counts.map(c => [c._id.toString(), c.count]));
    res.json(types.map(t => ({ ...t.toObject(), accessoryCount: countMap[t._id.toString()] || 0 })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/chassis-types', async (req, res) => {
  try {
    const { value, fr, it, en, composite, vantaux } = req.body;
    if (!value || !fr) return res.status(400).json({ error: 'value and fr are required' });
    const count = await ChassisType.countDocuments();
    const ct = new ChassisType({ value, fr, it: it || fr, en: en || fr, composite: !!composite, vantaux: composite ? (Number(vantaux) || 2) : 0, order: count });
    await ct.save(); res.status(201).json(ct);
  } catch (e) { if (e.code === 11000) return res.status(409).json({ error: 'Type value already exists' }); res.status(500).json({ error: e.message }); }
});
app.put('/api/chassis-types/:id', async (req, res) => {
  try {
    const ct = await ChassisType.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!ct) return res.status(404).json({ error: 'Not found' });
    res.json(ct);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/chassis-types/:id', async (req, res) => {
  try { await ChassisType.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CHASSIS TYPE ACCESSORIES ====================
app.get('/api/chassis-type-defaults/:typeValue', async (req, res) => {
  try {
    const ct = await ChassisType.findOne({ value: req.params.typeValue });
    if (!ct) return res.json([]);
    const accs = await ChassisTypeAccessory.find({ chassisTypeId: ct._id });
    res.json(accs.map(a => ({ itemId: a.itemId ? a.itemId.toString() : '', label: a.label, unit: a.unit, quantity: a.quantity || 0, formula: a.formula || '' })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/chassis-type-accessories/:chassisTypeId', async (req, res) => {
  try {
    const accs = await ChassisTypeAccessory.find({ chassisTypeId: req.params.chassisTypeId });
    res.json(accs.map(a => ({ itemId: a.itemId ? a.itemId.toString() : '', label: a.label, unit: a.unit, quantity: a.quantity || 0, formula: a.formula || '' })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/chassis-type-accessories/:chassisTypeId', async (req, res) => {
  try {
    const { chassisTypeId } = req.params; const { accessories = [] } = req.body;
    await ChassisTypeAccessory.deleteMany({ chassisTypeId });
    if (accessories.length > 0) await ChassisTypeAccessory.insertMany(accessories.map(a => ({ chassisTypeId, ...a })));
    res.json({ ok: true, count: accessories.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== STOCK MOVEMENT ROUTES ====================
// ==================== STOCK MOVEMENTS ====================
// Every filter is applied by the server (article search, super-category, category, types, dates), so the
// count is exact and "load more" only brings rows of the same search. Pages use a cursor (date + id).
const MOVE_TYPES = ['entree', 'sortie', 'project_use', 'project_return', 'order_reception', 'initial', 'correction_plus', 'correction_moins'];
// Day boundaries in the user's time zone (tz = minutes from Date#getTimezoneOffset, sent by the page)
const mvTz = (req) => { const v = parseInt(req.query.tz, 10); return Number.isFinite(v) && Math.abs(v) <= 840 ? v : 0; };
const mvDayStart = (d, tz = 0) => { const x = new Date(`${d}T00:00:00Z`); return isNaN(x) ? null : new Date(x.getTime() + tz * 60000); };
const mvDayEnd = (d, tz = 0) => { const x = mvDayStart(d, tz); return x ? new Date(x.getTime() + 86400000 - 1) : null; };

// Articles the request may see, narrowed by super-category / category / search text. null = no restriction.
async function mvItemScope(req, { superCategory, categoryId, q } = {}) {
  const allowed = await resolveAllowedSCs(req.permissions || []);
  const f = {};
  if (superCategory && superCategory !== 'all') {
    if (allowed !== null && !allowed.includes(superCategory)) return [];
    f.superCategory = superCategory;
  } else if (allowed !== null) f.superCategory = { $in: allowed };
  if (categoryId && categoryId !== 'all' && mongoose.Types.ObjectId.isValid(categoryId)) f.categoryId = categoryId;
  const words = normalizeSearch(q).split(' ').filter(Boolean).slice(0, 8);
  if (words.length) f.$and = words.map(w => ({ searchText: { $regex: escapeRegex(w) } }));
  if (!Object.keys(f).length) return null;
  return (await Item.find(f).select('_id').lean()).map(i => i._id);
}

async function mvFilter(req) {
  const { type, from, to, q, superCategory, categoryId, itemId } = req.query;
  const filter = {};
  const types = String(type || '').split(',').filter(x => MOVE_TYPES.includes(x));
  if (types.length) filter.type = { $in: types };
  const tz = mvTz(req);
  const a = from ? mvDayStart(from, tz) : null, b = to ? mvDayEnd(to, tz) : null;
  if (a || b) { filter.createdAt = {}; if (a) filter.createdAt.$gte = a; if (b) filter.createdAt.$lte = b; }
  if (itemId && mongoose.Types.ObjectId.isValid(itemId)) {
    filter.itemId = new mongoose.Types.ObjectId(itemId);
    return filter;
  }
  // Scope (permissions, super-category, category) — then the text search: article OR project OR note
  const scope = await mvItemScope(req, { superCategory, categoryId });
  if (scope) filter.itemId = { $in: scope };
  const text = String(q || '').trim();
  if (text) {
    const hits = await mvItemScope(req, { superCategory, categoryId, q: text });
    const rx = new RegExp(escapeRegex(text), 'i');
    filter.$or = [{ itemId: { $in: hits || [] } }, { projectName: rx }, { note: rx }];
  }
  return filter;
}

const toMovement = (m) => ({
  id: String(m._id), type: m.type, quantity: m.quantity, sign: moveSign(m.type), balanceAfter: m.balanceAfter,
  note: m.note || '', user: m.user || '', projectId: m.projectId ? String(m.projectId) : null, projectName: m.projectName || '',
  orderId: m.orderId ? String(m.orderId) : null, createdAt: m.createdAt,
  item: m.itemId && typeof m.itemId === 'object' && m.itemId.designation
    ? { id: String(m.itemId._id), designation: m.itemId.designation, code: m.itemId.codeInterne || '', superCategory: m.itemId.superCategory || '', categoryId: m.itemId.categoryId ? String(m.itemId.categoryId) : null }
    : null,
});

// GET /api/movements?q=&type=a,b&from=YYYY-MM-DD&to=&superCategory=&categoryId=&itemId=&limit=50&cursor=<iso>|<id>
//   First page (no cursor): + total (exact), byType (number of movements per type), activity (in / out per day, week or month)
//   export=1: up to 10 000 rows, no cursor (Excel export)
app.get('/api/movements', optionalAuth, async (req, res) => {
  try {
    const base = await mvFilter(req);
    const exporting = req.query.export === '1';
    const limit = exporting ? 10000 : Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const filter = { ...base };
    const [cAt, cId] = String(req.query.cursor || '').split('|');
    if (!exporting && cAt && cId && mongoose.Types.ObjectId.isValid(cId)) {
      const d = new Date(cAt);
      const after = { $or: [{ createdAt: { $lt: d } }, { createdAt: d, _id: { $lt: new mongoose.Types.ObjectId(cId) } }] };
      filter.$and = [...(filter.$and || []), after];
    }
    const rows = await StockMovement.find(filter)
      .populate('itemId', 'designation codeInterne superCategory categoryId')
      .sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const out = {
      movements: page.map(toMovement),
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit && last ? `${new Date(last.createdAt).toISOString()}|${last._id}` : null,
    };
    if (!cAt && !exporting) {
      // Exact figures for the whole filter (first page only): counted by the database, per local day and type
      const tz = mvTz(req);
      let perDay; // [{ day: 'YYYY-MM-DD', type, n }]
      try {
        const agg = await StockMovement.aggregate([
          { $match: base },
          { $group: { _id: { t: '$type', d: { $dateToString: { format: '%Y-%m-%d', date: { $subtract: ['$createdAt', tz * 60000] } } } }, n: { $sum: 1 } } },
        ]);
        perDay = agg.map(r => ({ day: r._id.d, type: r._id.t, n: r.n }));
      } catch {
        const light = await StockMovement.find(base).select('type createdAt').lean();
        const m = new Map();
        for (const x of light) {
          const day = new Date(new Date(x.createdAt).getTime() - tz * 60000).toISOString().slice(0, 10);
          const k = `${day}|${x.type}`; m.set(k, (m.get(k) || 0) + 1);
        }
        perDay = [...m].map(([k, n]) => { const [day, type] = k.split('|'); return { day, type, n }; });
      }
      out.total = perDay.reduce((a, r) => a + r.n, 0);
      out.byType = {};
      for (const r of perDay) out.byType[r.type] = (out.byType[r.type] || 0) + r.n;
      if (perDay.length) {
        const days = perDay.map(r => r.day).sort();
        const min = new Date(`${days[0]}T00:00:00Z`), max = new Date(`${days[days.length - 1]}T00:00:00Z`);
        const span = (max - min) / 86400000;
        const bucket = span <= 62 ? 'day' : span <= 400 ? 'week' : 'month';
        const keys = dashBuckets(min, new Date(max.getTime() + 86400000), bucket);
        const map = Object.fromEntries(keys.map(k => [k, { key: k, in: 0, out: 0 }]));
        for (const r of perDay) { const k = dashBucketKey(new Date(`${r.day}T00:00:00Z`), bucket); if (map[k]) map[k][moveSign(r.type) >= 0 ? 'in' : 'out'] += r.n; }
        out.activity = { bucket, series: keys.map(k => map[k]) };
      }
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Stock at a given date ────────────────────────────────────────────────────
// For each article: the stock recorded by its last movement on or before the date. With no movement
// before the date: the stock just before its first later movement, or today's stock when it never moved.
async function stockAt(itemIds, date) {
  const match = { createdAt: { $lte: date } };
  const later = { createdAt: { $gt: date } };
  if (itemIds) { match.itemId = { $in: itemIds }; later.itemId = { $in: itemIds }; }
  const lastBefore = new Map(), firstAfter = new Map();
  try {
    const [a, b] = await Promise.all([
      StockMovement.aggregate([{ $match: match }, { $sort: { itemId: 1, createdAt: -1, _id: -1 } }, { $group: { _id: '$itemId', bal: { $first: '$balanceAfter' } } }]),
      StockMovement.aggregate([{ $match: later }, { $sort: { itemId: 1, createdAt: 1, _id: 1 } }, { $group: { _id: '$itemId', bal: { $first: '$balanceAfter' }, type: { $first: '$type' }, qty: { $first: '$quantity' } } }]),
    ]);
    a.forEach(r => lastBefore.set(String(r._id), r.bal));
    b.forEach(r => firstAfter.set(String(r._id), r.bal - moveSign(r.type) * r.qty));
  } catch {
    // databases without $group/$first: same result in memory
    const rows = await StockMovement.find(itemIds ? { itemId: { $in: itemIds } } : {}).select('itemId createdAt balanceAfter type quantity').sort({ createdAt: 1, _id: 1 }).lean();
    for (const r of rows) {
      const id = String(r.itemId);
      if (new Date(r.createdAt) <= date) lastBefore.set(id, r.balanceAfter);
      else if (!firstAfter.has(id)) firstAfter.set(id, r.balanceAfter - moveSign(r.type) * r.quantity);
    }
  }
  return { lastBefore, firstAfter };
}
// Last recorded balance of each article (to spot stock changed without a movement, before this version)
async function lastBalances(itemIds) {
  const out = new Map();
  try {
    const r = await StockMovement.aggregate([{ $match: itemIds ? { itemId: { $in: itemIds } } : {} }, { $sort: { itemId: 1, createdAt: -1, _id: -1 } }, { $group: { _id: '$itemId', bal: { $first: '$balanceAfter' } } }]);
    r.forEach(x => out.set(String(x._id), x.bal));
  } catch {
    const rows = await StockMovement.find(itemIds ? { itemId: { $in: itemIds } } : {}).select('itemId balanceAfter createdAt').sort({ createdAt: 1, _id: 1 }).lean();
    rows.forEach(x => out.set(String(x.itemId), x.balanceAfter));
  }
  return out;
}

// GET /api/movements/snapshot?date=YYYY-MM-DD[&compare=YYYY-MM-DD][&q=&superCategory=&categoryId=]
app.get('/api/movements/snapshot', optionalAuth, async (req, res) => {
  try {
    const tz = mvTz(req);
    const date = mvDayEnd(req.query.date || new Date().toISOString().slice(0, 10), tz);
    if (!date) return res.status(400).json({ error: 'Date invalide' });
    const compare = req.query.compare ? mvDayEnd(req.query.compare, tz) : null;
    const scope = await mvItemScope(req, { superCategory: req.query.superCategory, categoryId: req.query.categoryId, q: req.query.q });
    const itemFilter = scope ? { _id: { $in: scope } } : {};
    const items = await Item.find(itemFilter).select('designation codeInterne superCategory categoryId quantity threshold createdAt').populate('categoryId', 'name color').lean();
    const ids = scope ? items.map(i => i._id) : null;
    const [atDate, atCompare, lastBal] = await Promise.all([stockAt(ids, date), compare ? stockAt(ids, compare) : null, lastBalances(ids)]);
    const value = (snap, it, d) => {
      const id = String(it._id);
      if (new Date(it.createdAt) > d) return null; // did not exist yet
      if (d.getTime() >= Date.now()) return it.quantity || 0; // today: the real current stock
      if (snap.lastBefore.has(id)) return snap.lastBefore.get(id);
      if (snap.firstAfter.has(id)) return snap.firstAfter.get(id);
      return it.quantity || 0;
    };
    const rows = items.map(it => {
      const id = String(it._id);
      const lb = lastBal.get(id);
      return {
        id, designation: it.designation, code: it.codeInterne || '', superCategory: it.superCategory || 'aluminium',
        category: it.categoryId ? { id: String(it.categoryId._id), name: it.categoryId.name, color: it.categoryId.color } : null,
        threshold: it.threshold || 0, current: it.quantity || 0,
        atDate: value(atDate, it, date),
        atCompare: compare ? value(atCompare, it, compare) : undefined,
        // today's stock differs from the last movement → the stock was changed without a trace (before this version)
        untracked: lb !== undefined && Math.abs((it.quantity || 0) - lb) > 1e-9,
      };
    });
    res.json({ date, compare, rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/movements/item/:itemId?from=&to= — article ledger: stock before the period, movements, stock after
app.get('/api/movements/item/:itemId', optionalAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.itemId)) return res.status(400).json({ error: 'Article invalide' });
    const item = await Item.findById(req.params.itemId).select('designation codeInterne superCategory categoryId quantity threshold orderedQuantity createdAt image').populate('categoryId', 'name color').lean();
    if (!item) return res.status(404).json({ error: 'Not found' });
    const allowed = await resolveAllowedSCs(req.permissions || []);
    if (allowed !== null && !allowed.includes(item.superCategory || 'aluminium')) return res.status(403).json({ error: 'Accès refusé' });
    const tz = mvTz(req);
    const from = req.query.from ? mvDayStart(req.query.from, tz) : null;
    const to = req.query.to ? mvDayEnd(req.query.to, tz) : null;
    const f = { itemId: item._id };
    if (from || to) { f.createdAt = {}; if (from) f.createdAt.$gte = from; if (to) f.createdAt.$lte = to; }
    const moves = await StockMovement.find(f).sort({ createdAt: 1, _id: 1 }).limit(5000).lean();
    let opening;
    if (from) {
      const snap = await stockAt([item._id], new Date(from.getTime() - 1));
      const id = String(item._id);
      opening = new Date(item.createdAt) >= from ? 0 : snap.lastBefore.get(id) ?? snap.firstAfter.get(id) ?? item.quantity;
    } else {
      const first = moves[0];
      opening = first ? first.balanceAfter - moveSign(first.type) * first.quantity : item.quantity;
    }
    let tin = 0, tout = 0;
    for (const m of moves) { if (moveSign(m.type) > 0) tin += m.quantity; else tout += m.quantity; }
    // period running until today → the real current stock; otherwise the last recorded balance
    const closing = (!to || to.getTime() >= Date.now()) ? (item.quantity || 0) : (moves.length ? moves[moves.length - 1].balanceAfter : opening);
    const lb = (await lastBalances([item._id])).get(String(item._id));
    res.json({
      item: { id: String(item._id), designation: item.designation, code: item.codeInterne || '', superCategory: item.superCategory, category: item.categoryId ? { name: item.categoryId.name, color: item.categoryId.color } : null, quantity: item.quantity, threshold: item.threshold || 0, ordered: item.orderedQuantity || 0, image: item.image || '', createdAt: item.createdAt },
      opening: Math.round(opening * 1000) / 1000, closing, totalIn: Math.round(tin * 1000) / 1000, totalOut: Math.round(tout * 1000) / 1000,
      untracked: lb !== undefined && Math.abs((item.quantity || 0) - lb) > 1e-9,
      movements: moves.map(m => toMovement(m)), truncated: moves.length >= 5000,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ANALYTICS ====================
app.get('/api/analytics/dashboard', async (req, res) => {
  try {
    const [projects, items, movements] = await Promise.all([
      Project.find().lean(),
      Item.find().populate('categoryId').lean(),
      StockMovement.find().populate('itemId', 'designation').sort({ createdAt: 1 }).lean(),
    ]);
    const criticalItems = items.filter(i => (i.quantity + (i.orderedQuantity || 0)) < i.threshold);
    const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const projectsInProgress = projects.filter(p => computeProjectStatus(p.chassis || []) === 'en_cours').length;
    let deliveriesThisMonth = 0;
    for (const p of projects) { for (const ch of p.chassis || []) { for (const u of ch.units || []) { if (u.etat === 'livre' && u.deliveryDate && new Date(u.deliveryDate) >= monthStart) deliveriesThisMonth++; for (const cs of u.componentStates || []) { if (cs.etat === 'livre' && cs.deliveryDate && new Date(cs.deliveryDate) >= monthStart) deliveriesThisMonth++; } } } }
    const chassisStatusCounts = { non_entame: 0, en_cours: 0, fabrique: 0, livre: 0 };
    for (const p of projects) { for (const ch of p.chassis || []) { const qty = ch.quantity || 1; const isComp = (ch.components || []).length > 0; for (let i = 0; i < qty; i++) { const unit = (ch.units || []).find(u => u.unitIndex === i) || { etat: 'non_entame', componentStates: [] }; let etat; if (isComp) { const states = (ch.components || []).map((_, ci) => { const cs = (unit.componentStates || []).find(c => c.compIndex === ci); return cs ? cs.etat : 'non_entame'; }); if (states.every(e => e === 'livre')) etat = 'livre'; else if (states.every(e => e === 'fabrique' || e === 'livre')) etat = 'fabrique'; else if (states.some(e => e !== 'non_entame')) etat = 'en_cours'; else etat = 'non_entame'; } else { etat = unit.etat || 'non_entame'; } chassisStatusCounts[etat]++; } } }
    const projectConsumption = projects.filter(p => (p.usedBars || []).length > 0).map(p => ({ projectId: p._id, projectName: p.name, reference: p.reference, totalBars: (p.usedBars || []).reduce((s, b) => s + b.quantity, 0), barCount: (p.usedBars || []).length })).sort((a, b) => b.totalBars - a.totalBars).slice(0, 10);
    const itemConsMap = {};
    for (const m of movements) { if (m.type === 'project_use' && m.itemId) { const id = m.itemId._id?.toString() || m.itemId.toString(); const des = m.itemId.designation || {}; if (!itemConsMap[id]) itemConsMap[id] = { id, designation: des, total: 0 }; itemConsMap[id].total += m.quantity; } }
    const topItems = Object.values(itemConsMap).sort((a, b) => b.total - a.total).slice(0, 5);
    const period = req.query.period || 'monthly';
    const movMap = {};
    const fmtPeriod = (d) => { if (period === 'annual') return `${d.getFullYear()}`; if (period === 'daily') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
    const skeleton_start = new Date(2026, 0, 1);
    if (period === 'annual') { for (let y = skeleton_start.getFullYear(); y <= now.getFullYear(); y++) { const key = `${y}`; movMap[key] = { period: key, entrees: 0, sorties: 0, project_use: 0, project_return: 0, order_reception: 0 }; } }
    else if (period === 'monthly') { for (let d = new Date(skeleton_start); d <= now; d.setMonth(d.getMonth() + 1)) { const key = fmtPeriod(d); movMap[key] = { period: key, entrees: 0, sorties: 0, project_use: 0, project_return: 0, order_reception: 0 }; } }
    else { for (let i = 59; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i); const key = fmtPeriod(d); movMap[key] = { period: key, entrees: 0, sorties: 0, project_use: 0, project_return: 0, order_reception: 0 }; } }
    for (const m of movements) { const d = new Date(m.createdAt); const key = fmtPeriod(d); if (movMap[key]) { const typeKey = m.type === 'entree' ? 'entrees' : m.type === 'sortie' ? 'sorties' : m.type; movMap[key][typeKey] = (movMap[key][typeKey] || 0) + m.quantity; } }
    const catMap = {};
    for (const item of items) { const catId = item.categoryId?._id?.toString() || 'none'; const catName = item.categoryId?.name || { fr: 'Sans catégorie', it: 'Senza categoria', en: 'No category' }; const catColor = item.categoryId?.color || '#9ca3af'; if (!catMap[catId]) catMap[catId] = { catId, catName, catColor, total: 0, ok: 0, low: 0, critical: 0 }; catMap[catId].total++; const total = item.quantity + (item.orderedQuantity || 0); if (total < item.threshold) catMap[catId].critical++; else if (item.quantity < item.threshold) catMap[catId].low++; else catMap[catId].ok++; }
    res.json({ kpis: { totalProjects: projects.length, projectsInProgress, totalItems: items.length, criticalItems: criticalItems.length, deliveriesThisMonth, totalMovements: movements.length }, chassisStatusCounts, projectConsumption, topItems, monthlyMovements: Object.values(movMap), stockByCategory: Object.values(catMap) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== DASHBOARD (Statistiques) ====================
// GET /api/analytics/overview?range=7d|30d|90d|12m|ytd[&companyId=]
// One call for the whole dashboard. Pieces are counted exactly like the project cards: one per unit
// (quantity), a composite chassis counts once with the état derived from its dormant / vantaux.
// Sections the account may not see (stock categories, orders, quotes) are left out.
const DASH_ETATS = ['non_entame', 'en_cours', 'non_vitre', 'fabrique', 'pret_a_livrer', 'livre'];
const DASH_RANGES = { '7d': 7, '30d': 30, '90d': 90 };

function dashPieces(ch) {
  const qty = Math.max(1, ch.quantity || 1);
  const numComps = (ch.components || []).length;
  const out = [];
  for (let i = 0; i < qty; i++) {
    const u = (ch.units || []).find(x => x.unitIndex === i) || (ch.units || [])[i] || null;
    if (!u) { out.push({ etat: 'non_entame', deliveredAt: null }); continue; }
    if (numComps) {
      const etat = deriveCompositeUnitEtat(u, numComps);
      // composite delivered → date of its last delivered part
      const dates = (u.componentStates || []).map(c => c.deliveryDate).filter(Boolean).map(d => new Date(d).getTime());
      out.push({ etat, deliveredAt: etat === 'livre' && dates.length ? new Date(Math.max(...dates)) : (etat === 'livre' && u.deliveryDate ? new Date(u.deliveryDate) : null) });
    } else {
      const etat = DASH_ETATS.includes(u.etat) ? u.etat : 'non_entame';
      out.push({ etat, deliveredAt: etat === 'livre' && u.deliveryDate ? new Date(u.deliveryDate) : null });
    }
  }
  return out;
}

function dashPeriod(range) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(today.getTime() + 86400000); // end of today (exclusive)
  let from, bucket;
  if (DASH_RANGES[range]) {
    from = new Date(to.getTime() - DASH_RANGES[range] * 86400000);
    bucket = range === '90d' ? 'week' : 'day';
  } else if (range === 'ytd') {
    from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)); bucket = 'month';
  } else { // 12m
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)); bucket = 'month';
  }
  const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
  return { from, to, prevFrom, bucket };
}

const dashBucketKey = (d, bucket) => {
  const x = new Date(d);
  if (bucket === 'month') return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
  if (bucket === 'week') { // Monday of the week
    const day = (x.getUTCDay() + 6) % 7;
    x.setUTCDate(x.getUTCDate() - day);
  }
  return x.toISOString().slice(0, 10);
};
function dashBuckets(from, to, bucket) {
  const keys = []; const seen = new Set();
  const d = new Date(from);
  while (d < to) {
    const k = dashBucketKey(d, bucket);
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
    if (bucket === 'month') d.setUTCMonth(d.getUTCMonth() + 1, 1); else d.setUTCDate(d.getUTCDate() + 1);
  }
  return keys;
}
const inRange = (d, a, b) => d && d >= a && d < b;
const dashName = (des) => des?.fr || des?.it || des?.en || '—';

app.get('/api/analytics/overview', requireAuth, requirePermission('analytics.view'), async (req, res) => {
  try {
    const range = ['7d', '30d', '90d', '12m', 'ytd'].includes(req.query.range) ? req.query.range : '90d';
    const { from, to, prevFrom, bucket } = dashPeriod(range);
    const keys = dashBuckets(from, to, bucket);
    const perms = req.permissions || [];
    const admin = isAdmin(req);
    const companyId = mongoose.Types.ObjectId.isValid(req.query.companyId) ? new mongoose.Types.ObjectId(req.query.companyId) : null;
    const byCompany = companyId ? { companyId } : {};
    const allowedSCs = await resolveAllowedSCs(perms); // null = every super-category
    const seesOrders = admin || perms.includes('orders.view');
    const seesDevis = admin || perms.includes('devis.view');

    const itemFilter = {};
    if (allowedSCs !== null) itemFilter.superCategory = { $in: allowedSCs };

    const [projects, items, superCats, categories, movements, orders, devis, pendingRequests] = await Promise.all([
      Project.find(byCompany)
        .select('name reference date tab clientId chassis.quantity chassis.components._id chassis.units chassis.remplissages.etat createdAt')
        .populate('clientId', 'name').lean(),
      Item.find(itemFilter).select('designation codeInterne quantity orderedQuantity threshold superCategory categoryId image').lean(),
      SuperCategory.find().sort({ order: 1 }).lean(),
      Category.find().select('name superCategory order color').sort({ order: 1 }).lean(),
      StockMovement.find({ createdAt: { $gte: prevFrom, $lt: to } }).select('type quantity createdAt itemId').lean(),
      seesOrders ? Order.find({ ...byCompany, status: { $ne: 'brouillon' } })
        .select('number reference supplier status orderDate expectedDate sentAt lines.quantityOrdered lines.quantityReceived lines.unitPrice lines.closed receptions.receivedAt receptions.cancelled')
        .lean() : [],
      seesDevis ? Devis.find({ ...byCompany, date: { $gte: prevFrom, $lt: to } }).select('status date lines.quantity lines.unitPrice lines.discount').lean() : [],
      seesOrders ? PurchaseRequest.countDocuments({ status: 'pending' }) : 0,
    ]);

    // ── PRODUCTION ─────────────────────────────────────────────────────────
    const TGALU_RE = /infinite|tgalu/i;
    const zero = () => Object.fromEntries(DASH_ETATS.map(e => [e, 0]));
    const activeEtats = zero();
    const byTab = { aluminium: zero(), laquage: zero(), vitrage: zero() };
    const delivered = Object.fromEntries(keys.map(k => [k, 0]));
    let deliveredNow = 0, deliveredPrev = 0, deliveredUndated = 0;
    const statusCount = { non_entame: 0, en_cours: 0, non_vitre: 0, fabrique: 0, pret_a_livrer: 0, cloture: 0 };
    const activeList = [];
    let rempTotal = 0, rempLivre = 0;
    const projectsByTab = { aluminium: 0, laquage: 0, vitrage: 0 };
    const rempByTab = { aluminium: { total: 0, livre: 0 }, laquage: { total: 0, livre: 0 }, vitrage: { total: 0, livre: 0 } };
    for (const p of projects) {
      const pieces = (p.chassis || []).flatMap(dashPieces);
      const etats = pieces.map(x => x.etat);
      const status = projectStatusFromEtats(etats, (p.chassis || []).length);
      statusCount[status] = (statusCount[status] || 0) + 1;
      for (const pc of pieces) {
        if (pc.etat === 'livre') {
          if (!pc.deliveredAt) deliveredUndated++;
          else if (inRange(pc.deliveredAt, from, to)) { deliveredNow++; const k = dashBucketKey(pc.deliveredAt, bucket); if (k in delivered) delivered[k]++; }
          else if (inRange(pc.deliveredAt, prevFrom, from)) deliveredPrev++;
        }
      }
      if (status === 'cloture') continue;
      const counts = zero();
      for (const e of etats) counts[e]++;
      DASH_ETATS.forEach(e => { activeEtats[e] += counts[e]; byTab[byTab[p.tab] ? p.tab : 'aluminium'][e] += counts[e]; });
      const tabKey = projectsByTab[p.tab] !== undefined ? p.tab : 'aluminium';
      projectsByTab[tabKey]++;
      for (const ch of p.chassis || []) for (const r of ch.remplissages || []) {
        rempTotal++; rempByTab[tabKey].total++;
        if (r.etat === 'livre') { rempLivre++; rempByTab[tabKey].livre++; }
      }
      activeList.push({
        id: String(p._id), name: p.name, reference: p.reference, tab: p.tab || 'aluminium', status,
        client: p.clientId?.name || '', tgalu: TGALU_RE.test(p.clientId?.name || ''),
        date: p.date, pieces: etats.length, counts,
      });
    }
    // Oldest open projects first: they are the ones to watch
    activeList.sort((a, b) => new Date(a.date) - new Date(b.date));
    const activePieces = DASH_ETATS.reduce((s, e) => s + activeEtats[e], 0);

    // ── STOCK ──────────────────────────────────────────────────────────────
    const scLabel = Object.fromEntries(superCats.map(sc => [sc.key, sc.label]));
    const scOrder = superCats.map(sc => sc.key);
    const stockBySc = {};
    const alerts = [];
    let rupture = 0, alerte = 0, couvert = 0;
    for (const it of items) {
      const sc = it.superCategory || 'aluminium';
      const row = stockBySc[sc] ||= { key: sc, label: scLabel[sc] || { fr: sc, it: sc, en: sc }, total: 0, ok: 0, couvert: 0, alerte: 0, rupture: 0 };
      row.total++;
      const q = it.quantity || 0, o = it.orderedQuantity || 0, th = it.threshold || 0;
      let state = 'ok';
      if (th > 0 && q + o < th) state = q <= 0 ? 'rupture' : 'alerte';
      else if (th > 0 && q < th) state = 'couvert'; // below threshold but enough on order
      row[state]++;
      if (state === 'rupture') rupture++; else if (state === 'alerte') alerte++; else if (state === 'couvert') couvert++;
      if (state === 'rupture' || state === 'alerte') alerts.push({
        id: String(it._id), name: dashName(it.designation), designation: it.designation, code: it.codeInterne || '', superCategory: sc,
        quantity: q, ordered: o, threshold: th, missing: Math.max(0, th - q - o), coverage: th ? (q + o) / th : 1,
      });
    }
    alerts.sort((a, b) => a.coverage - b.coverage || b.missing - a.missing);
    const stockRows = Object.values(stockBySc).sort((a, b) => {
      const ia = scOrder.indexOf(a.key), ib = scOrder.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    // ── MOVEMENTS (only articles the account can see) ──────────────────────
    const itemById = new Map(items.map(it => [String(it._id), it]));
    const IN = new Set(['entree', 'order_reception', 'project_return']);
    const OUT = new Set(['sortie', 'project_use']);
    const flow = Object.fromEntries(keys.map(k => [k, { in: 0, out: 0 }]));
    let opsNow = 0, opsPrev = 0, inNow = 0, outNow = 0;
    const consumed = new Map();
    for (const m of movements) {
      const it = itemById.get(String(m.itemId));
      if (!it) continue;
      const d = new Date(m.createdAt);
      if (d < from) { opsPrev++; continue; }
      opsNow++;
      const k = dashBucketKey(d, bucket);
      if (IN.has(m.type)) { inNow++; if (flow[k]) flow[k].in++; }
      if (OUT.has(m.type)) { outNow++; if (flow[k]) flow[k].out++; }
      // Net consumption: taken out for projects / manual exits, minus what came back from projects
      if (m.type === 'project_use' || m.type === 'sortie' || m.type === 'project_return') {
        const sign = m.type === 'project_return' ? -1 : 1;
        const c = consumed.get(String(it._id)) || { id: String(it._id), name: dashName(it.designation), designation: it.designation, code: it.codeInterne || '', superCategory: it.superCategory || 'aluminium', categoryId: it.categoryId ? String(it.categoryId) : null, quantity: 0 };
        c.quantity += sign * (m.quantity || 0);
        consumed.set(c.id, c);
      }
    }
    // Every article consumed in the period: the page ranks them per super-category / sub-category
    const consumedAll = [...consumed.values()].filter(c => c.quantity > 0).sort((a, b) => b.quantity - a.quantity)
      .map(c => ({ ...c, quantity: Math.round(c.quantity * 100) / 100 }));
    const topConsumed = consumedAll.slice(0, 8);
    const usedCats = new Set(consumedAll.map(c => c.categoryId).filter(Boolean));
    const consumedCategories = categories.filter(c => usedCats.has(String(c._id)))
      .map(c => ({ id: String(c._id), name: c.name, superCategory: c.superCategory || 'aluminium', color: c.color }));
    const consumedSuperCategories = superCats.filter(sc => consumedAll.some(c => c.superCategory === sc.key)).map(sc => ({ key: sc.key, label: sc.label }));
    // super-categories present on articles but missing from the list (old keys) — still shown
    for (const c of consumedAll) if (!consumedSuperCategories.some(sc => sc.key === c.superCategory)) consumedSuperCategories.push({ key: c.superCategory, label: { fr: c.superCategory, it: c.superCategory, en: c.superCategory } });

    // ── SUPPLIER ORDERS ────────────────────────────────────────────────────
    let ordersSection = null;
    if (seesOrders) {
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      const amount = (o) => (o.lines || []).reduce((s, l) => s + (l.quantityOrdered || 0) * (l.unitPrice || 0), 0);
      const spend = Object.fromEntries(keys.map(k => [k, 0]));
      let spendNow = 0, spendPrev = 0, ordersNow = 0, receptionsNow = 0;
      const late = [];
      let open = 0;
      for (const o of orders) {
        const sent = o.sentAt || o.orderDate;
        if (o.status !== 'annulee' && sent) {
          const d = new Date(sent);
          if (inRange(d, from, to)) { const a = amount(o); spendNow += a; ordersNow++; const k = dashBucketKey(d, bucket); if (k in spend) spend[k] += a; }
          else if (inRange(d, prevFrom, from)) spendPrev += amount(o);
        }
        for (const r of o.receptions || []) if (!r.cancelled && inRange(new Date(r.receivedAt), from, to)) receptionsNow++;
        if (o.status === 'envoye' || o.status === 'partielle') {
          open++;
          if (o.expectedDate && new Date(o.expectedDate) < today) {
            const ordered = (o.lines || []).reduce((s, l) => s + (l.quantityOrdered || 0), 0);
            const received = (o.lines || []).reduce((s, l) => s + Math.min(l.quantityReceived || 0, l.quantityOrdered || 0), 0);
            late.push({
              id: String(o._id), number: o.number || o.reference || '—', supplier: o.supplier || '',
              expectedDate: o.expectedDate, daysLate: Math.floor((today - new Date(o.expectedDate)) / 86400000),
              receivedPct: ordered ? Math.round(received / ordered * 100) : 0, status: o.status,
            });
          }
        }
      }
      late.sort((a, b) => b.daysLate - a.daysLate);
      // Amounts only for those who may see purchase prices (Admin, ACHAT, accountant)
      const seesPrices = canAccounting(req);
      ordersSection = {
        open, late: late.length, lateList: late.slice(0, 6), ordersNow, receptionsNow, pendingRequests,
        spendNow: seesPrices ? Math.round(spendNow * 100) / 100 : null,
        spendPrev: seesPrices ? Math.round(spendPrev * 100) / 100 : null,
        spend: seesPrices ? keys.map(k => ({ key: k, value: Math.round(spend[k] * 100) / 100 })) : null,
      };
    }

    // ── QUOTES ─────────────────────────────────────────────────────────────
    let devisSection = null;
    if (seesDevis) {
      const amount = (d) => (d.lines || []).reduce((s, l) => s + (l.quantity || 0) * (l.unitPrice || 0) * (1 - (l.discount || 0) / 100), 0);
      const now = { brouillon: 0, envoye: 0, accepte: 0, refuse: 0 };
      let acceptedAmount = 0, acceptedPrev = 0, sentTotal = 0;
      for (const d of devis) {
        const dd = new Date(d.date);
        if (inRange(dd, from, to)) {
          now[d.status] = (now[d.status] || 0) + 1;
          if (d.status === 'accepte') acceptedAmount += amount(d);
        } else if (d.status === 'accepte') acceptedPrev += amount(d);
      }
      sentTotal = now.envoye + now.accepte + now.refuse; // quotes that left the office
      devisSection = {
        counts: now, total: Object.values(now).reduce((a, b) => a + b, 0),
        acceptanceRate: (now.accepte + now.refuse) ? Math.round(now.accepte / (now.accepte + now.refuse) * 100) : null,
        sent: sentTotal,
        acceptedAmount: Math.round(acceptedAmount * 100) / 100, acceptedPrev: Math.round(acceptedPrev * 100) / 100,
      };
    }

    res.json({
      range, bucket, from, to, prevFrom, generatedAt: new Date(), keys,
      production: {
        projects: { total: projects.length, active: activeList.length, byStatus: statusCount },
        activePieces, activeEtats, byTab, projectsByTab, remplissagesByTab: rempByTab,
        delivered: { now: deliveredNow, prev: deliveredPrev, undated: deliveredUndated, series: keys.map(k => ({ key: k, value: delivered[k] })) },
        remplissages: { total: rempTotal, livre: rempLivre },
        activeProjects: activeList.slice(0, 12),
      },
      stock: { items: items.length, rupture, alerte, couvert, bySuperCategory: stockRows, alerts: alerts.slice(0, 10), alertCount: alerts.length },
      movements: { opsNow, opsPrev, inNow, outNow, flow: keys.map(k => ({ key: k, ...flow[k] })), topConsumed, consumed: consumedAll, consumedCategories, consumedSuperCategories },
      orders: ordersSection,
      devis: devisSection,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== SUPER-CATEGORY ROUTES ====================
app.get('/api/super-categories', optionalAuth, async (req, res) => {
  try {
    const all = await SuperCategory.find().sort({ order: 1 });   // ← no more defaults fallback needed
    const allowed = req.allowedSuperCategories;
    const filtered = allowed === null ? all : all.filter(sc => allowed.includes(sc.key));
    res.json(filtered);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/super-categories', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const { key, label, color } = req.body;
    if (!key || !label?.fr) return res.status(400).json({ error: 'key and label.fr required' });
    if (!/^[a-z0-9_]+$/.test(key)) return res.status(400).json({ error: 'key must be lowercase alphanumeric + underscore' });
    const count = await SuperCategory.countDocuments();
    const sc = await SuperCategory.create({ key, label, color: color || '#3b82f6', order: count });
    res.status(201).json(sc);
  } catch (e) { res.status(e.code === 11000 ? 409 : 400).json({ error: e.message }); }
});
app.put('/api/super-categories/:key', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const sc = await SuperCategory.findOneAndUpdate(
      { key: req.params.key },
      { label: req.body.label, color: req.body.color, order: req.body.order }, // ← add order
      { new: true }
    );
    if (!sc) return res.status(404).json({ error: 'Not found' });
    res.json(sc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/super-categories-reorder', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const { orderedKeys } = req.body; // e.g. ['poudre', 'aluminium', 'verre', 'accessoires', 'composite']
    if (!Array.isArray(orderedKeys)) return res.status(400).json({ error: 'orderedKeys must be an array' });
    await Promise.all(
      orderedKeys.map((key, idx) => SuperCategory.updateOne({ key }, { $set: { order: idx } }))
    );
    const all = await SuperCategory.find().sort({ order: 1 });
    res.json(all);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/super-categories/:key', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    if (['aluminium', 'verre', 'accessoires', 'poudre'].includes(req.params.key)) return res.status(400).json({ error: 'Cannot delete built-in super-categories' });
    await SuperCategory.deleteOne({ key: req.params.key });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inventory/poudres', async (req, res) => {
  try { res.json(await Item.find({ superCategory: 'poudres' }).populate('categoryId').sort({ createdAt: -1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ATELIER TABLES ====================

const atelierTableLayoutSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  tables: [{
    id: { type: String, required: true },
    number: { type: Number, required: true },
    name: { type: String, required: true },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    w: { type: Number, default: 200 },
    h: { type: Number, default: 90 },
  }],
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const AtelierTableLayout = mongoose.model('AtelierTableLayout', atelierTableLayoutSchema);

app.get('/api/atelier-tables', async (req, res) => {
  try { const layout = await AtelierTableLayout.findOne({}).sort({ updatedAt: -1 }); res.json(layout ? layout.tables : []); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/atelier-tables', async (req, res) => {
  try {
    const { tables } = req.body;
    if (!Array.isArray(tables)) return res.status(400).json({ error: 'tables must be an array' });
    for (const t of tables) { if (!t.id || !t.name || t.number == null) return res.status(400).json({ error: 'Each table must have id, name, and number' }); }
    let layout = await AtelierTableLayout.findOne({});
    if (layout) { layout.tables = tables; await layout.save(); } else { layout = await AtelierTableLayout.create({ tables }); }
    res.json(layout.tables);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/atelier-tables/names', async (req, res) => {
  try {
    const layout = await AtelierTableLayout.findOne({}).sort({ updatedAt: -1 });
    if (!layout || !layout.tables.length) return res.json(['Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 6', 'Table 7', 'Table 8']);
    res.json([...layout.tables].sort((a, b) => a.number - b.number).map(t => t.name));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== TABLE STOCK ====================

const tableStockSchema = new mongoose.Schema({
  tableId: { type: String, required: true, unique: true },
  tableName: { type: String, default: '' },
  workers: [{ type: String }],
  stock: [{
    itemId: { type: String, required: true },
    label: { type: String, required: true },
    unit: { type: String, default: '' },
    quantity: { type: Number, default: 0, min: 0 },
  }],
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const TableStock = mongoose.model('TableStock', tableStockSchema);

const tableConsumptionSchema = new mongoose.Schema({
  tableId: { type: String, required: true },
  tableName: { type: String, default: '' },
  itemId: { type: String, required: true },
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  quantity: { type: Number, required: true },
  type: { type: String, enum: ['chassis_assignment', 'manual_in', 'manual_out'], required: true },
  projectId: { type: String, default: '' },
  projectName: { type: String, default: '' },
  chassisRef: { type: String, default: '' },
  date: { type: Date, default: Date.now },
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
tableConsumptionSchema.index({ tableId: 1, date: -1 });
tableConsumptionSchema.index({ date: -1 });
const TableConsumption = mongoose.model('TableConsumption', tableConsumptionSchema);

app.get('/api/table-stock', async (req, res) => {
  try { res.json(await TableStock.find().sort({ tableName: 1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/table-stock/:tableId', async (req, res) => {
  try {
    const s = await TableStock.findOne({ tableId: req.params.tableId });
    res.json(s || { tableId: req.params.tableId, stock: [], workers: [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/table-stock/:tableId', async (req, res) => {
  try {
    const { tableId } = req.params; const { tableName, workers, stock } = req.body;
    if (!Array.isArray(stock)) return res.status(400).json({ error: 'stock must be an array' });
    const s = await TableStock.findOneAndUpdate({ tableId }, { tableId, tableName: tableName || '', workers: workers || [], stock }, { upsert: true, new: true });
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/table-stock/:tableId/adjust', async (req, res) => {
  try {
    const { tableId } = req.params; const { itemId, label, unit, delta, type } = req.body;
    if (!itemId || typeof delta !== 'number') return res.status(400).json({ error: 'itemId and numeric delta required' });
    let s = await TableStock.findOne({ tableId });
    if (!s) s = new TableStock({ tableId, stock: [] });
    const idx = s.stock.findIndex(x => x.itemId === itemId);
    if (idx === -1) s.stock.push({ itemId, label: label || itemId, unit: unit || '', quantity: Math.max(0, delta) });
    else s.stock[idx].quantity = Math.max(0, s.stock[idx].quantity + delta);
    await s.save();
    const movType = type || (delta > 0 ? 'manual_in' : 'manual_out');
    if (delta !== 0) await TableConsumption.create({ tableId, tableName: s.tableName || '', itemId, label: label || itemId, unit: unit || '', quantity: Math.abs(delta), type: movType, date: new Date() });
    if (delta !== 0 && movType === 'manual_in' && itemId && !itemId.startsWith('manual_')) {
      try { const item = await Item.findById(itemId); if (item) { item.quantity = Math.max(0, item.quantity - Math.abs(delta)); await item.save(); await StockMovement.create({ itemId: item._id, type: 'sortie', quantity: Math.abs(delta), balanceAfter: item.quantity, note: `Approvisionnement table: ${s.tableName || tableId}` }); } } catch { }
    }
    if (delta !== 0 && movType === 'manual_out' && itemId && !itemId.startsWith('manual_')) {
      try { const item = await Item.findById(itemId); if (item) { item.quantity = item.quantity + Math.abs(delta); await item.save(); await StockMovement.create({ itemId: item._id, type: 'entree', quantity: Math.abs(delta), balanceAfter: item.quantity, note: `Retour depuis table: ${s.tableName || tableId}` }); } } catch { }
    }
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/table-stock/:tableId/item/:itemId', async (req, res) => {
  try {
    const { tableId, itemId } = req.params;
    const s = await TableStock.findOne({ tableId });
    if (!s) return res.status(404).json({ error: 'Table stock not found' });
    const idx = s.stock.findIndex(x => x.itemId === itemId);
    if (idx === -1) return res.status(404).json({ error: 'Item not found in table stock' });
    const removed = s.stock[idx]; s.stock.splice(idx, 1); await s.save();
    if (removed.quantity > 0 && !itemId.startsWith('manual_')) {
      try { const item = await Item.findById(itemId); if (item) { item.quantity = item.quantity + removed.quantity; await item.save(); await StockMovement.create({ itemId: item._id, type: 'entree', quantity: removed.quantity, balanceAfter: item.quantity, note: `Retrait accessoire de table: ${s.tableName || tableId}` }); } } catch { }
    }
    await TableConsumption.create({ tableId, tableName: s.tableName || '', itemId, label: removed.label, unit: removed.unit || '', quantity: removed.quantity, type: 'manual_out', date: new Date() });
    res.json({ success: true, stock: s.stock });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/table-stock/deduct-chassis', async (req, res) => {
  try {
    const { tableId, tableName, projectId, projectName, chassisRef, accessories } = req.body;
    if (!tableId || !Array.isArray(accessories)) return res.status(400).json({ error: 'tableId and accessories[] required' });
    let s = await TableStock.findOne({ tableId });
    if (!s) s = new TableStock({ tableId, tableName: tableName || '', stock: [] });
    const consumptions = [];
    for (const acc of accessories) {
      if (!acc.quantity || acc.quantity <= 0) continue;
      const idx = s.stock.findIndex(x => x.itemId === acc.itemId);
      if (idx === -1) s.stock.push({ itemId: acc.itemId, label: acc.label || acc.itemId, unit: acc.unit || '', quantity: 0 });
      const si = s.stock.findIndex(x => x.itemId === acc.itemId);
      s.stock[si].quantity = Math.max(0, s.stock[si].quantity - acc.quantity);
      consumptions.push({ tableId, tableName: tableName || s.tableName || '', itemId: acc.itemId, label: acc.label || acc.itemId, unit: acc.unit || '', quantity: acc.quantity, type: 'chassis_assignment', projectId: projectId || '', projectName: projectName || '', chassisRef: chassisRef || '', date: new Date() });
    }
    await s.save();
    if (consumptions.length) await TableConsumption.insertMany(consumptions);
    res.json({ stock: s, consumed: consumptions.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/table-consumption', async (req, res) => {
  try {
    const filter = {};
    if (req.query.tableId) filter.tableId = req.query.tableId;
    if (req.query.from || req.query.to) { filter.date = {}; if (req.query.from) filter.date.$gte = new Date(req.query.from); if (req.query.to) filter.date.$lte = new Date(req.query.to); }
    res.json(await TableConsumption.find(filter).sort({ date: -1 }).limit(500));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/table-consumption/recap', async (req, res) => {
  try {
    const { period = 'monthly', tableId } = req.query;
    const now = new Date(); let from;
    if (period === 'daily') from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    if (period === 'weekly') from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 83);
    if (period === 'monthly') from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const match = { date: { $gte: from } }; if (tableId) match.tableId = tableId;
    const groupId = { tableId: '$tableId', tableName: '$tableName', itemId: '$itemId', label: '$label', unit: '$unit' };
    if (period === 'daily') { groupId.y = { $year: '$date' }; groupId.m = { $month: '$date' }; groupId.d = { $dayOfMonth: '$date' }; }
    else if (period === 'weekly') { groupId.y = { $isoWeekYear: '$date' }; groupId.w = { $isoWeek: '$date' }; }
    else { groupId.y = { $year: '$date' }; groupId.m = { $month: '$date' }; }
    const agg = await TableConsumption.aggregate([
      { $match: match },
      { $group: { _id: groupId, consumed: { $sum: { $cond: [{ $ne: ['$type', 'manual_in'] }, '$quantity', 0] } }, restocked: { $sum: { $cond: [{ $eq: ['$type', 'manual_in'] }, '$quantity', 0] } } } },
      { $sort: { '_id.tableId': 1, '_id.y': 1, '_id.m': 1, '_id.d': 1, '_id.w': 1 } }
    ]);
    const result = {};
    for (const row of agg) {
      const { tableId: tid, tableName, itemId, label, unit, y, m, d, w } = row._id;
      let periodKey;
      if (period === 'daily') periodKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      else if (period === 'weekly') periodKey = `${y}-W${String(w).padStart(2, '0')}`;
      else periodKey = `${y}-${String(m).padStart(2, '0')}`;
      if (!result[tid]) result[tid] = { tableId: tid, tableName, periods: {} };
      if (!result[tid].periods[periodKey]) result[tid].periods[periodKey] = [];
      result[tid].periods[periodKey].push({ itemId, label, unit, consumed: row.consumed, restocked: row.restocked });
    }
    res.json(Object.values(result));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/table-consumption/:id', async (req, res) => {
  try {
    const doc = await TableConsumption.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/atelier-tables/:tableId/workload', async (req, res) => {
  try {
    const { tableId } = req.params;
    const layout = await AtelierTableLayout.findOne({});
    const tableObj = layout?.tables?.find(t => t.id === tableId);
    if (!tableObj) return res.status(404).json({ error: 'Table not found' });
    const tableName = tableObj.name;
    const projects = await Project.find({ 'chassis.units.atelierTable': tableName }).populate('clientId').lean();
    const workload = [];
    for (const proj of projects) {
      for (const ch of proj.chassis || []) {
        for (const unit of ch.units || []) {
          if ((unit.atelierTable || '') === tableName) {
            const accs = (ch.accessories || []).map(acc => {
              let qty = acc.quantity || 0;
              if (acc.formula && acc.formula.trim()) { try { const L = ch.largeur; const H = ch.hauteur; qty = Function('L', 'H', `return (${acc.formula})`)(L, H); } catch { qty = 0; } }
              return { itemId: acc.itemId, label: acc.label, unit: acc.unit, quantity: Math.round(qty * 100) / 100 };
            });
            workload.push({ projectId: proj._id.toString(), projectName: proj.name, projectRef: proj.reference, clientName: proj.clientId?.name || '', chassisId: ch._id.toString(), chassisRef: ch.repere, chassisType: ch.type, dimension: ch.dimension || `${ch.largeur}×${ch.hauteur}`, unitIndex: unit.unitIndex, etat: unit.etat, deliveryDate: unit.deliveryDate, accessories: accs, assignedAt: unit.deliveryDate || proj.updatedAt });
          }
        }
      }
    }
    const stock = await TableStock.findOne({ tableId });
    res.json({ table: tableObj, workload, stock: stock?.stock || [], workers: stock?.workers || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== LAQUAGE SCHEMAS ====================

/* const laquageBarresBrutesSchema = new mongoose.Schema({ reference: { type: String, default: '' }, quantiteBrute: { type: Number, default: 0 } }, { _id: false });
const laquageBarresLaqueeSchema = new mongoose.Schema({ reference: { type: String, default: '' }, ral: { type: String, default: '' }, quantiteLaquee: { type: Number, default: 0 } }, { _id: false });
const laquageMorceauBrutSchema = new mongoose.Schema({ reference: { type: String, default: '' }, mesure: { type: String, default: '' }, quantite: { type: Number, default: 0 } }, { _id: false });
const laquageMorceauLaqueLigneSchema = new mongoose.Schema({ ral: { type: String, default: '' }, mesure: { type: String, default: '' }, quantite: { type: Number, default: 0 } }, { _id: false });
const laquageMorceauLaqueSchema = new mongoose.Schema({ reference: { type: String, default: '' }, lignes: [laquageMorceauLaqueLigneSchema] }, { _id: false });

const LAQUAGE_STATUSES = ['draft', 'sent_to_laquage', 'received_laquage', 'returned_to_coord', 'received_coord'];

const laquageHistoryEntrySchema = new mongoose.Schema({
  action: { type: String, required: true },
  by: { type: String, default: '' },
  at: { type: Date, default: Date.now },
  note: { type: String, default: '' },
  partialQty: { type: Number, default: null },
}, { _id: false });

const laquageBarresSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },
  barresBrutes: [laquageBarresBrutesSchema],
  barresLaquees: [laquageBarresLaqueeSchema],
  morceauxBruts: [laquageMorceauBrutSchema],
  morceauxLaques: [laquageMorceauLaqueSchema],
  status: { type: String, enum: LAQUAGE_STATUSES, default: 'draft' },
  lineStatuses: { type: mongoose.Schema.Types.Mixed, default: {} },
  history: [laquageHistoryEntrySchema],
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; } } });
const LaquageBarres = mongoose.model('LaquageBarres', laquageBarresSchema);

const laquageAccSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },
  accessoires: [{ designation: { type: String, default: '' }, quantite: { type: Number, default: 0 }, notes: { type: String, default: '' } }],
  status: { type: String, enum: LAQUAGE_STATUSES, default: 'draft' },
  lineStatuses: { type: mongoose.Schema.Types.Mixed, default: {} },
  history: [laquageHistoryEntrySchema],
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; } } });
const LaquageAccessoires = mongoose.model('LaquageAccessoires', laquageAccSchema);

// ==================== LAQUAGE HELPER ====================

function applyLaquageAction(record, action, lineKey, by, extra = {}) {
  const now = new Date();
  record.history = record.history || [];

  if (action === 'send_to_laquage') {
    record.status = 'sent_to_laquage';
    record.history.push({ action, by, at: now });
    return;
  }
  if (action === 'receive_line_laquage') {
    const wasIncomplete = record.lineStatuses?.[lineKey]?.incomplete;
    record.lineStatuses[lineKey] = {
      ...(record.lineStatuses[lineKey] || {}),
      receivedLaquage: true,
      receivedLaquageAt: now,
      receivedLaquageBy: by
    };
    record.markModified('lineStatuses');
    const histAction = wasIncomplete
      ? 'receive_incomplete_line_laquage'
      : `receive_line_laquage:${lineKey}`;
    record.history.push({ action: histAction, by, at: now, note: extra.lineLabel || '' }); // ← add lineLabel as note
    return;
  }

  if (action === 'receive_all_laquage') {
    record.status = 'received_laquage';
    record.history.push({ action, by, at: now });
    return;
  }
  if (action === 'return_to_coord') {
    record.status = 'returned_to_coord';
    record.history.push({ action, by, at: now });
    return;
  }
  if (action === 'receive_line_coord') {
    const wasIncomplete = record.lineStatuses?.[lineKey]?.incomplete;
    record.lineStatuses[lineKey] = {
      ...(record.lineStatuses[lineKey] || {}),
      receivedCoord: true,
      receivedCoordAt: now,
      receivedCoordBy: by
    };
    record.markModified('lineStatuses');
    const histAction = wasIncomplete
      ? 'receive_incomplete_line_coord'
      : `receive_line_coord:${lineKey}`;
    record.history.push({ action: histAction, by, at: now, note: extra.lineLabel || '' }); // ← add lineLabel as note
    return;
  }
  if (action === 'receive_all_coord') {
    record.status = 'received_coord';
    record.history.push({ action, by, at: now });
    return;
  }
  if (action === 'incomplete_line') {
    record.lineStatuses = record.lineStatuses || {};
    record.lineStatuses[lineKey] = { ...(record.lineStatuses[lineKey] || {}), incomplete: true, incompleteAt: now, incompleteBy: by, incompleteNote: extra.note || '', partialQty: extra.partialQty ?? null };
    record.markModified('lineStatuses');
    const incompleteNote = extra.lineLabel
      ? `[${extra.lineLabel}] ${extra.note || ''}`.trim()
      : extra.note || '';
    record.history.push({ action: 'incomplete_line', by, at: now, note: incompleteNote, partialQty: extra.partialQty ?? null });
    return;
  }
} */

// ==================== LAQUAGE BARRES ROUTES ====================

// ==================== LAQUAGE SCHEMAS (REPLACE EXISTING) ====================
//
// KEY CHANGES:
//  - Each record now has an array of "lots" (batches).
//  - Each lot has its own status: draft → sent → received_laquage → returned → received_coord
//  - The record-level status is derived from all lots.
//  - Barreman can add a new lot at ANY time as long as the record is not fully "received_coord".
//  - "Réceptionner TOUT" on a lot now accepts an optional global note + partialQty.
//  - lineStatuses are scoped per lot: `lot_${lotIndex}_${lineKey}`.

const laquageBarresBrutesSchema = new mongoose.Schema(
  {
    reference: { type: String, default: '' },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    quantiteBrute: { type: Number, default: 0 },
  },
  { _id: false }
);
const laquageBarresLaqueeSchema = new mongoose.Schema(
  {
    reference: { type: String, default: '' },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    ral: { type: String, default: '' },
    quantiteLaquee: { type: Number, default: 0 },
  },
  { _id: false }
);
// What a lot has already taken out of the inventory (barres brutes + barres laquées only)
const laquageStockDeductionSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    reference: { type: String, default: '' },
    quantity: { type: Number, default: 0 },
  },
  { _id: false }
);
const laquageMorceauBrutSchema = new mongoose.Schema(
  { reference: { type: String, default: '' }, mesure: { type: String, default: '' }, quantite: { type: Number, default: 0 } },
  { _id: false }
);
const laquageMorceauLaqueLigneSchema = new mongoose.Schema(
  { ral: { type: String, default: '' }, mesure: { type: String, default: '' }, quantite: { type: Number, default: 0 } },
  { _id: false }
);
const laquageMorceauLaqueSchema = new mongoose.Schema(
  { reference: { type: String, default: '' }, lignes: [laquageMorceauLaqueLigneSchema] },
  { _id: false }
);

const LOT_STATUSES = ['draft', 'sent_to_laquage', 'received_laquage', 'returned_to_coord', 'received_coord'];

const laquageHistoryEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    by: { type: String, default: '' },
    at: { type: Date, default: Date.now },
    note: { type: String, default: '' },
    partialQty: { type: Number, default: null },
    lotIndex: { type: Number, default: null },  // which lot this action belongs to
  },
  { _id: false }
);

// ── Per-lot sub-document ──────────────────────────────────────────────────────
const laquageLotSchema = new mongoose.Schema(
  {
    lotIndex: { type: Number, required: true },        // 0-based, auto-incremented
    status: { type: String, enum: LOT_STATUSES, default: 'draft' },
    barresBrutes: [laquageBarresBrutesSchema],
    barresLaquees: [laquageBarresLaqueeSchema],
    morceauxBruts: [laquageMorceauBrutSchema],
    morceauxLaques: [laquageMorceauLaqueSchema],
    // lineStatuses: keyed by lineKey (bb-0, bl-1, ml-0-2, etc.)
    lineStatuses: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Notes added during "Réceptionner TOUT" actions
    receptionLaquageNote: { type: String, default: '' },
    receptionCoordNote: { type: String, default: '' },
    receptionLaquageQty: { type: Number, default: null },  // if received more than expected
    receptionCoordQty: { type: Number, default: null },
    // Inventory deducted when the lot was sent to laquage (barres brutes + barres laquées)
    stockDeducted: { type: [laquageStockDeductionSchema], default: undefined },
    stockDeductedAt: { type: Date, default: null },
  },
  { _id: false }
);

const laquageBarresSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },
    lots: [laquageLotSchema],
    history: [laquageHistoryEntrySchema],
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        // Compute derived record-level status from all lots
        ret.status = deriveLaquageRecordStatus(ret.lots || []);
        return ret;
      },
    },
  }
);
const LaquageBarres = mongoose.model('LaquageBarres', laquageBarresSchema);

// ── Accessoires: same lot structure but with accessoires array ────────────────
const laquageAccLotSchema = new mongoose.Schema(
  {
    lotIndex: { type: Number, required: true },
    status: { type: String, enum: LOT_STATUSES, default: 'draft' },
    accessoires: [
      {
        designation: { type: String, default: '' },
        quantite: { type: Number, default: 0 },
        notes: { type: String, default: '' },
      },
    ],
    lineStatuses: { type: mongoose.Schema.Types.Mixed, default: {} },
    receptionLaquageNote: { type: String, default: '' },
    receptionCoordNote: { type: String, default: '' },
    receptionLaquageQty: { type: Number, default: null },
    receptionCoordQty: { type: Number, default: null },
  },
  { _id: false }
);

const laquageAccSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },
    lots: [laquageAccLotSchema],
    history: [laquageHistoryEntrySchema],
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        ret.status = deriveLaquageRecordStatus(ret.lots || []);
        return ret;
      },
    },
  }
);
const LaquageAccessoires = mongoose.model('LaquageAccessoires', laquageAccSchema);

// ==================== LAQUAGE HELPERS ====================

/**
 * Derive the overall record status from all lots.
 * Rules:
 *  - If any lot is draft → 'has_draft'  (Barreman can still edit)
 *  - If all lots are received_coord → 'received_coord'
 *  - Otherwise → the "worst" (least advanced) lot status
 */
function deriveLaquageRecordStatus(lots) {
  if (!lots || lots.length === 0) return 'draft';
  const order = LOT_STATUSES;
  // Find the minimum status index across all lots
  let minIdx = order.length;
  for (const lot of lots) {
    const idx = order.indexOf(lot.status);
    if (idx < minIdx) minIdx = idx;
  }
  return order[minIdx] ?? 'draft';
}

/**
 * Apply an action to a specific lot within the record.
 * Actions remain the same as before, but are scoped to a lotIndex.
 */
function applyLaquageAction(record, action, lotIndex, lineKey, by, extra = {}) {
  const now = new Date();
  record.history = record.history || [];

  // Find the target lot
  const lot = (record.lots || []).find(l => l.lotIndex === lotIndex);
  if (!lot && action !== 'add_lot') {
    throw new Error(`Lot ${lotIndex} not found`);
  }

  if (action === 'add_lot') {
    // Barreman adds a new empty lot
    const nextIdx = (record.lots || []).length;
    record.lots = record.lots || [];
    // For LaquageBarres vs LaquageAccessoires, the caller initialises the correct shape
    // We just create the shell here — caller patches in the actual data arrays
    if (!record.lots.find(l => l.lotIndex === nextIdx)) {
      record.lots.push({ lotIndex: nextIdx, status: 'draft', lineStatuses: {} });
    }
    record.history.push({ action: 'add_lot', by, at: now, lotIndex: nextIdx });
    return nextIdx;
  }

  if (action === 'send_to_laquage') {
    lot.status = 'sent_to_laquage';
    record.history.push({ action, by, at: now, lotIndex });
    return;
  }

  if (action === 'receive_line_laquage') {
    lot.lineStatuses = lot.lineStatuses || {};
    lot.lineStatuses[lineKey] = {
      ...(lot.lineStatuses[lineKey] || {}),
      receivedLaquage: true,
      receivedLaquageAt: now,
      receivedLaquageBy: by,
    };
    record.markModified('lots');
    record.history.push({
      action: `receive_line_laquage:${lineKey}`,
      by, at: now, lotIndex,
      note: extra.lineLabel || '',
    });

    // ── AUTO-ADVANCE: if all lines are now received, promote lot to received_laquage ──
    if (extra.allLineKeys && extra.allLineKeys.length > 0) {
      const allDone = extra.allLineKeys.every(k => {
        if (k === lineKey) return true; // just marked
        return lot.lineStatuses[k]?.receivedLaquage;
      });
      if (allDone && lot.status === 'sent_to_laquage') {
        lot.status = 'received_laquage';
        if (extra.note) lot.receptionLaquageNote = extra.note;
        if (extra.partialQty != null) lot.receptionLaquageQty = extra.partialQty;
        record.markModified('lots');
        record.history.push({
          action: 'receive_all_laquage',
          by, at: now, lotIndex,
          note: '(auto — toutes les lignes réceptionnées)',
        });
      }
    }
    return;
  }

  if (action === 'receive_all_laquage') {
    lot.status = 'received_laquage';
    if (extra.note) lot.receptionLaquageNote = extra.note;
    if (extra.partialQty != null) lot.receptionLaquageQty = extra.partialQty;
    record.markModified('lots');
    record.history.push({
      action, by, at: now, lotIndex,
      note: extra.note || '',
      partialQty: extra.partialQty ?? null,
    });
    return;
  }

  if (action === 'return_to_coord') {
    lot.status = 'returned_to_coord';
    record.history.push({ action, by, at: now, lotIndex });
    return;
  }

  if (action === 'receive_line_coord') {
    lot.lineStatuses = lot.lineStatuses || {};
    lot.lineStatuses[lineKey] = {
      ...(lot.lineStatuses[lineKey] || {}),
      receivedCoord: true,
      receivedCoordAt: now,
      receivedCoordBy: by,
    };
    record.markModified('lots');
    record.history.push({
      action: `receive_line_coord:${lineKey}`,
      by, at: now, lotIndex,
      note: extra.lineLabel || '',
    });

    // ── AUTO-ADVANCE: if all lines are now received by coord, promote lot ──
    if (extra.allLineKeys && extra.allLineKeys.length > 0) {
      const allDone = extra.allLineKeys.every(k => {
        if (k === lineKey) return true; // just marked
        return lot.lineStatuses[k]?.receivedCoord;
      });
      if (allDone && lot.status === 'returned_to_coord') {
        lot.status = 'received_coord';
        if (extra.note) lot.receptionCoordNote = extra.note;
        if (extra.partialQty != null) lot.receptionCoordQty = extra.partialQty;
        record.markModified('lots');
        record.history.push({
          action: 'receive_all_coord',
          by, at: now, lotIndex,
          note: '(auto — toutes les lignes réceptionnées)',
        });
      }
    }
    return;
  }

  if (action === 'receive_all_coord') {
    lot.status = 'received_coord';
    if (extra.note) lot.receptionCoordNote = extra.note;
    if (extra.partialQty != null) lot.receptionCoordQty = extra.partialQty;
    record.markModified('lots');
    record.history.push({
      action, by, at: now, lotIndex,
      note: extra.note || '',
      partialQty: extra.partialQty ?? null,
    });
    return;
  }

  if (action === 'incomplete_line') {
    lot.lineStatuses = lot.lineStatuses || {};
    lot.lineStatuses[lineKey] = {
      ...(lot.lineStatuses[lineKey] || {}),
      incomplete: true,
      incompleteAt: now,
      incompleteBy: by,
      incompleteNote: extra.note || '',
      partialQty: extra.partialQty ?? null,
    };
    record.markModified('lots');
    const incompleteNote = extra.lineLabel
      ? `[${extra.lineLabel}] ${extra.note || ''}`.trim()
      : extra.note || '';
    record.history.push({
      action: 'incomplete_line', by, at: now, lotIndex,
      note: incompleteNote,
      partialQty: extra.partialQty ?? null,
    });
    return;
  }
}

// ==================== MIGRATION HELPER ====================
// Run once to migrate old records (single-status, flat arrays) to the new lot-based structure.

async function migrateLaquageToLots() {
  try {
    // Migrate LaquageBarres
    const oldBarres = await LaquageBarres.find({ lots: { $size: 0 } }).lean();
    // NOTE: Because we changed the schema, old records won't have 'lots'.
    // We detect them by checking if 'lots' is undefined or empty.
    const allBarres = await LaquageBarres.find({}).lean();
    for (const rec of allBarres) {
      if (!rec.lots || rec.lots.length === 0) {
        // Migrate: wrap the flat arrays into lot 0
        const hasContent =
          (rec.barresBrutes?.length || 0) +
          (rec.barresLaquees?.length || 0) +
          (rec.morceauxBruts?.length || 0) +
          (rec.morceauxLaques?.length || 0) > 0;
        const lot0 = {
          lotIndex: 0,
          status: rec.status || 'draft',
          barresBrutes: rec.barresBrutes || [],
          barresLaquees: rec.barresLaquees || [],
          morceauxBruts: rec.morceauxBruts || [],
          morceauxLaques: rec.morceauxLaques || [],
          lineStatuses: rec.lineStatuses || {},
          receptionLaquageNote: '',
          receptionCoordNote: '',
        };
        await LaquageBarres.findByIdAndUpdate(rec._id, {
          $set: { lots: [lot0] },
          $unset: {
            barresBrutes: 1, barresLaquees: 1,
            morceauxBruts: 1, morceauxLaques: 1,
            status: 1, lineStatuses: 1,
          },
        });
        console.log(`✅ Migrated LaquageBarres ${rec._id} → lot 0`);
      }
    }

    // Migrate LaquageAccessoires
    const allAcc = await LaquageAccessoires.find({}).lean();
    for (const rec of allAcc) {
      if (!rec.lots || rec.lots.length === 0) {
        const lot0 = {
          lotIndex: 0,
          status: rec.status || 'draft',
          accessoires: rec.accessoires || [],
          lineStatuses: rec.lineStatuses || {},
          receptionLaquageNote: '',
          receptionCoordNote: '',
        };
        await LaquageAccessoires.findByIdAndUpdate(rec._id, {
          $set: { lots: [lot0] },
          $unset: { accessoires: 1, status: 1, lineStatuses: 1 },
        });
        console.log(`✅ Migrated LaquageAccessoires ${rec._id} → lot 0`);
      }
    }
  } catch (e) {
    console.error('Laquage migration error:', e.message);
  }
}

// Call this in your mongoose.connect().then() callback alongside initSampleData():
// migrateLaquageToLots();

// ==================== LAQUAGE STOCK DEDUCTION ====================
// When a lot is sent to laquage, its barres brutes + barres laquées are taken out of the
// aluminium inventory. Morceaux and the LaquageAccessoires panel never touch the stock.
// lot.stockDeducted remembers what was taken, so an admin edit of a sent lot only applies
// the difference (and never deducts twice).

async function resolveLaquageBarItem(row) {
  if (row.itemId) {
    const byId = await Item.findById(row.itemId);
    if (byId) return byId;
  }
  const ref = (row.reference || '').trim();
  if (!ref) return null;
  // Exact match, ignoring case / surrounding spaces, on any designation language or the internal code
  const exact = new RegExp(`^\\s*${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  return Item.findOne({
    superCategory: 'aluminium',
    $or: [{ 'designation.fr': exact }, { 'designation.en': exact }, { 'designation.it': exact }, { codeInterne: exact }],
  });
}

async function syncLaquageLotStock(record, lot, project) {
  // 1) What the lot should have taken out of stock right now
  const wanted = new Map(); // itemId -> { item, reference, quantity }
  const unknown = [];
  const rows = [
    ...(lot.barresBrutes || []).map(r => ({ row: r, qty: Number(r.quantiteBrute) || 0 })),
    ...(lot.barresLaquees || []).map(r => ({ row: r, qty: Number(r.quantiteLaquee) || 0 })),
  ];
  for (const { row, qty } of rows) {
    if (qty <= 0) continue;
    const item = await resolveLaquageBarItem(row);
    if (!item) { unknown.push(row.reference || '(sans référence)'); continue; }
    if (!row.itemId) row.itemId = item._id;
    const key = String(item._id);
    const cur = wanted.get(key) || { item, reference: row.reference || item.designation?.fr || '', quantity: 0 };
    cur.quantity += qty;
    wanted.set(key, cur);
  }
  if (unknown.length) {
    const err = new Error(`Article(s) introuvable(s) dans l'inventaire aluminium : ${[...new Set(unknown)].join(', ')}. Sélectionnez la référence depuis la recherche.`);
    err.status = 400;
    throw err;
  }

  // 2) Delta vs what was already deducted
  const already = new Map((lot.stockDeducted || []).map(d => [String(d.itemId), d.quantity || 0]));
  const keys = new Set([...wanted.keys(), ...already.keys()]);
  const deltas = [];
  for (const key of keys) {
    const delta = (wanted.get(key)?.quantity || 0) - (already.get(key) || 0);
    if (delta !== 0) deltas.push({ key, delta });
  }

  // 3) Check stock before touching anything
  const missing = [];
  for (const { key, delta } of deltas) {
    if (delta <= 0) continue;
    const item = wanted.get(key).item;
    if ((item.quantity || 0) < delta) missing.push(`${item.designation?.fr || key} (stock ${item.quantity}, requis ${delta})`);
  }
  if (missing.length) {
    const err = new Error(`Stock insuffisant : ${missing.join(' ; ')}`);
    err.status = 400;
    throw err;
  }

  // 4) Apply (atomic per item, rollback if one fails because stock moved meanwhile)
  const applied = [];
  const note = `Laquage — Lot ${lot.lotIndex + 1}`;
  try {
    for (const { key, delta } of deltas) {
      const filter = delta > 0 ? { _id: key, quantity: { $gte: delta } } : { _id: key };
      const updated = await Item.findOneAndUpdate(filter, { $inc: { quantity: -delta } }, { new: true });
      if (!updated) {
        const err = new Error('Stock insuffisant (modifié entre-temps). Réessayez.');
        err.status = 409;
        throw err;
      }
      applied.push({ key, delta });
      await StockMovement.create({
        itemId: updated._id,
        type: delta > 0 ? 'sortie' : 'entree',
        quantity: Math.abs(delta),
        balanceAfter: updated.quantity,
        projectId: project?._id || record.projectId,
        projectName: project?.name || '',
        note: delta > 0 ? `${note} — envoi au laquage` : `${note} — correction (retour stock)`,
      });
    }
  } catch (e) {
    for (const { key, delta } of applied) await Item.findByIdAndUpdate(key, { $inc: { quantity: delta } });
    throw e;
  }

  lot.stockDeducted = [...wanted.entries()].map(([key, w]) => ({ itemId: key, reference: w.reference, quantity: w.quantity }));
  if (!lot.stockDeductedAt) lot.stockDeductedAt = new Date();
  record.markModified('lots');
}

// ==================== LAQUAGE BARRES ROUTES (REPLACE EXISTING) ====================

app.get('/api/projects/:projectId/laquage/barres', requireAuth, async (req, res) => {
  try {
    let record = await LaquageBarres.findOne({ projectId: req.params.projectId });
    if (!record) {
      // Create with a single empty lot 0
      record = new LaquageBarres({
        projectId: req.params.projectId,
        lots: [
          {
            lotIndex: 0,
            status: 'draft',
            barresBrutes: [], barresLaquees: [],
            morceauxBruts: [], morceauxLaques: [],
            lineStatuses: {},
          },
        ],
        history: [],
      });
      await record.save();
    }
    res.json(record.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save/edit a specific lot's content (draft only, or admin)
app.put('/api/projects/:projectId/laquage/barres/lot/:lotIndex', requireAuth, async (req, res) => {
  try {
    const lotIdx = parseInt(req.params.lotIndex, 10);
    const { barresBrutes, barresLaquees, morceauxBruts, morceauxLaques } = req.body;

    let record = await LaquageBarres.findOne({ projectId: req.params.projectId });
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const userRole = req.user?.roleId?.name || '';
    const isAdmin = userRole === 'Admin';

    const lot = record.lots.find(l => l.lotIndex === lotIdx);
    if (!lot) return res.status(404).json({ error: `Lot ${lotIdx} not found` });

    if (lot.status !== 'draft' && !isAdmin) {
      return res.status(400).json({ error: 'Ce lot a déjà été envoyé. Créez un nouveau lot pour ajouter des articles.' });
    }

    if (barresBrutes !== undefined) lot.barresBrutes = barresBrutes;
    if (barresLaquees !== undefined) lot.barresLaquees = barresLaquees;
    if (morceauxBruts !== undefined) lot.morceauxBruts = morceauxBruts;
    if (morceauxLaques !== undefined) lot.morceauxLaques = morceauxLaques;

    // Lot already sent (admin edit) → apply only the stock difference.
    // Lots sent before the automatic deduction existed (no stockDeducted) are left alone.
    if (lot.status !== 'draft' && Array.isArray(lot.stockDeducted)) {
      const project = await Project.findById(req.params.projectId, 'name');
      await syncLaquageLotStock(record, lot, project);
    }

    record.markModified('lots');
    await record.save();
    res.json(record.toJSON());
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Add a new lot (Barreman can always do this if record is not fully received_coord)
app.post('/api/projects/:projectId/laquage/barres/lot', requireAuth, async (req, res) => {
  try {
    let record = await LaquageBarres.findOne({ projectId: req.params.projectId });
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const hasDraftLot = record.lots.some(l => l.status === 'draft');
    if (hasDraftLot) {
      return res.status(400).json({ error: 'Un lot en brouillon existe déjà. Finalisez-le avant d\'en créer un nouveau.' });
    }

    const { barresBrutes, barresLaquees, morceauxBruts, morceauxLaques, by } = req.body;
    const nextIdx = record.lots.length;

    record.lots.push({
      lotIndex: nextIdx,
      status: 'draft',
      barresBrutes: barresBrutes || [],
      barresLaquees: barresLaquees || [],
      morceauxBruts: morceauxBruts || [],
      morceauxLaques: morceauxLaques || [],
      lineStatuses: {},
    });

    const displayName = by || req.user?.displayName || 'Barreman';
    record.history.push({ action: 'add_lot', by: displayName, at: new Date(), lotIndex: nextIdx });

    record.markModified('lots');
    await record.save();
    res.status(201).json(record.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Action on a lot (send, receive lines, receive all, return, etc.)
app.post('/api/projects/:projectId/laquage/barres/action', requireAuth, async (req, res) => {
  try {
    const { action, lotIndex, lineKey, by, note, partialQty, lineLabel } = req.body;
    const lotIdx = lotIndex != null ? parseInt(lotIndex, 10) : 0;

    let record = await LaquageBarres.findOne({ projectId: req.params.projectId });
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const lot = record.lots.find(l => l.lotIndex === lotIdx);

    // Sending a draft lot: take the rows shown on screen (even if "Enregistrer" was not clicked)
    if (action === 'send_to_laquage' && lot && lot.status === 'draft') {
      const { barresBrutes, barresLaquees, morceauxBruts, morceauxLaques } = req.body;
      if (Array.isArray(barresBrutes)) lot.barresBrutes = barresBrutes;
      if (Array.isArray(barresLaquees)) lot.barresLaquees = barresLaquees;
      if (Array.isArray(morceauxBruts)) lot.morceauxBruts = morceauxBruts;
      if (Array.isArray(morceauxLaques)) lot.morceauxLaques = morceauxLaques;
      record.markModified('lots');
    }

    // Compute all line keys for auto-advance check
    let allLineKeys = [];
    if (lot) {
      (lot.barresBrutes || []).forEach((_, i) => allLineKeys.push(`bb-${i}`));
      (lot.barresLaquees || []).forEach((_, i) => allLineKeys.push(`bl-${i}`));
      (lot.morceauxBruts || []).forEach((_, i) => allLineKeys.push(`mb-${i}`));
      (lot.morceauxLaques || []).forEach((r, i) =>
        (r.lignes || [{}]).forEach((_, li) => allLineKeys.push(`ml-${i}-${li}`))
      );
    }

    if (action === 'send_to_laquage') {
      if (!lot) return res.status(404).json({ error: `Lot ${lotIdx} not found` });
      if (lot.status !== 'draft') return res.status(400).json({ error: 'Ce lot a déjà été envoyé au laquage.' });
      // Take barres brutes + barres laquées out of the inventory (throws 400 if unknown / insufficient)
      const project = await Project.findById(req.params.projectId, 'name');
      await syncLaquageLotStock(record, lot, project);
    }

    applyLaquageAction(record, action, lotIdx, lineKey, by, { note, partialQty, lineLabel, allLineKeys });
    await record.save();
    const out = record.toJSON();
    if (action === 'send_to_laquage') {
      // Summary shown in the toast: what was taken out of the stock
      out.stockDeducted = (lot.stockDeducted || []).map(d => ({ reference: d.reference, quantity: d.quantity }));
    }
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ==================== LAQUAGE ACCESSOIRES ROUTES (REPLACE EXISTING) ====================

app.get('/api/projects/:projectId/laquage/accessoires', requireAuth, async (req, res) => {
  try {
    let record = await LaquageAccessoires.findOne({ projectId: req.params.projectId });
    if (!record) {
      record = new LaquageAccessoires({
        projectId: req.params.projectId,
        lots: [{ lotIndex: 0, status: 'draft', accessoires: [], lineStatuses: {} }],
        history: [],
      });
      await record.save();
    }
    res.json(record.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/projects/:projectId/laquage/accessoires/lot/:lotIndex', requireAuth, async (req, res) => {
  try {
    const lotIdx = parseInt(req.params.lotIndex, 10);
    const { accessoires } = req.body;

    let record = await LaquageAccessoires.findOne({ projectId: req.params.projectId });
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const userRole = req.user?.roleId?.name || '';
    const isAdmin = userRole === 'Admin';

    const lot = record.lots.find(l => l.lotIndex === lotIdx);
    if (!lot) return res.status(404).json({ error: `Lot ${lotIdx} not found` });

    if (lot.status !== 'draft' && !isAdmin) {
      return res.status(400).json({ error: 'Ce lot a déjà été envoyé. Créez un nouveau lot pour ajouter des articles.' });
    }

    if (accessoires !== undefined) lot.accessoires = accessoires;
    record.markModified('lots');
    await record.save();
    res.json(record.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/projects/:projectId/laquage/accessoires/lot', requireAuth, async (req, res) => {
  try {
    let record = await LaquageAccessoires.findOne({ projectId: req.params.projectId });
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const hasDraftLot = record.lots.some(l => l.status === 'draft');
    if (hasDraftLot) {
      return res.status(400).json({ error: 'Un lot en brouillon existe déjà. Finalisez-le avant d\'en créer un nouveau.' });
    }
    const { accessoires, by } = req.body;
    const nextIdx = record.lots.length;

    record.lots.push({
      lotIndex: nextIdx,
      status: 'draft',
      accessoires: accessoires || [],
      lineStatuses: {},
    });

    const displayName = by || req.user?.displayName || 'Barreman';
    record.history.push({ action: 'add_lot', by: displayName, at: new Date(), lotIndex: nextIdx });
    record.markModified('lots');
    await record.save();
    res.status(201).json(record.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/projects/:projectId/laquage/accessoires/action', requireAuth, async (req, res) => {
  try {
    const { action, lotIndex, lineKey, by, note, partialQty, lineLabel } = req.body;
    const lotIdx = lotIndex != null ? parseInt(lotIndex, 10) : 0;

    let record = await LaquageAccessoires.findOne({ projectId: req.params.projectId });
    if (!record) return res.status(404).json({ error: 'Record not found' });

    // Compute all line keys for auto-advance check
    let allLineKeys = [];
    const lot = record.lots.find(l => l.lotIndex === lotIdx);
    if (lot) {
      (lot.accessoires || []).forEach((_, i) => allLineKeys.push(`acc-${i}`));
    }

    applyLaquageAction(record, action, lotIdx, lineKey, by, { note, partialQty, lineLabel, allLineKeys });
    await record.save();
    res.json(record.toJSON());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== LAQUAGE NOTIFICATION BELL (UPDATED) ====================
// The recent-actions endpoint already works because history entries now include lotIndex.
// Just make sure the frontend shows lotIndex in the notification label.
// No changes needed to the /api/laquage/recent-actions endpoint.
// ==================== LAQUAGE NOTIFICATION BELL ====================

app.get('/api/laquage/recent-actions', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const TOP_LEVEL_ACTIONS = new Set([
      'send_to_laquage', 'receive_all_laquage',
      'return_to_coord', 'receive_all_coord',
      'incomplete_line',
      'receive_incomplete_line_laquage',   // ← add
      'receive_incomplete_line_coord',     // ← add
    ]);
    const [barresRecords, accRecords, projects] = await Promise.all([
      LaquageBarres.find({}).select('projectId history').lean(),
      LaquageAccessoires.find({}).select('projectId history').lean(),
      Project.find({}).select('name reference').lean(),
    ]);
    const projMap = Object.fromEntries(projects.map(p => [p._id.toString(), p]));
    const events = [];
    for (const rec of [
      ...barresRecords.map(r => ({ ...r, _laqType: 'barres' })),
      ...accRecords.map(r => ({ ...r, _laqType: 'accessoires' })),
    ]) {
      const proj = projMap[rec.projectId?.toString()];
      if (!proj || !proj.name) continue;
      for (const h of (rec.history || [])) {
        const isTopLevel = TOP_LEVEL_ACTIONS.has(h.action)
          || h.action.startsWith('receive_line_laquage:')
          || h.action.startsWith('receive_line_coord:');
        if (!isTopLevel) continue;
        events.push({
          action: h.action, by: h.by || '—', at: h.at,
          note: h.note || null, partialQty: h.partialQty ?? null,
          lotIndex: h.lotIndex ?? null,
          projectId: rec.projectId, projectName: proj.name, projectRef: proj.reference || '',
          laqType: rec._laqType,
        });
      }
    }

    events.sort((a, b) => new Date(b.at) - new Date(a.at));
    const seen = new Set();
    const deduped = [];
    for (const ev of events) {
      // For top-level workflow actions (one per project), dedupe by action+project
      // For per-line actions, dedupe by action+project+time to allow multiples
      const isPerLine = ev.action.startsWith('receive_line_laquage:')
        || ev.action.startsWith('receive_line_coord:')
        || ev.action === 'receive_incomplete_line_laquage'
        || ev.action === 'receive_incomplete_line_coord'
        || ev.action === 'incomplete_line';
      const key = isPerLine
        ? `${ev.action}::${ev.projectId?.toString()}::${new Date(ev.at).getTime()}`
        : `${ev.action}::${ev.projectId?.toString()}::${ev.lotIndex ?? ''}`;

      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(ev);
      if (deduped.length >= limit) break;
    }
    res.json(deduped);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== PURCHASE REQUEST SCHEMA ====================

const purchaseRequestSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  itemName: { type: String, default: '' },
  itemImage: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 0.01 },
  note: { type: String, default: '' },
  requestedBy: { type: String, default: 'Admin' },
  requestedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'ordered'], default: 'pending' },
  orderedBy: { type: String, default: '' },
  orderedAt: { type: Date, default: null },
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; } } });
purchaseRequestSchema.index({ status: 1, createdAt: -1 });
purchaseRequestSchema.index({ createdAt: -1 });
purchaseRequestSchema.index({ itemId: 1, createdAt: -1 });
const PurchaseRequest = mongoose.model('PurchaseRequest', purchaseRequestSchema);

// ==================== PURCHASE REQUEST ROUTES ====================

app.post('/api/purchase-requests', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const { itemId, itemName, itemImage, quantity, note } = req.body;
    if (!itemId || !quantity || quantity <= 0) return res.status(400).json({ error: 'itemId and quantity (>0) required' });
    const pr = await PurchaseRequest.create({ itemId, itemName: itemName || '', itemImage: itemImage || '', quantity: parseFloat(quantity), note: note || '', requestedBy: req.user?.displayName || 'Admin', requestedAt: new Date() });
    res.status(201).json(pr);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/purchase-requests
//  - without ?page → plain array (notification bell), ?limit honoured (max 200)
//  - with ?page=1&limit=25[&status=pending|ordered][&q=] → { items, total, page, limit, hasMore, pendingCount }
const toPR = (d) => { d.id = String(d._id); delete d._id; delete d.__v; return d; };
app.get('/api/purchase-requests/count', requireAuth, async (req, res) => {
  try { res.json({ pending: await PurchaseRequest.countDocuments({ status: 'pending' }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/purchase-requests', requireAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.itemId && mongoose.Types.ObjectId.isValid(req.query.itemId)) filter.itemId = req.query.itemId; // requests for one article
    if (req.query.page === undefined) {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 200);
      const prs = await PurchaseRequest.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
      return res.json(prs.map(toPR));
    }
    const words = String(req.query.q || '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
    if (words.length) filter.$and = words.map(w => {
      const rx = new RegExp(escapeRegex(w), 'i');
      return { $or: [{ itemName: rx }, { note: rx }, { requestedBy: rx }] };
    });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const [items, total, pendingCount] = await Promise.all([
      PurchaseRequest.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PurchaseRequest.countDocuments(filter),
      PurchaseRequest.countDocuments({ status: 'pending' }),
    ]);
    res.json({ items: items.map(toPR), total, page, limit, hasMore: page * limit < total, pendingCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/purchase-requests/:id/mark-ordered', requireAuth, async (req, res) => {
  try {
    const pr = await PurchaseRequest.findById(req.params.id);
    if (!pr) return res.status(404).json({ error: 'Not found' });
    if (pr.status === 'ordered') return res.status(400).json({ error: 'Already ordered' });
    pr.status = 'ordered';
    pr.orderedBy = req.user?.displayName || req.user?.username || 'ACHAT';
    pr.orderedAt = new Date();
    await pr.save();
    res.json(pr);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/purchase-requests/:id', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const pr = await PurchaseRequest.findByIdAndDelete(req.params.id);
    if (!pr) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== LAQUAGE HISTORY DELETE ROUTES ====================

app.delete('/api/laquage/history-entry', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const { projectId, action, at } = req.body;
    if (!projectId || !action || !at) return res.status(400).json({ error: 'projectId, action and at required' });
    const targetTime = new Date(at).getTime();
    const barres = await LaquageBarres.findOne({ projectId });
    if (barres) { barres.history = (barres.history || []).filter(h => !(h.action === action && Math.abs(new Date(h.at).getTime() - targetTime) < 1000)); await barres.save(); }
    const acc = await LaquageAccessoires.findOne({ projectId });
    if (acc) { acc.history = (acc.history || []).filter(h => !(h.action === action && Math.abs(new Date(h.at).getTime() - targetTime) < 1000)); await acc.save(); }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/laquage/history-all', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    await Promise.all([
      LaquageBarres.updateMany({}, { $set: { history: [] } }),
      LaquageAccessoires.updateMany({}, { $set: { history: [] } }),
    ]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ==================== CHANTIER STATE ROUTES ====================

app.get('/api/chantier-states', requireAuth, async (req, res) => {
  try { res.json(await ChantierState.find().sort({ order: 1, createdAt: 1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/chantier-states', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const { key, label, color, order, isDefault } = req.body;
    if (!key || !label) return res.status(400).json({ error: 'key et label requis' });
    if (isDefault) await ChantierState.updateMany({}, { isDefault: false });
    const s = await ChantierState.create({ key: key.toLowerCase().replace(/\s+/g, '_'), label, color: color || '#6b7280', order: order || 0, isDefault: !!isDefault });
    res.status(201).json(s);
  } catch (e) { res.status(e.code === 11000 ? 409 : 400).json({ error: e.message }); }
});

app.put('/api/chantier-states/:id', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const { label, color, order, isDefault } = req.body;
    if (isDefault) await ChantierState.updateMany({ _id: { $ne: req.params.id } }, { isDefault: false });
    const s = await ChantierState.findByIdAndUpdate(req.params.id, { label, color, order, isDefault: !!isDefault }, { new: true, runValidators: true });
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/chantier-states/:id', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const s = await ChantierState.findByIdAndDelete(req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Chantier Unit Photos ─────────────────────────────────────────────────────
app.post('/api/chantiers/:id/unit-photo', requireAuth, async (req, res) => {
  try {
    const { chassisId, unitIndex, url } = req.body;
    if (!chassisId || url === undefined) return res.status(400).json({ error: 'chassisId et url requis' });
    const chantier = await Chantier.findByIdAndUpdate(
      req.params.id,
      { $push: { unitPhotos: { chassisId, unitIndex, url, createdAt: new Date() } } },
      { new: true }
    );
    if (!chantier) return res.status(404).json({ error: 'Chantier introuvable' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/chantiers/:id/unit-photo', requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url requis' });
    const chantier = await Chantier.findByIdAndUpdate(
      req.params.id,
      { $pull: { unitPhotos: { url } } },
      { new: true }
    );
    if (!chantier) return res.status(404).json({ error: 'Chantier introuvable' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ==================== TEAM ROUTES ====================

app.get('/api/teams', requireAuth, async (req, res) => {
  try { res.json(await Team.find().populate('stock.itemId').sort({ createdAt: 1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/teams/:id', requireAuth, async (req, res) => {
  try {
    const t = await Team.findById(req.params.id).populate('stock.itemId');
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/teams', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const { name, color, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name requis' });
    const t = await Team.create({ name, color: color || '#3b82f6', description: description || '', stock: [] });
    res.status(201).json(t);
  } catch (e) { res.status(e.code === 11000 ? 409 : 400).json({ error: e.message }); }
});
app.put('/api/teams/:id', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const { name, color, description } = req.body;
    const t = await Team.findByIdAndUpdate(req.params.id, { name, color, description }, { new: true, runValidators: true }).populate('stock.itemId');
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/teams/:id', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const assigned = await Chantier.countDocuments({ teamId: req.params.id });
    if (assigned > 0) return res.status(400).json({ error: `Cette équipe est assignée à ${assigned} chantier(s). Désassignez-la d'abord.` });
    await Team.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/teams/:id/stock/allocate', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    const qty = Number(quantity);
    if (!itemId || !qty || qty <= 0) return res.status(400).json({ error: 'itemId et quantity > 0 requis' });
    const item = await Item.findById(itemId);
    if (!item) return res.status(404).json({ error: 'Article introuvable' });
    if (item.quantity < qty) return res.status(400).json({ error: `Stock insuffisant: disponible ${item.quantity}` });
    item.quantity -= qty;
    await item.save();
    await StockMovement.create({ itemId: item._id, type: 'sortie', quantity: qty, balanceAfter: item.quantity, note: 'Allocation équipe' });
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: 'Équipe introuvable' });
    const existing = team.stock.find(s => s.itemId.toString() === itemId);
    if (existing) existing.quantity += qty;
    else team.stock.push({ itemId, quantity: qty });
    await team.save();
    await TeamStockMovement.create({ teamId: team._id, itemId, type: 'entree', quantity: qty, balanceAfter: existing ? existing.quantity : qty, note: 'Allocation depuis inventaire principal' });
    await team.populate('stock.itemId');
    res.json(team);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/teams/:id/stock/consume', requireAuth, async (req, res) => {
  try {
    const { itemId, quantity, chantierId, note } = req.body;
    const qty = Number(quantity);
    if (!itemId || !qty || qty <= 0) return res.status(400).json({ error: 'itemId et quantity > 0 requis' });
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: 'Équipe introuvable' });
    const stockEntry = team.stock.find(s => s.itemId.toString() === itemId);
    if (!stockEntry || stockEntry.quantity < qty) return res.status(400).json({ error: `Stock équipe insuffisant: disponible ${stockEntry?.quantity || 0}` });
    stockEntry.quantity -= qty;
    await team.save();
    let chantierName = '';
    if (chantierId) { const ch = await Chantier.findById(chantierId); chantierName = ch?.name || ''; }
    await TeamStockMovement.create({ teamId: team._id, itemId, type: 'chantier_use', quantity: qty, balanceAfter: stockEntry.quantity, chantierId: chantierId || null, chantierName, note: note || '' });
    await team.populate('stock.itemId');
    res.json(team);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/teams/:id/stock/return', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    const qty = Number(quantity);
    if (!itemId || !qty || qty <= 0) return res.status(400).json({ error: 'itemId et quantity > 0 requis' });
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ error: 'Équipe introuvable' });
    const stockEntry = team.stock.find(s => s.itemId.toString() === itemId);
    if (!stockEntry || stockEntry.quantity < qty) return res.status(400).json({ error: 'Quantité insuffisante dans le stock équipe' });
    stockEntry.quantity -= qty;
    await team.save();
    const item = await Item.findById(itemId);
    if (item) { item.quantity += qty; await item.save(); await StockMovement.create({ itemId: item._id, type: 'entree', quantity: qty, balanceAfter: item.quantity, note: `Retour stock équipe ${team.name}` }); }
    await TeamStockMovement.create({ teamId: team._id, itemId, type: 'chantier_return', quantity: qty, balanceAfter: stockEntry.quantity, note: 'Retour vers inventaire principal' });
    await team.populate('stock.itemId');
    res.json(team);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/teams/:id/stock/movements', requireAuth, async (req, res) => {
  try {
    const movements = await TeamStockMovement.find({ teamId: req.params.id })
      .populate('itemId').populate('chantierId').sort({ createdAt: -1 }).limit(200);
    res.json(movements);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CHANTIER ROUTES ====================

app.get('/api/chantiers', requireAuth, requirePermission('chantiers.view'), async (req, res) => {
  try {
    const chantiers = await Chantier.find()
      .populate('teamId')
      .populate({ path: 'projectIds', populate: [{ path: 'companyId' }, { path: 'clientId' }] })
      .sort({ createdAt: -1 });
    res.json(chantiers.map(c => c.toJSON()));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/chantiers/:id', requireAuth, requirePermission('chantiers.view'), async (req, res) => {
  try {
    const c = await Chantier.findById(req.params.id)
      .populate('teamId')
      .populate({ path: 'projectIds', populate: [{ path: 'companyId' }, { path: 'clientId' }, { path: 'usedBars.itemId' }] });
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c.toJSON());
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/chantiers', requireAuth, requirePermission('chantiers.edit'), async (req, res) => {
  try {
    const { name, reference, teamId, projectIds, dateDebut, dateCloture, status, notes } = req.body;
    if (!name || !reference) return res.status(400).json({ error: 'name et reference requis' });
    const c = await Chantier.create({ name, reference, teamId: teamId || null, projectIds: projectIds || [], dateDebut: dateDebut || null, dateCloture: dateCloture || null, status: status || 'planifie', notes: notes || '' });
    await c.populate('teamId');
    await c.populate({ path: 'projectIds', populate: [{ path: 'companyId' }, { path: 'clientId' }] });
    res.status(201).json(c.toJSON());
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});
app.put('/api/chantiers/:id', requireAuth, requirePermission('chantiers.edit'), async (req, res) => {
  try {
    const { name, reference, teamId, projectIds, dateDebut, dateCloture, status, notes } = req.body;
    const c = await Chantier.findByIdAndUpdate(req.params.id,
      { name, reference, teamId: teamId || null, projectIds: projectIds || [], dateDebut: dateDebut || null, dateCloture: dateCloture || null, status: status || 'planifie', notes: notes || '' },
      { new: true, runValidators: true }
    ).populate('teamId').populate({ path: 'projectIds', populate: [{ path: 'companyId' }, { path: 'clientId' }] });
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c.toJSON());
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/chantiers/:id/projects', requireAuth, requirePermission('chantiers.edit'), async (req, res) => {
  try {
    const { projectIds } = req.body;
    if (!Array.isArray(projectIds)) return res.status(400).json({ error: 'projectIds doit être un tableau' });
    const c = await Chantier.findByIdAndUpdate(req.params.id, { projectIds }, { new: true })
      .populate('teamId')
      .populate({ path: 'projectIds', populate: [{ path: 'companyId' }, { path: 'clientId' }] });
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c.toJSON());
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/chantiers/:id/unit-state', requireAuth, requirePermission('chantiers.edit'), async (req, res) => {
  try {
    const { chassisId, unitIndex, stateKey, notes } = req.body;
    if (!chassisId || unitIndex === undefined || !stateKey) return res.status(400).json({ error: 'chassisId, unitIndex et stateKey requis' });
    const stateExists = await ChantierState.findOne({ key: stateKey });
    if (!stateExists) return res.status(400).json({ error: `État inconnu: ${stateKey}` });
    const chantier = await Chantier.findById(req.params.id);
    if (!chantier) return res.status(404).json({ error: 'Chantier not found' });
    const existing = chantier.unitStates.find(u => u.chassisId === chassisId && u.unitIndex === unitIndex);
    if (existing) { existing.stateKey = stateKey; existing.notes = notes || existing.notes; existing.updatedAt = new Date(); }
    else { chantier.unitStates.push({ chassisId, unitIndex, stateKey, notes: notes || '', updatedAt: new Date() }); }
    await chantier.save();
    res.json({ success: true, unitStates: chantier.unitStates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/chantiers/:id', requireAuth, requirePermission('chantiers.delete'), async (req, res) => {
  try {
    const c = await Chantier.findByIdAndDelete(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ==================== ERROR HANDLERS ====================
app.use((req, res) => res.status(404).json({ error: 'Not Found', path: req.path }));
app.use((err, req, res, next) => { console.error('Unhandled:', err); res.status(500).json({ error: 'Internal Server Error', message: err.message }); });

app.listen(PORT, () => { console.log(`🚀 Server on port ${PORT}`); });
process.on('SIGTERM', () => { mongoose.connection.close(); process.exit(0); });