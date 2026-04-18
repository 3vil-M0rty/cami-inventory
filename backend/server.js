/**
 * CAMI / GIMAV — Backend Server
 * Full-featured: Inventory, Projects, Orders, Clients, Devis, BL, Companies
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');



const app = express();
const PORT = process.env.PORT || 3001;

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

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
  .then(() => { console.log('✅ MongoDB connected'); initSampleData(); migrateExistingData(); })
  .catch(err => { console.error('❌ MongoDB error:', err); process.exit(1); });

// ==================== SCHEMAS ====================

// --- Company ---
const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  logo: { type: String, default: '' },
  rc: { type: String, default: '' },
  ice: { type: String, default: '' },
  color: { type: String, default: '#1a1a1a' }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const Company = mongoose.model('Company', companySchema);












// --- SuperCategory ---
const superCategorySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  label: { fr: String, it: String, en: String },
  color: { type: String, default: '#3b82f6' },
  order: { type: Number, default: 0 }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const SuperCategory = mongoose.model('SuperCategory', superCategorySchema);


// --- Role & User (Auth) ---
const ALL_PERMISSIONS = [
  'inventory.view', 'inventory.edit', 'inventory.delete',
  // Per-supercategory inventory permissions
  'inventory.aluminium.view', 'inventory.aluminium.edit', 'inventory.aluminium.delete',
  'inventory.verre.view', 'inventory.verre.edit', 'inventory.verre.delete',
  'inventory.accessoires.view', 'inventory.accessoires.edit', 'inventory.accessoires.delete',
  'inventory.poudre.view', 'inventory.poudre.edit', 'inventory.poudre.delete',
  'orders.view', 'orders.edit', 'orders.delete', 'orders.receive',
  'projects.view', 'projects.edit', 'projects.delete',
  'clients.view', 'clients.edit', 'clients.delete',
  'devis.view', 'devis.edit', 'devis.delete', 'devis.prices',
  'movements.view',
  'analytics.view',
  'admin.view',
  'ateliertables.view'
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
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; delete ret.passwordHash; return ret; } } });
const User = mongoose.model('User', userSchema);

const sessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
const Session = mongoose.model('Session', sessionSchema);

// --- Category ---
const categorySchema = new mongoose.Schema({
  name: { it: { type: String, required: true }, fr: { type: String, required: true }, en: { type: String, required: true } },
  color: { type: String, default: '#3b82f6' },
  order: { type: Number, default: 0 },
  superCategory: { type: String, default: 'aluminium' }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const Category = mongoose.model('Category', categorySchema);

// --- Item ---
const itemSchema = new mongoose.Schema({
  image: { type: String, default: '' },
  designation: { it: { type: String, required: true }, fr: { type: String, required: true }, en: { type: String, required: true } },
  quantity: { type: Number, required: true, min: 0, default: 0 },
  orderedQuantity: { type: Number, min: 0, default: 0 },
  threshold: { type: Number, required: true, min: 0, default: 0 },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  superCategory: { type: String, default: 'aluminium' }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const Item = mongoose.model('Item', itemSchema);

// --- Stock Movement ---
const stockMovementSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  type: { type: String, enum: ['entree', 'sortie', 'project_use', 'project_return', 'order_reception'], required: true },
  quantity: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  note: { type: String, default: '' },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  projectName: { type: String, default: '' },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
}, { timestamps: true });
const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

// --- Order ---
const orderLineSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  quantityOrdered: { type: Number, required: true, min: 1 },
  quantityReceived: { type: Number, default: 0, min: 0 },
  unitPrice: { type: Number, default: 0 },
  note: { type: String, default: '' }
}, { _id: true });

const orderSchema = new mongoose.Schema({
  reference: { type: String, required: true, trim: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  supplier: { type: String, default: '' },
  orderDate: { type: Date, required: true },
  expectedDate: { type: Date, default: null },
  status: { type: String, enum: ['en_attente', 'partielle', 'recue', 'annulee'], default: 'en_attente' },
  lines: [orderLineSchema],
  notes: { type: String, default: '' }
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const Order = mongoose.model('Order', orderSchema);

// --- Client ---
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

// --- Devis ---
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

// --- ChassisType ---
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

// --- ChassisTypeAccessory ---
const chassisTypeAccessorySchema = new mongoose.Schema({
  chassisTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChassisType', required: true },
  itemId: { type: String, default: '' },  // inventory item id (string, optional)
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  quantity: { type: Number, default: 0, min: 0 },
  formula: { type: String, default: '' },  // JS-safe expression using L and H, e.g. "2*(L+H)/1000"
}, { timestamps: true });
chassisTypeAccessorySchema.index({ chassisTypeId: 1 });
const ChassisTypeAccessory = mongoose.model('ChassisTypeAccessory', chassisTypeAccessorySchema);

// --- Component schemas ---
const componentSchema = new mongoose.Schema({
  role: { type: String, enum: ['dormant', 'vantail'], required: true },
  repere: { type: String, default: '' },
  largeur: { type: Number, default: 0 },
  hauteur: { type: Number, default: 0 },
  etat: { type: String, enum: ['non_entame', 'en_cours', 'fabrique', 'livre'], default: 'non_entame' }
}, { _id: true });

const unitComponentSchema = new mongoose.Schema({
  compIndex: { type: Number, required: true },
  etat: { type: String, enum: ['non_entame', 'en_cours', 'fabrique', 'livre'], default: 'non_entame' },
  deliveryDate: { type: Date, default: null }
}, { _id: false });

const unitSchema = new mongoose.Schema({
  unitIndex: { type: Number, required: true },
  etat: { type: String, enum: ['non_entame', 'en_cours', 'fabrique', 'livre'], default: 'non_entame' },
  deliveryDate: { type: Date, default: null },
  notes: { type: String, default: '' },
  atelierTable: { type: String, default: '' },
  componentStates: [unitComponentSchema]
}, { _id: true });

const chassisAccessorySchema = new mongoose.Schema({
  itemId: { type: String, default: '' },  // inventory item id (optional, for reference)
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  quantity: { type: Number, default: 0 },   // fixed quantity (used when formula is empty)
  formula: { type: String, default: '' },  // JS-safe expression using L and H, e.g. "2*(L+H)/1000"
}, { _id: true });

const chassisSchema = new mongoose.Schema({
  type: { type: String, required: true },
  repere: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  largeur: { type: Number, required: true },
  hauteur: { type: Number, required: true },
  dimension: { type: String, default: '' },
  components: [componentSchema],
  units: [unitSchema],
  accessories: [chassisAccessorySchema],
}, { _id: true });

// --- Project ---
const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  reference: { type: String, required: true, trim: true },
  ralCode: { type: String, required: true, trim: true },
  ralColor: { type: String, default: '#ffffff' },
  date: { type: Date, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
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
const Project = mongoose.model('Project', projectSchema);

// ==================== STATUS COMPUTATION ====================

function computeProjectStatus(chassis) {
  if (!chassis || chassis.length === 0) return 'en_cours';
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
        const etat = composite ? deriveCompositeUnitEtat(u, numComps) : (u.etat || 'non_entame');
        allEtats.push(etat);
      }
    }
  }
  if (allEtats.length === 0) return 'en_cours';
  if (allEtats.every(e => e === 'livre')) return 'cloture';
  if (allEtats.every(e => e === 'fabrique' || e === 'livre')) return 'fabrique';
  return 'en_cours';
}

function deriveCompositeUnitEtat(unit, numComponents) {
  if (!numComponents) return unit.etat || 'non_entame';
  const states = [];
  for (let i = 0; i < numComponents; i++) {
    const cs = (unit.componentStates || []).find(c => c.compIndex === i);
    states.push(cs ? cs.etat : 'non_entame');
  }
  if (states.every(e => e === 'livre')) return 'livre';
  if (states.every(e => e === 'fabrique' || e === 'livre')) return 'fabrique';
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

async function createDefaultAdminUser() {
  // 1. Ensure the Admin role exists
  let adminRole = await Role.findOne({ name: 'Admin' });
  if (!adminRole) {
    adminRole = await Role.create({
      name: 'Admin',
      permissions: ALL_PERMISSIONS,
      color: '#1a1a1a',
      isSystem: true,
    });
    console.log('✅ Admin role created');
  }

  // 2. Ensure default user exists in the User collection (NOT a separate Admin model)
  const existing = await User.findOne({ username: 'admin' });
  if (!existing) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await User.create({
      username: 'admin',
      displayName: 'Administrateur',
      passwordHash,
      roleId: adminRole._id,
      active: true,
    });
    console.log('✅ Default user created: admin / admin123');
  } else {
    console.log('ℹ️  Default admin user already exists');
  }
}

async function initSampleData() {
  // Companies
  const compCount = await Company.countDocuments();
  if (compCount === 0) {
    await Company.insertMany([
      {
        name: 'CAMI',
        address: 'Zone Industrielle, Marrakech, Maroc',
        phone: '+212 5XX-XXXXXX',
        email: 'contact@cami.ma',
        color: '#f10000',
        logo: '/cami.png',
        rc: '',
        ice: '',
      },
      {
        name: 'GIMAV',
        address: 'Zone Industrielle, Marrakech, Maroc',
        phone: '+212 5XX-XXXXXX',
        email: 'contact@gimav.ma',
        color: '#032699',
        logo: '/gimav.png',
        rc: '',
        ice: '',
      },
    ]);
    console.log('✅ Companies seeded');
  }

  // Chassis types
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
}

// Run seed after connection is open
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
  } catch (e) {
    console.error('Migration error:', e.message);
  }
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
    res.json({
      success: true,
      itemsMigrated: itemResult.modifiedCount,
      categoriesMigrated: catResult.modifiedCount,
      message: `${itemResult.modifiedCount} articles et ${catResult.modifiedCount} catégories migrés vers aluminium`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== COMPANY ROUTES ====================
app.get('/api/companies', async (req, res) => {
  try { res.json(await Company.find().sort({ createdAt: 1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/companies', async (req, res) => {
  try {
    const c = new Company(req.body);
    await c.save();
    res.status(201).json(c);
  } catch (e) { res.status(400).json({ error: e.message }); }
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

// ==================== AUTH MIDDLEWARE ====================

async function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const session = await Session.findOne({ token, expiresAt: { $gt: new Date() } });
    if (!session) return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' });
    const user = await User.findById(session.userId).populate('roleId');
    if (!user || !user.active) return res.status(401).json({ error: 'Compte désactivé' });
    req.user = user;
    req.permissions = user.roleId?.permissions || [];
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.permissions.includes(perm)) {
      return res.status(403).json({ error: `Accès refusé — permission requise: ${perm}` });
    }
    next();
  };
}

/**
 * Resolves which supercategory keys a user can VIEW.
 *
 * Priority rules (subcategory perms always win over global):
 *
 *   CASE 1 — subcategory perms present (with or without global):
 *     → return only the explicitly allowed subcategories
 *     → global inventory.view is treated as a fallback, not an override
 *
 *   CASE 2 — ONLY global inventory.view, no subcategory perms:
 *     → return null (no DB filter = all supercategories visible)
 *     → backward-compatible for admin/full-access roles
 *
 *   CASE 3 — neither:
 *     → return [] (no access)
 *
 * This means: if you grant inventory.view + accessoires.view,
 * the user sees ONLY accessoires (subcategory wins).
 */
async function resolveAllowedSCs(permissions) {
  if (!permissions || permissions.length === 0) return [];

  // Collect all known SC keys (built-in + dynamic from DB)
  const BUILTIN = ["aluminium", "verre", "accessoires", "poudre"];
  let ALL_SC = [...BUILTIN];
  try {
    const dbSCs = await SuperCategory.find().lean();
    const dbKeys = dbSCs.map(s => s.key);
    ALL_SC = [...new Set([...BUILTIN, ...dbKeys])];
  } catch { /* use built-ins */ }

  // Admin shortcut
  if (permissions.includes("admin.view")) return null;

  // Collect explicitly granted subcategory view perms
  const scPerms = ALL_SC.filter(sc => permissions.includes(`inventory.${sc}.view`));

  if (scPerms.length > 0) {
    // Subcategory perms are set → they WIN, restrict to exactly those
    return scPerms;
  }

  if (permissions.includes("inventory.view")) {
    // Global view only, no subcategory restrictions → show all
    return null;
  }

  return []; // no inventory access
}

/**
 * Can the user edit items in a given supercategory?
 *
 * Same priority logic as resolveAllowedSCs:
 *   - If ANY subcategory edit perm exists → only those subcategories are editable
 *   - If ONLY global inventory.edit → all editable
 *   - inventory.edit + sc.edit → only the sc (subcategory wins)
 */
function canEditSC(permissions, sc) {
  if (!permissions || permissions.length === 0) return false;
  // Check explicit SC edit perm first
  if (permissions.includes(`inventory.${sc}.edit`)) return true;
  // Check if any OTHER sc edit perm exists — if so, global doesn't help for THIS sc
  const BUILTIN = ["aluminium", "verre", "accessoires", "poudre"];
  const hasAnySCEdit = BUILTIN.some(s => permissions.includes(`inventory.${s}.edit`));
  if (hasAnySCEdit) return false; // other SCs are explicitly controlled, this one isn't granted
  // No SC-specific edit perms at all → fall back to global
  return permissions.includes("inventory.edit");
}

/**
 * Can the user delete items in a given supercategory?
 * Same priority logic as canEditSC.
 */
function canDeleteSC(permissions, sc) {
  if (!permissions || permissions.length === 0) return false;
  if (permissions.includes(`inventory.${sc}.delete`)) return true;
  const BUILTIN = ["aluminium", "verre", "accessoires", "poudre"];
  const hasAnySCDelete = BUILTIN.some(s => permissions.includes(`inventory.${s}.delete`));
  if (hasAnySCDelete) return false;
  return permissions.includes("inventory.delete");
}

/**
 * Middleware: inject allowedSuperCategories into req (optional auth).
 * Public routes still work if no token sent (allowed = all).
 */
async function optionalAuth(req, res, next) {
  const token = req.headers["x-auth-token"] || req.headers["authorization"]?.replace("Bearer ", "");
  if (!token) { req.permissions = []; req.allowedSuperCategories = null; return next(); }
  try {
    const session = await Session.findOne({ token, expiresAt: { $gt: new Date() } });
    if (!session) { req.permissions = []; req.allowedSuperCategories = null; return next(); }
    const user = await User.findById(session.userId).populate("roleId");
    req.user = user;
    req.permissions = user?.roleId?.permissions || [];
    req.allowedSuperCategories = await resolveAllowedSCs(req.permissions);
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
    res.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.roleId?.name, permissions: user.roleId?.permissions || [], companyId: user.companyId }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', async (req, res) => {
  const token = req.headers['x-auth-token'] || req.headers['authorization']?.replace('Bearer ', '');
  if (token) await Session.deleteOne({ token });
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    id: req.user.id, username: req.user.username, displayName: req.user.displayName,
    role: req.user.roleId?.name, permissions: req.permissions, companyId: req.user.companyId
  });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
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
  try {
    const r = await Role.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    r.name = req.body.name || r.name;
    r.permissions = req.body.permissions ?? r.permissions;
    r.color = req.body.color || r.color;
    await r.save();
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/roles/:id', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const r = await Role.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.isSystem) return res.status(400).json({ error: 'Impossible de supprimer le rôle Admin système' });
    const usersWithRole = await User.countDocuments({ roleId: req.params.id });
    if (usersWithRole > 0) return res.status(400).json({ error: `${usersWithRole} utilisateur(s) ont ce rôle. Changez leur rôle d'abord.` });
    await Role.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== USER ROUTES ====================

app.get('/api/users', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try { res.json(await User.find().populate('roleId').populate('companyId').sort({ createdAt: -1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const { username, displayName, password, roleId, companyId, active } = req.body;
    if (!username || !password || !roleId) return res.status(400).json({ error: 'username, password et roleId requis' });
    if (password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });
    const hash = await bcrypt.hash(password, 10);
    const u = await User.create({ username: username.toLowerCase().trim(), displayName, passwordHash: hash, roleId, companyId: companyId || null, active: active !== false });
    await u.populate('roleId'); await u.populate('companyId');
    res.status(201).json(u);
  } catch (e) { res.status(e.code === 11000 ? 409 : 400).json({ error: e.message }); }
});

app.put('/api/users/:id', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Not found' });
    if (req.body.displayName) u.displayName = req.body.displayName;
    if (req.body.roleId) u.roleId = req.body.roleId;
    if (req.body.companyId !== undefined) u.companyId = req.body.companyId || null;
    if (req.body.active !== undefined) u.active = req.body.active;
    if (req.body.password && req.body.password.length >= 4) {
      u.passwordHash = await bcrypt.hash(req.body.password, 10);
    }
    await u.save(); await u.populate('roleId'); await u.populate('companyId');
    res.json(u);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    if (req.user.id === req.params.id) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    await User.findByIdAndDelete(req.params.id);
    await Session.deleteMany({ userId: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/permissions', requireAuth, requirePermission('admin.view'), async (req, res) => {
  // Build dynamic per-supercategory permissions
  const superCats = await SuperCategory.find().sort({ order: 1 }).lean();
  const allSuperCats = superCats.length ? superCats : [
    { key: 'aluminium', label: { fr: 'Aluminium', it: 'Alluminio', en: 'Aluminium' } },
    { key: 'verre', label: { fr: 'Verre', it: 'Vetro', en: 'Glass' } },
    { key: 'accessoires', label: { fr: 'Accessoires', it: 'Accessori', en: 'Accessories' } },
    { key: 'poudre', label: { fr: 'Poudre', it: 'Polvere', en: 'Powder' } },
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
    ...scPerms,
    { key: 'orders.view', label: 'Commandes — Voir', group: 'Commandes' },
    { key: 'orders.edit', label: 'Commandes — Créer/Modifier', group: 'Commandes' },
    { key: 'orders.receive', label: 'Commandes — Réceptionner', group: 'Commandes' },
    { key: 'orders.delete', label: 'Commandes — Supprimer', group: 'Commandes' },
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
    await c.save();
    res.status(201).json(c);
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

/**
 * Helper: apply supercategory permission filter to a Mongoose filter object.
 *
 * allowedSC:
 *   null   => user has global inventory.view  => no restriction at all
 *   []     => user has NO view access         => return false (empty result)
 *   [...]  => restrict items to these keys
 *
 * When the frontend sends ?superCategory=X:
 *   - If X is in allowedSC => keep the filter as-is (show only X)
 *   - If X is NOT in allowedSC => clamp to allowedSC (security, tabs should
 *     have already hidden X but this is a safe fallback)
 *
 * Returns false if the caller should immediately return an empty array.
 */
function applyScFilter(filter, allowedSC) {
  if (allowedSC === null) return true;      // global view, no SC restriction
  if (allowedSC.length === 0) return false; // no access at all

  const requested = filter.superCategory;

  if (requested && typeof requested === 'string') {
    if (allowedSC.includes(requested)) {
      // Requested SC is allowed — keep filter as-is
      return true;
    } else {
      // Requested SC is not in allowed list — override with allowed list
      // (frontend tabs should have prevented this, but safe fallback)
      filter.superCategory = { $in: allowedSC };
      return true;
    }
  }

  // No specific SC requested — restrict to allowed list
  filter.superCategory = { $in: allowedSC };
  return true;
}

// Also expose allowed supercategories as a dedicated endpoint so the frontend
// can show/hide tabs without needing to enumerate inventory items.
app.get('/api/inventory/allowed-supercategories', optionalAuth, (req, res) => {
  // null => all allowed (admin), array => subset
  res.json({ allowedSuperCategories: req.allowedSuperCategories });
});

app.get('/api/inventory', optionalAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.categoryId && req.query.categoryId !== 'all') filter.categoryId = req.query.categoryId;
    if (req.query.superCategory && req.query.superCategory !== 'all') filter.superCategory = req.query.superCategory;
    if (!applyScFilter(filter, req.allowedSuperCategories)) return res.json([]);
    res.json(await Item.find(filter).populate('categoryId').sort({ createdAt: -1 }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/inventory/filter/low-stock', optionalAuth, async (req, res) => {
  try {
    const filter = {};
    if (!applyScFilter(filter, req.allowedSuperCategories)) return res.json([]);
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
    if (req.query.q) filter.$or = [
      { 'designation.it': { $regex: req.query.q, $options: 'i' } },
      { 'designation.fr': { $regex: req.query.q, $options: 'i' } },
      { 'designation.en': { $regex: req.query.q, $options: 'i' } },
    ];
    res.json(await Item.find(filter).populate('categoryId').sort({ createdAt: -1 }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/inventory/:id', optionalAuth, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id).populate('categoryId');
    if (!item) return res.status(404).json({ error: 'Not found' });
    // Check per-item supercategory access
    const sc = item.superCategory || 'aluminium';
    const allowed = req.allowedSuperCategories;
    if (allowed !== null && !allowed.includes(sc)) {
      return res.status(403).json({ error: 'Accès refusé à cette catégorie' });
    }
    res.json(item);
  } catch (e) { res.status(e.kind === 'ObjectId' ? 400 : 500).json({ error: e.message }); }
});
app.post('/api/inventory', optionalAuth, async (req, res) => {
  try {
    const sc = req.body.superCategory || 'aluminium';
    if (!canEditSC(req.permissions, sc)) return res.status(403).json({ error: `Accès refusé — permission requise: inventory.${sc}.edit` });
    const item = new Item({
      image: req.body.image || '', designation: req.body.designation,
      quantity: Number(req.body.quantity) || 0, orderedQuantity: Number(req.body.orderedQuantity) || 0,
      threshold: Number(req.body.threshold) || 0, categoryId: req.body.categoryId || null,
      superCategory: sc
    });
    await item.save();
    await item.populate('categoryId');
    res.status(201).json(item);
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});
app.put('/api/inventory/:id', optionalAuth, async (req, res) => {
  try {
    const sc = req.body.superCategory || 'aluminium';
    if (!canEditSC(req.permissions, sc)) return res.status(403).json({ error: `Accès refusé — permission requise: inventory.${sc}.edit` });
    const item = await Item.findByIdAndUpdate(req.params.id, {
      image: req.body.image, designation: req.body.designation,
      quantity: Number(req.body.quantity) || 0, orderedQuantity: Number(req.body.orderedQuantity) || 0,
      threshold: Number(req.body.threshold) || 0, categoryId: req.body.categoryId || null,
      superCategory: sc
    }, { new: true, runValidators: true }).populate('categoryId');
    if (!item) return res.status(404).json({ error: 'Not found' });
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
    if (!canEditSC(req.permissions, sc)) return res.status(403).json({ error: `Accès refusé — permission requise: inventory.${sc}.edit` });
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
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().populate('lines.itemId').populate('companyId').sort({ createdAt: -1 });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/orders/:id', async (req, res) => {
  try {
    const o = await Order.findById(req.params.id).populate('lines.itemId').populate('companyId');
    if (!o) return res.status(404).json({ error: 'Not found' });
    res.json(o);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/orders', async (req, res) => {
  try {
    const o = new Order({
      reference: req.body.reference, companyId: req.body.companyId || null,
      supplier: req.body.supplier || '', orderDate: req.body.orderDate,
      expectedDate: req.body.expectedDate || null, notes: req.body.notes || '',
      lines: (req.body.lines || []).map(l => ({
        itemId: l.itemId, quantityOrdered: Number(l.quantityOrdered) || 1,
        quantityReceived: 0, unitPrice: Number(l.unitPrice) || 0, note: l.note || ''
      }))
    });
    for (const line of o.lines) {
      await Item.findByIdAndUpdate(line.itemId, { $inc: { orderedQuantity: line.quantityOrdered } });
    }
    await o.save();
    await o.populate('lines.itemId');
    await o.populate('companyId');
    res.status(201).json(o);
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});
app.put('/api/orders/:id', async (req, res) => {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Not found' });

    // Scalar fields
    o.reference = req.body.reference;
    o.companyId = req.body.companyId || null;
    o.supplier = req.body.supplier || '';
    o.orderDate = req.body.orderDate;
    o.expectedDate = req.body.expectedDate || null;
    o.notes = req.body.notes || '';
    o.status = req.body.status;

    // Lines — update in place to preserve quantityReceived on existing lines,
    // adjust orderedQuantity on inventory items for added/removed/changed lines
    if (Array.isArray(req.body.lines)) {
      const oldLines = o.lines;

      // Reverse old orderedQuantity contributions for lines that are changing qty or being removed
      for (const oldLine of oldLines) {
        const incoming = req.body.lines.find(l => l._id && l._id.toString() === oldLine._id.toString());
        const oldPending = oldLine.quantityOrdered - (oldLine.quantityReceived || 0);
        if (!incoming) {
          // Line removed — reverse its pending orderedQuantity
          if (oldPending > 0) await Item.findByIdAndUpdate(oldLine.itemId, { $inc: { orderedQuantity: -oldPending } });
        } else if (Number(incoming.quantityOrdered) !== oldLine.quantityOrdered) {
          // Quantity changed — adjust the delta
          const newPending = Number(incoming.quantityOrdered) - (oldLine.quantityReceived || 0);
          const delta = newPending - oldPending;
          if (delta !== 0) await Item.findByIdAndUpdate(oldLine.itemId, { $inc: { orderedQuantity: delta } });
        }
      }

      // Apply orderedQuantity for brand-new lines (no _id)
      for (const incoming of req.body.lines) {
        if (!incoming._id) {
          await Item.findByIdAndUpdate(incoming.itemId, { $inc: { orderedQuantity: Number(incoming.quantityOrdered) || 1 } });
        }
      }

      // Build new lines array, preserving quantityReceived for existing lines
      o.lines = req.body.lines.map(l => {
        const existing = l._id ? oldLines.find(ol => ol._id.toString() === l._id.toString()) : null;
        return {
          _id: existing?._id,
          itemId: l.itemId,
          quantityOrdered: Number(l.quantityOrdered) || 1,
          quantityReceived: existing?.quantityReceived || 0,
          unitPrice: Number(l.unitPrice) || 0,
          note: l.note || '',
        };
      });
    }

    await o.save();
    await o.populate('lines.itemId');
    await o.populate('companyId');
    res.json(o);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/orders/:id/receive', async (req, res) => {
  try {
    const { lineId, quantityReceived } = req.body;
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });
    const line = o.lines.id(lineId);
    if (!line) return res.status(404).json({ error: 'Line not found' });
    const alreadyReceived = line.quantityReceived || 0;
    const newlyReceived = Number(quantityReceived) - alreadyReceived;
    if (newlyReceived <= 0) return res.status(400).json({ error: 'New reception quantity must be greater than already received' });
    line.quantityReceived = Number(quantityReceived);
    const item = await Item.findById(line.itemId);
    if (item) {
      item.quantity += newlyReceived;
      item.orderedQuantity = Math.max(0, (item.orderedQuantity || 0) - newlyReceived);
      await item.save();
      await StockMovement.create({
        itemId: item._id, type: 'order_reception', quantity: newlyReceived,
        balanceAfter: item.quantity, orderId: o._id, note: `Réception commande ${o.reference}`
      });
    }
    const allReceived = o.lines.every(l => l.quantityReceived >= l.quantityOrdered);
    const someReceived = o.lines.some(l => (l.quantityReceived || 0) > 0);
    if (allReceived) o.status = 'recue';
    else if (someReceived) o.status = 'partielle';
    await o.save();
    await o.populate('lines.itemId');
    await o.populate('companyId');
    res.json(o);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/orders/:id', async (req, res) => {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Not found' });
    for (const line of o.lines) {
      const notReceived = line.quantityOrdered - (line.quantityReceived || 0);
      if (notReceived > 0) {
        await Item.findByIdAndUpdate(line.itemId, { $inc: { orderedQuantity: -notReceived } });
      }
    }
    await Order.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  try {
    const c = new Client(req.body);
    await c.save();
    await c.populate('companyId');
    res.status(201).json(c);
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
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
    const list = await Devis.find(filter).populate('clientId').populate('companyId').sort({ createdAt: -1 });
    res.json(list);
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
  try {
    const d = new Devis(req.body);
    await d.save();
    await d.populate('clientId');
    await d.populate('companyId');
    res.status(201).json(d);
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
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
      name: req.body.name, reference: req.body.reference,
      ralCode: req.body.ralCode, ralColor: req.body.ralColor || '#ffffff',
      date: req.body.date, companyId: req.body.companyId || null,
      clientId: req.body.clientId || null
    });
    await p.save();
    res.status(201).json(p.toJSON());
  } catch (e) { res.status(e.name === 'ValidationError' ? 400 : 500).json({ error: e.message }); }
});
app.put('/api/projects/:id', async (req, res) => {
  try {
    const p = await Project.findByIdAndUpdate(req.params.id,
      { name: req.body.name, reference: req.body.reference, ralCode: req.body.ralCode, ralColor: req.body.ralColor, date: req.body.date, companyId: req.body.companyId || null, clientId: req.body.clientId || null },
      { new: true, runValidators: true }
    ).populate('usedBars.itemId').populate('companyId').populate('clientId');
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
    const qty = Number(req.body.quantity) || 1;
    const units = Array.from({ length: qty }, (_, i) => ({ unitIndex: i, etat: req.body.etat || 'non_entame', deliveryDate: null, notes: '' }));
    project.chassis.push({ type: req.body.type, repere: req.body.repere, quantity: qty, largeur: Number(req.body.largeur) || 0, hauteur: Number(req.body.hauteur) || 0, dimension: req.body.dimension || `${req.body.largeur}×${req.body.hauteur}`, components: req.body.components || [], units });
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
    if (req.body.type !== undefined) chassis.type = req.body.type;
    if (req.body.repere !== undefined) chassis.repere = req.body.repere;
    if (req.body.largeur !== undefined) chassis.largeur = Number(req.body.largeur);
    if (req.body.hauteur !== undefined) chassis.hauteur = Number(req.body.hauteur);
    if (req.body.dimension !== undefined) chassis.dimension = req.body.dimension;
    if (req.body.components !== undefined) chassis.components = req.body.components;
    if (req.body.quantity !== undefined) {
      const newQty = Number(req.body.quantity);
      const oldQty = chassis.quantity;
      chassis.quantity = newQty;
      if (newQty > oldQty) { for (let i = oldQty; i < newQty; i++) chassis.units.push({ unitIndex: i, etat: 'non_entame', deliveryDate: null, notes: '' }); }
      else if (newQty < oldQty) { chassis.units = chassis.units.filter(u => u.unitIndex < newQty); }
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
    if (req.body.deliveryDate !== undefined && req.body.etat === undefined) { unit.deliveryDate = req.body.deliveryDate ? new Date(req.body.deliveryDate) : null; }
    if (req.body.notes !== undefined) unit.notes = req.body.notes;
    if (req.body.atelierTable !== undefined) unit.atelierTable = req.body.atelierTable;
    await project.save();
    res.json(await populateAndReturn(project));
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
    const unitIdx = parseInt(req.params.unitIndex, 10);
    const compIdx = parseInt(req.params.compIndex, 10);
    if (compIdx < 0 || compIdx >= numComps) return res.status(400).json({ error: 'Invalid component index' });
    let unit = chassis.units.find(u => u.unitIndex === unitIdx);
    if (!unit) { chassis.units.push({ unitIndex: unitIdx, etat: 'non_entame', deliveryDate: null, notes: '', componentStates: Array.from({ length: numComps }, (_, ci) => ({ compIndex: ci, etat: 'non_entame' })) }); unit = chassis.units.find(u => u.unitIndex === unitIdx); }
    if (!unit.componentStates) unit.componentStates = [];
    let cs = unit.componentStates.find(c => c.compIndex === compIdx);
    if (!cs) { unit.componentStates.push({ compIndex: compIdx, etat: 'non_entame', deliveryDate: null }); cs = unit.componentStates.find(c => c.compIndex === compIdx); }
    if (req.body.etat !== undefined) { cs.etat = req.body.etat; cs.deliveryDate = req.body.etat === 'livre' ? (req.body.deliveryDate ? new Date(req.body.deliveryDate) : new Date()) : null; }
    unit.etat = deriveCompositeUnitEtat(unit, numComps);
    if (unit.etat === 'livre') { const dates = (unit.componentStates || []).map(c => c.deliveryDate).filter(Boolean); unit.deliveryDate = dates.length ? new Date(Math.max(...dates.map(d => new Date(d)))) : new Date(); }
    else { unit.deliveryDate = null; }
    await project.save();
    res.json(await populateAndReturn(project));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/projects/:id/chassis/:cid', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassis = project.chassis.id(req.params.cid);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });
    project.chassis.pull(req.params.cid);
    await project.save();
    res.json(await populateAndReturn(project));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CHASSIS LINE ACCESSORIES ROUTES ====================
// Per-chassis-line accessory configuration (stored on the chassis subdocument)
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

      return {
        itemId: a.itemId || '',
        label: a.label || '',
        unit: a.unit || '',

        // 🔥 KEY FIX
        quantity: hasFormula ? 0 : (Number(a.quantity) || 0),
        formula: hasFormula ? a.formula.trim() : '',
      };
    });
    await project.save();
    res.json(chassis.accessories);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


app.get('/api/projects/:id/bons-livraison', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate('usedBars.itemId').populate('companyId').populate('clientId');
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const chassisTypes = await ChassisType.find().lean();
    const typeLabel = (v) => { const ct = chassisTypes.find(t => t.value === v); return ct ? (ct.fr || ct.value) : v; };
    const blMap = {};
    const ensureBL = (dateKey) => {
      if (!blMap[dateKey]) {
        blMap[dateKey] = { blId: `BL-${project._id.toString().slice(-6).toUpperCase()}-${dateKey.replace(/-/g, '')}`, projectId: project._id, projectName: project.name, reference: project.reference, ralCode: project.ralCode, ralColor: project.ralColor, company: project.companyId || null, client: project.clientId || null, deliveryDate: dateKey, units: [] };
      }
      return blMap[dateKey];
    };
    for (const chassis of project.chassis) {
      const isComposite = (chassis.components || []).length > 0;
      const unitSuffix = (idx) => chassis.quantity > 1 ? ` #${idx + 1}` : '';
      const designation = typeLabel(chassis.type);
      for (const unit of chassis.units || []) {
        if (!isComposite) {
          if (unit.etat === 'livre' && unit.deliveryDate) {
            const dateKey = new Date(unit.deliveryDate).toISOString().split('T')[0];
            ensureBL(dateKey).units.push({ chassisId: chassis._id, chassisRepere: chassis.repere, chassisType: designation, dimension: chassis.dimension || `${chassis.largeur}×${chassis.hauteur}`, unitIndex: unit.unitIndex, unitLabel: `${chassis.repere}${unitSuffix(unit.unitIndex)}`, deliveryDate: unit.deliveryDate, notes: unit.notes || '', isComponent: false });
          }
        } else {
          for (const cs of (unit.componentStates || [])) {
            if (cs.etat === 'livre' && cs.deliveryDate) {
              const comp = chassis.components[cs.compIndex];
              if (!comp) continue;
              const dateKey = new Date(cs.deliveryDate).toISOString().split('T')[0];
              const roleLabel = comp.role === 'dormant' ? 'Dormant' : `Vantail ${cs.compIndex}`;
              const compRepere = comp.repere || roleLabel;
              ensureBL(dateKey).units.push({ chassisId: chassis._id, chassisRepere: chassis.repere, chassisType: designation, dimension: comp.largeur && comp.hauteur ? `${comp.largeur}×${comp.hauteur}` : (chassis.dimension || `${chassis.largeur}×${chassis.hauteur}`), unitIndex: unit.unitIndex, compIndex: cs.compIndex, unitLabel: `${chassis.repere}${unitSuffix(unit.unitIndex)} — ${compRepere}`, deliveryDate: cs.deliveryDate, notes: unit.notes || '', isComponent: true, role: roleLabel });
            }
          }
        }
      }
    }
    res.json(Object.values(blMap).sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== USED BARS ROUTES ====================
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
    await project.populate('usedBars.itemId');
    await project.populate('companyId');
    await project.populate('clientId');
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
    await project.save();
    await project.populate('usedBars.itemId');
    await project.populate('companyId');
    await project.populate('clientId');
    res.json(project.toJSON());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CHASSIS TYPE ROUTES ====================
app.get('/api/chassis-types', async (req, res) => {
  try {
    const types = await ChassisType.find().sort({ order: 1, createdAt: 1 });
    const ids = types.map(t => t._id);
    const counts = await ChassisTypeAccessory.aggregate([
      { $match: { chassisTypeId: { $in: ids } } },
      { $group: { _id: '$chassisTypeId', count: { $sum: 1 } } },
    ]);
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
  try { await ChassisType.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CHASSIS TYPE ACCESSORIES ROUTES ====================

// Fetch default accessories for a chassis type by its `value` string (e.g. "porte_2_vantaux")
// Used by ProjectDetail to pre-load defaults into a chassis line's accessory editor.
app.get('/api/chassis-type-defaults/:typeValue', async (req, res) => {
  try {
    const ct = await ChassisType.findOne({ value: req.params.typeValue });
    if (!ct) return res.json([]); // type not found → no defaults
    const accs = await ChassisTypeAccessory.find({ chassisTypeId: ct._id });
    res.json(accs.map(a => ({
      itemId: a.itemId ? a.itemId.toString() : '',
      label: a.label,
      unit: a.unit,
      quantity: a.quantity || 0,
      formula: a.formula || '',
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/chassis-type-accessories/:chassisTypeId', async (req, res) => {
  try {
    const accs = await ChassisTypeAccessory.find({ chassisTypeId: req.params.chassisTypeId });
    res.json(accs.map(a => ({
      itemId: a.itemId ? a.itemId.toString() : '',
      label: a.label,
      unit: a.unit,
      quantity: a.quantity || 0,
      formula: a.formula || '',
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/chassis-type-accessories/:chassisTypeId', async (req, res) => {
  try {
    const { chassisTypeId } = req.params;
    const { accessories = [] } = req.body;
    await ChassisTypeAccessory.deleteMany({ chassisTypeId });
    if (accessories.length > 0) {
      await ChassisTypeAccessory.insertMany(
        accessories.map(a => ({ chassisTypeId, ...a }))
      );
    }
    res.json({ ok: true, count: accessories.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== STOCK MOVEMENT ROUTES ====================
app.get('/api/movements', async (req, res) => {
  try {
    const { itemId, type, from, to, limit = 500 } = req.query;
    const filter = {};
    if (itemId) filter.itemId = itemId;
    if (type && type !== 'all') filter.type = type;
    if (from || to) { filter.createdAt = {}; if (from) filter.createdAt.$gte = new Date(from); if (to) filter.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59, 999)); }
    const movements = await StockMovement.find(filter).populate('itemId', 'designation categoryId superCategory').sort({ createdAt: -1 }).limit(Number(limit));
    res.json(movements);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/movements/item/:itemId', async (req, res) => {
  try { res.json(await StockMovement.find({ itemId: req.params.itemId }).sort({ createdAt: -1 }).limit(100)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ANALYTICS ROUTES ====================
app.get('/api/analytics/dashboard', async (req, res) => {
  try {
    const [projects, items, movements] = await Promise.all([
      Project.find().lean(),
      Item.find().populate('categoryId').lean(),
      StockMovement.find().populate('itemId', 'designation').sort({ createdAt: 1 }).lean(),
    ]);
    const criticalItems = items.filter(i => (i.quantity + (i.orderedQuantity || 0)) < i.threshold);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
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
    const fmt = (d) => { if (period === 'annual') return `${d.getFullYear()}`; if (period === 'daily') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
    const skeleton_start = new Date(2026, 0, 1);
    if (period === 'annual') { for (let y = skeleton_start.getFullYear(); y <= now.getFullYear(); y++) { const key = `${y}`; movMap[key] = { period: key, entrees: 0, sorties: 0, project_use: 0, project_return: 0, order_reception: 0 }; } }
    else if (period === 'monthly') { for (let d = new Date(skeleton_start); d <= now; d.setMonth(d.getMonth() + 1)) { const key = fmt(d); movMap[key] = { period: key, entrees: 0, sorties: 0, project_use: 0, project_return: 0, order_reception: 0 }; } }
    else { for (let i = 59; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i); const key = fmt(d); movMap[key] = { period: key, entrees: 0, sorties: 0, project_use: 0, project_return: 0, order_reception: 0 }; } }
    for (const m of movements) { const d = new Date(m.createdAt); const key = fmt(d); if (movMap[key]) { const typeKey = m.type === 'entree' ? 'entrees' : m.type === 'sortie' ? 'sorties' : m.type; movMap[key][typeKey] = (movMap[key][typeKey] || 0) + m.quantity; } }
    const catMap = {};
    for (const item of items) { const catId = item.categoryId?._id?.toString() || 'none'; const catName = item.categoryId?.name || { fr: 'Sans catégorie', it: 'Senza categoria', en: 'No category' }; const catColor = item.categoryId?.color || '#9ca3af'; if (!catMap[catId]) catMap[catId] = { catId, catName, catColor, total: 0, ok: 0, low: 0, critical: 0 }; catMap[catId].total++; const total = item.quantity + (item.orderedQuantity || 0); if (total < item.threshold) catMap[catId].critical++; else if (item.quantity < item.threshold) catMap[catId].low++; else catMap[catId].ok++; }
    res.json({ kpis: { totalProjects: projects.length, projectsInProgress, totalItems: items.length, criticalItems: criticalItems.length, deliveriesThisMonth, totalMovements: movements.length }, chassisStatusCounts, projectConsumption, topItems, monthlyMovements: Object.values(movMap), stockByCategory: Object.values(catMap) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== SUPER-CATEGORY ROUTES ====================
app.get('/api/super-categories', optionalAuth, async (req, res) => {
  try {
    const cats = await SuperCategory.find().sort({ order: 1 });
    const defaults = [
      { key: 'aluminium', label: { fr: '🔩 Aluminium', it: '🔩 Alluminio', en: '🔩 Aluminium' }, color: '#3b82f6' },
      { key: 'verre', label: { fr: '💎 Verre', it: '💎 Vetro', en: '💎 Glass' }, color: '#06b6d4' },
      { key: 'accessoires', label: { fr: '🔧 Accessoires', it: '🔧 Accessori', en: '🔧 Accessories' }, color: '#f59e0b' },
      { key: 'poudre', label: { fr: '🎨 Poudre', it: '🎨 Polvere', en: '🎨 Powder' }, color: '#ff1100' },
    ];
    const all = cats.length === 0 ? defaults : cats;
    // allowedSuperCategories already resolved by optionalAuth using resolveAllowedSCs
    // null = all, [] = none, [...] = subset
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
    // Extend ALL_PERMISSIONS dynamically on the role schema (runtime only)
    res.status(201).json(sc);
  } catch (e) { res.status(e.code === 11000 ? 409 : 400).json({ error: e.message }); }
});

app.put('/api/super-categories/:key', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const sc = await SuperCategory.findOneAndUpdate({ key: req.params.key }, { label: req.body.label, color: req.body.color }, { new: true });
    if (!sc) return res.status(404).json({ error: 'Not found' });
    res.json(sc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/super-categories/:key', requireAuth, requirePermission('admin.view'), async (req, res) => {
  try {
    const key = req.params.key;
    if (['aluminium', 'verre', 'accessoires', 'poudre'].includes(key)) {
      return res.status(400).json({ error: 'Cannot delete built-in super-categories' });
    }
    await SuperCategory.deleteOne({ key });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== POUDRES / RAL PICKER ====================
// Returns all items from the 'poudres' super-category for use in the RAL picker
app.get('/api/inventory/poudres', async (req, res) => {
  try {
    const items = await Item.find({ superCategory: 'poudres' }).populate('categoryId').sort({ createdAt: -1 });
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});



// ==================== ATELIER TABLES ====================
// Add this Schema near the other schemas in server.js

const atelierTableLayoutSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  tables: [{
    id:     { type: String, required: true },
    number: { type: Number, required: true },
    name:   { type: String, required: true },
    x:      { type: Number, default: 0 },
    y:      { type: Number, default: 0 },
    w:      { type: Number, default: 200 },
    h:      { type: Number, default: 90 },
  }],
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });

const AtelierTableLayout = mongoose.model('AtelierTableLayout', atelierTableLayoutSchema);

// ─── GET /api/atelier-tables ──────────────────────────────────────────────────
// Returns the saved table layout (or empty array if none)
app.get('/api/atelier-tables', async (req, res) => {
  try {
    const layout = await AtelierTableLayout.findOne({}).sort({ updatedAt: -1 });
    res.json(layout ? layout.tables : []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /api/atelier-tables ──────────────────────────────────────────────────
// Upserts the entire table layout
app.put('/api/atelier-tables', async (req, res) => {
  try {
    const { tables } = req.body;
    if (!Array.isArray(tables)) return res.status(400).json({ error: 'tables must be an array' });

    // Validate each table entry
    for (const t of tables) {
      if (!t.id || !t.name || t.number == null) {
        return res.status(400).json({ error: 'Each table must have id, name, and number' });
      }
    }

    let layout = await AtelierTableLayout.findOne({});
    if (layout) {
      layout.tables = tables;
      await layout.save();
    } else {
      layout = await AtelierTableLayout.create({ tables });
    }

    res.json(layout.tables);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/atelier-tables/names ───────────────────────────────────────────
// Returns just the names array for use in ProjectDetail dropdown
// e.g. ["Table 1", "Table découpe", "Table assemblage", ...]
app.get('/api/atelier-tables/names', async (req, res) => {
  try {
    const layout = await AtelierTableLayout.findOne({}).sort({ updatedAt: -1 });
    if (!layout || !layout.tables.length) {
      // Fallback to defaults
      return res.json(['Table 1','Table 2','Table 3','Table 4','Table 5','Table 6','Table 7','Table 8']);
    }
    // Sort by table number, return names
    const names = [...layout.tables]
      .sort((a, b) => a.number - b.number)
      .map(t => t.name);
    res.json(names);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ============================================================
// PASTE THIS BLOCK INTO server.js
// Place it AFTER the existing AtelierTableLayout schema/routes
// and BEFORE the ERROR HANDLERS section at the bottom.
// ============================================================

// ==================== TABLE STOCK SCHEMAS ====================

/**
 * Per-table accessory stock.
 * Each document = one table's stock snapshot.
 */
const tableStockSchema = new mongoose.Schema({
  tableId:   { type: String, required: true, unique: true }, // matches AtelierTableLayout table.id
  tableName: { type: String, default: '' },
  workers:   [{ type: String }],  // array of worker names assigned to this table
  stock: [{
    itemId:  { type: String, required: true },   // inventory Item _id (string)
    label:   { type: String, required: true },
    unit:    { type: String, default: '' },
    quantity:{ type: Number, default: 0, min: 0 },
  }],
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
const TableStock = mongoose.model('TableStock', tableStockSchema);

/**
 * Accessory consumption log per table.
 * Created whenever a chassis is assigned to a table (deduction)
 * or stock is manually adjusted.
 */
const tableConsumptionSchema = new mongoose.Schema({
  tableId:     { type: String, required: true },
  tableName:   { type: String, default: '' },
  itemId:      { type: String, required: true },
  label:       { type: String, required: true },
  unit:        { type: String, default: '' },
  quantity:    { type: Number, required: true },         // always positive
  type:        { type: String, enum: ['chassis_assignment', 'manual_in', 'manual_out'], required: true },
  projectId:   { type: String, default: '' },
  projectName: { type: String, default: '' },
  chassisRef:  { type: String, default: '' },            // chassis repere for traceability
  date:        { type: Date, default: Date.now },
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; } } });
tableConsumptionSchema.index({ tableId: 1, date: -1 });
tableConsumptionSchema.index({ date: -1 });
const TableConsumption = mongoose.model('TableConsumption', tableConsumptionSchema);


// ==================== TABLE STOCK ROUTES ====================

// ── GET /api/table-stock  →  all tables' stock ──────────────
app.get('/api/table-stock', async (req, res) => {
  try {
    const stocks = await TableStock.find().sort({ tableName: 1 });
    res.json(stocks);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/table-stock/:tableId  →  one table's stock ─────
app.get('/api/table-stock/:tableId', async (req, res) => {
  try {
    const s = await TableStock.findOne({ tableId: req.params.tableId });
    res.json(s || { tableId: req.params.tableId, stock: [], workers: [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/table-stock/:tableId  →  set full stock doc ────
// Body: { tableName, workers, stock: [{itemId,label,unit,quantity}] }
app.put('/api/table-stock/:tableId', async (req, res) => {
  try {
    const { tableId } = req.params;
    const { tableName, workers, stock } = req.body;
    if (!Array.isArray(stock)) return res.status(400).json({ error: 'stock must be an array' });
    const s = await TableStock.findOneAndUpdate(
      { tableId },
      { tableId, tableName: tableName || '', workers: workers || [], stock },
      { upsert: true, new: true }
    );
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/table-stock/:tableId/adjust  →  adjust a single item ──
// Body: { itemId, label, unit, delta }  (delta can be + or -)
app.patch('/api/table-stock/:tableId/adjust', async (req, res) => {
  try {
    const { tableId } = req.params;
    const { itemId, label, unit, delta, type } = req.body; // type: 'manual_in'|'manual_out'
    if (!itemId || typeof delta !== 'number') return res.status(400).json({ error: 'itemId and numeric delta required' });

    let s = await TableStock.findOne({ tableId });
    if (!s) s = new TableStock({ tableId, stock: [] });

    const idx = s.stock.findIndex(x => x.itemId === itemId);
    if (idx === -1) {
      s.stock.push({ itemId, label: label || itemId, unit: unit || '', quantity: Math.max(0, delta) });
    } else {
      s.stock[idx].quantity = Math.max(0, s.stock[idx].quantity + delta);
    }
    await s.save();

    // Log the adjustment
    const movType = type || (delta > 0 ? 'manual_in' : 'manual_out');
    if (delta !== 0) {
      await TableConsumption.create({
        tableId,
        tableName: s.tableName || '',
        itemId,
        label: label || itemId,
        unit: unit || '',
        quantity: Math.abs(delta),
        type: movType,
        date: new Date(),
      });
    }

    // ── manual_in: deduct from global inventory ──
    if (delta !== 0 && movType === 'manual_in' && itemId && !itemId.startsWith('manual_')) {
      try {
        const item = await Item.findById(itemId);
        if (item) {
          item.quantity = Math.max(0, item.quantity - Math.abs(delta));
          await item.save();
          await StockMovement.create({
            itemId: item._id,
            type: 'sortie',
            quantity: Math.abs(delta),
            balanceAfter: item.quantity,
            note: `Approvisionnement table: ${s.tableName || tableId}`,
          });
        }
      } catch { /* skip if item not found */ }
    }

    // ── manual_out: return stock to global inventory ──
    if (delta !== 0 && movType === 'manual_out' && itemId && !itemId.startsWith('manual_')) {
      try {
        const item = await Item.findById(itemId);
        if (item) {
          item.quantity = item.quantity + Math.abs(delta);
          await item.save();
          await StockMovement.create({
            itemId: item._id,
            type: 'entree',
            quantity: Math.abs(delta),
            balanceAfter: item.quantity,
            note: `Retour depuis table: ${s.tableName || tableId}`,
          });
        }
      } catch { /* skip if item not found */ }
    }

    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── DELETE /api/table-stock/:tableId/item/:itemId  →  remove item from table stock ──
// Removes the item row entirely and returns its quantity back to global inventory.
app.delete('/api/table-stock/:tableId/item/:itemId', async (req, res) => {
  try {
    const { tableId, itemId } = req.params;
    const s = await TableStock.findOne({ tableId });
    if (!s) return res.status(404).json({ error: 'Table stock not found' });

    const idx = s.stock.findIndex(x => x.itemId === itemId);
    if (idx === -1) return res.status(404).json({ error: 'Item not found in table stock' });

    const removed = s.stock[idx];
    s.stock.splice(idx, 1);
    await s.save();

    // Return the remaining quantity back to global inventory
    if (removed.quantity > 0 && !itemId.startsWith('manual_')) {
      try {
        const item = await Item.findById(itemId);
        if (item) {
          item.quantity = item.quantity + removed.quantity;
          await item.save();
          await StockMovement.create({
            itemId: item._id,
            type: 'entree',
            quantity: removed.quantity,
            balanceAfter: item.quantity,
            note: `Retrait accessoire de table: ${s.tableName || tableId}`,
          });
        }
      } catch { /* skip if item not in inventory */ }
    }

    // Log the removal in TableConsumption
    await TableConsumption.create({
      tableId,
      tableName: s.tableName || '',
      itemId,
      label: removed.label,
      unit: removed.unit || '',
      quantity: removed.quantity,
      type: 'manual_out',
      date: new Date(),
    });

    res.json({ success: true, stock: s.stock });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── POST /api/table-stock/deduct-chassis ────────────────────
// Called by frontend when a chassis unit is assigned to a table.
// Body: { tableId, tableName, projectId, projectName, chassisRef, accessories: [{itemId,label,unit,quantity}] }
app.post('/api/table-stock/deduct-chassis', async (req, res) => {
  try {
    const { tableId, tableName, projectId, projectName, chassisRef, accessories } = req.body;
    if (!tableId || !Array.isArray(accessories)) {
      return res.status(400).json({ error: 'tableId and accessories[] required' });
    }

    let s = await TableStock.findOne({ tableId });
    if (!s) s = new TableStock({ tableId, tableName: tableName || '', stock: [] });

    const consumptions = [];
    for (const acc of accessories) {
      if (!acc.quantity || acc.quantity <= 0) continue;
      const idx = s.stock.findIndex(x => x.itemId === acc.itemId);
      if (idx === -1) {
        // Item not in table stock yet — create entry at 0 (or negative as debt)
        s.stock.push({ itemId: acc.itemId, label: acc.label || acc.itemId, unit: acc.unit || '', quantity: 0 });
      }
      const si = s.stock.findIndex(x => x.itemId === acc.itemId);
      s.stock[si].quantity = Math.max(0, s.stock[si].quantity - acc.quantity);
      consumptions.push({
        tableId,
        tableName: tableName || s.tableName || '',
        itemId: acc.itemId,
        label: acc.label || acc.itemId,
        unit: acc.unit || '',
        quantity: acc.quantity,
        type: 'chassis_assignment',
        projectId: projectId || '',
        projectName: projectName || '',
        chassisRef: chassisRef || '',
        date: new Date(),
      });
    }

    await s.save();
    if (consumptions.length) await TableConsumption.insertMany(consumptions);

    res.json({ stock: s, consumed: consumptions.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ==================== TABLE CONSUMPTION RECAP ROUTES ====================

// ── GET /api/table-consumption  →  raw log (with filters) ───
// ?tableId=&period=daily|weekly|monthly&from=&to=
app.get('/api/table-consumption', async (req, res) => {
  try {
    const filter = {};
    if (req.query.tableId) filter.tableId = req.query.tableId;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to)   filter.date.$lte = new Date(req.query.to);
    }
    const logs = await TableConsumption.find(filter).sort({ date: -1 }).limit(500);
    res.json(logs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/table-consumption/recap  →  aggregated recap ───
// ?tableId=&period=daily|weekly|monthly
app.get('/api/table-consumption/recap', async (req, res) => {
  try {
    const { period = 'monthly', tableId } = req.query;

    // Date boundaries
    const now = new Date();
    let from;
    if (period === 'daily')   from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    if (period === 'weekly')  from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 83); // ~12 weeks
    if (period === 'monthly') from = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const match = { date: { $gte: from } };
    if (tableId) match.tableId = tableId;

    // Aggregate: group by tableId + period-bucket + itemId
    const groupId = {
      tableId:   '$tableId',
      tableName: '$tableName',
      itemId:    '$itemId',
      label:     '$label',
      unit:      '$unit',
    };
    if (period === 'daily') {
      groupId.y = { $year: '$date' };
      groupId.m = { $month: '$date' };
      groupId.d = { $dayOfMonth: '$date' };
    } else if (period === 'weekly') {
      groupId.y = { $isoWeekYear: '$date' };
      groupId.w = { $isoWeek: '$date' };
    } else {
      groupId.y = { $year: '$date' };
      groupId.m = { $month: '$date' };
    }

    const agg = await TableConsumption.aggregate([
      { $match: match },
      { $group: {
        _id: groupId,
        consumed: { $sum: { $cond: [{ $ne: ['$type', 'manual_in'] }, '$quantity', 0] } },
        restocked: { $sum: { $cond: [{ $eq: ['$type', 'manual_in'] }, '$quantity', 0] } },
      }},
      { $sort: { '_id.tableId': 1, '_id.y': 1, '_id.m': 1, '_id.d': 1, '_id.w': 1 } }
    ]);

    // Reshape into { tableId → { periodKey → [ { itemId, label, unit, consumed, restocked } ] } }
    const result = {};
    for (const row of agg) {
      const { tableId: tid, tableName, itemId, label, unit, y, m, d, w } = row._id;
      let periodKey;
      if (period === 'daily')   periodKey = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      else if (period === 'weekly') periodKey = `${y}-W${String(w).padStart(2,'0')}`;
      else                      periodKey = `${y}-${String(m).padStart(2,'0')}`;

      if (!result[tid]) result[tid] = { tableId: tid, tableName, periods: {} };
      if (!result[tid].periods[periodKey]) result[tid].periods[periodKey] = [];
      result[tid].periods[periodKey].push({ itemId, label, unit, consumed: row.consumed, restocked: row.restocked });
    }

    res.json(Object.values(result));
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── DELETE /api/table-consumption/:id  →  delete a single consumption log entry ──
app.delete('/api/table-consumption/:id', async (req, res) => {
  try {
    const doc = await TableConsumption.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ==================== TABLE PROJECTS (what each table is working on) ====
// Returns all chassis units currently assigned to a given table across all projects.
app.get('/api/atelier-tables/:tableId/workload', async (req, res) => {
  try {
    const { tableId } = req.params;

    // We need the table NAME (since units store name, not id)
    const layout = await AtelierTableLayout.findOne({});
    const tableObj = layout?.tables?.find(t => t.id === tableId);
    if (!tableObj) return res.status(404).json({ error: 'Table not found' });

    const tableName = tableObj.name;

    // Query all projects and filter chassis units by atelierTable === tableName
    const projects = await Project.find({
      'chassis.units.atelierTable': tableName
    }).populate('clientId').lean();

    const workload = [];
    for (const proj of projects) {
      for (const ch of proj.chassis || []) {
        for (const unit of ch.units || []) {
          if ((unit.atelierTable || '') === tableName) {
            // compute accessory quantities using formula if present
            const accs = (ch.accessories || []).map(acc => {
              let qty = acc.quantity || 0;
              if (acc.formula && acc.formula.trim()) {
                try {
                  const L = ch.largeur; const H = ch.hauteur;
                  // eslint-disable-next-line no-new-func
                  qty = Function('L', 'H', `return (${acc.formula})`)(L, H);
                } catch { qty = 0; }
              }
              return { itemId: acc.itemId, label: acc.label, unit: acc.unit, quantity: Math.round(qty * 100) / 100 };
            });
            workload.push({
              projectId:   proj._id.toString(),
              projectName: proj.name,
              projectRef:  proj.reference,
              clientName:  proj.clientId?.name || '',
              chassisId:   ch._id.toString(),
              chassisRef:  ch.repere,
              chassisType: ch.type,
              dimension:   ch.dimension || `${ch.largeur}×${ch.hauteur}`,
              unitIndex:   unit.unitIndex,
              etat:        unit.etat,
              deliveryDate:unit.deliveryDate,
              accessories: accs,
              assignedAt:  unit.deliveryDate || proj.updatedAt,
            });
          }
        }
      }
    }

    // Also load stock & workers
    const stock = await TableStock.findOne({ tableId });

    res.json({
      table: tableObj,
      workload,
      stock: stock?.stock || [],
      workers: stock?.workers || [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ==================== LAQUAGE SCHEMAS & ROUTES ====================

// ── Schemas ──
const laquageBarresBrutesSchema = new mongoose.Schema({
  reference: { type: String, default: '' },
  quantiteBrute: { type: Number, default: 0 },
}, { _id: false });

const laquageBarresLaqueeSchema = new mongoose.Schema({
  reference: { type: String, default: '' },
  ral: { type: String, default: '' },
  quantiteLaquee: { type: Number, default: 0 },
}, { _id: false });

const laquageMorceauBrutSchema = new mongoose.Schema({
  reference: { type: String, default: '' },
  mesure: { type: String, default: '' },
  quantite: { type: Number, default: 0 },
}, { _id: false });

const laquageMorceauLaqueLigneSchema = new mongoose.Schema({
  ral: { type: String, default: '' },
  mesure: { type: String, default: '' },
  quantite: { type: Number, default: 0 },
}, { _id: false });

const laquageMorceauLaqueSchema = new mongoose.Schema({
  reference: { type: String, default: '' },
  lignes: [laquageMorceauLaqueLigneSchema],
}, { _id: false });

const LAQUAGE_STATUSES = ['draft', 'sent_to_laquage', 'received_laquage', 'returned_to_coord', 'received_coord'];

const laquageBarresSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },
  barresBrutes: [laquageBarresBrutesSchema],
  barresLaquees: [laquageBarresLaqueeSchema],
  morceauxBruts: [laquageMorceauBrutSchema],
  morceauxLaques: [laquageMorceauLaqueSchema],
  status: { type: String, enum: LAQUAGE_STATUSES, default: 'draft' },
  lineStatuses: { type: mongoose.Schema.Types.Mixed, default: {} },
  history: [{ action: String, by: String, at: Date }],
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; } } });
const LaquageBarres = mongoose.model('LaquageBarres', laquageBarresSchema);

const laquageAccSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },
  accessoires: [{
    designation: { type: String, default: '' },
    quantite: { type: Number, default: 0 },
    notes: { type: String, default: '' },
  }],
  status: { type: String, enum: LAQUAGE_STATUSES, default: 'draft' },
  lineStatuses: { type: mongoose.Schema.Types.Mixed, default: {} },
  history: [{ action: String, by: String, at: Date }],
}, { timestamps: true, toJSON: { transform: (doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; } } });
const LaquageAccessoires = mongoose.model('LaquageAccessoires', laquageAccSchema);

// ── Helpers ──
function applyLaquageAction(record, action, lineKey, by) {
  const now = new Date();
  record.history = record.history || [];

  if (action === 'send_to_laquage') {
    record.status = 'sent_to_laquage';
    record.history.push({ action, by, at: now });
    return;
  }
  if (action === 'receive_line_laquage') {
    record.lineStatuses = record.lineStatuses || {};
    record.lineStatuses[lineKey] = { ...(record.lineStatuses[lineKey] || {}), receivedLaquage: true, receivedLaquageAt: now, receivedLaquageBy: by };
    record.markModified('lineStatuses');
    record.history.push({ action: `receive_line_laquage:${lineKey}`, by, at: now });
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
    record.lineStatuses = record.lineStatuses || {};
    record.lineStatuses[lineKey] = { ...(record.lineStatuses[lineKey] || {}), receivedCoord: true, receivedCoordAt: now, receivedCoordBy: by };
    record.markModified('lineStatuses');
    record.history.push({ action: `receive_line_coord:${lineKey}`, by, at: now });
    return;
  }
  if (action === 'receive_all_coord') {
    record.status = 'received_coord';
    record.history.push({ action, by, at: now });
    return;
  }
}

// ── BARRES routes ──
app.get('/api/projects/:projectId/laquage/barres', requireAuth, async (req, res) => {
  try {
    let record = await LaquageBarres.findOne({ projectId: req.params.projectId });
    if (!record) {
      record = new LaquageBarres({ projectId: req.params.projectId, barresBrutes: [], barresLaquees: [], morceauxBruts: [], morceauxLaques: [], status: 'draft', lineStatuses: {} });
      await record.save();
    }
    res.json(record.toJSON());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/projects/:projectId/laquage/barres', requireAuth, async (req, res) => {
  try {
    const { barresBrutes, barresLaquees, morceauxBruts, morceauxLaques } = req.body;
    let record = await LaquageBarres.findOne({ projectId: req.params.projectId });
    if (!record) record = new LaquageBarres({ projectId: req.params.projectId });
    if (record.status !== 'draft') return res.status(400).json({ error: 'Cannot edit after draft stage.' });
    if (barresBrutes !== undefined) record.barresBrutes = barresBrutes;
    if (barresLaquees !== undefined) record.barresLaquees = barresLaquees;
    if (morceauxBruts !== undefined) record.morceauxBruts = morceauxBruts;
    if (morceauxLaques !== undefined) record.morceauxLaques = morceauxLaques;
    await record.save();
    res.json(record.toJSON());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects/:projectId/laquage/barres/action', requireAuth, async (req, res) => {
  try {
    const { action, lineKey, by } = req.body;
    let record = await LaquageBarres.findOne({ projectId: req.params.projectId });
    if (!record) return res.status(404).json({ error: 'Record not found' });
    applyLaquageAction(record, action, lineKey, by);
    await record.save();
    res.json(record.toJSON());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ACCESSOIRES routes ──
app.get('/api/projects/:projectId/laquage/accessoires', requireAuth, async (req, res) => {
  try {
    let record = await LaquageAccessoires.findOne({ projectId: req.params.projectId });
    if (!record) {
      record = new LaquageAccessoires({ projectId: req.params.projectId, accessoires: [], status: 'draft', lineStatuses: {} });
      await record.save();
    }
    res.json(record.toJSON());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/projects/:projectId/laquage/accessoires', requireAuth, async (req, res) => {
  try {
    const { accessoires } = req.body;
    let record = await LaquageAccessoires.findOne({ projectId: req.params.projectId });
    if (!record) record = new LaquageAccessoires({ projectId: req.params.projectId });
    if (record.status !== 'draft') return res.status(400).json({ error: 'Cannot edit after draft stage.' });
    if (accessoires !== undefined) record.accessoires = accessoires;
    await record.save();
    res.json(record.toJSON());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects/:projectId/laquage/accessoires/action', requireAuth, async (req, res) => {
  try {
    const { action, lineKey, by } = req.body;
    let record = await LaquageAccessoires.findOne({ projectId: req.params.projectId });
    if (!record) return res.status(404).json({ error: 'Record not found' });
    applyLaquageAction(record, action, lineKey, by);
    await record.save();
    res.json(record.toJSON());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ERROR HANDLERS ====================
app.use((req, res) => res.status(404).json({ error: 'Not Found', path: req.path }));
app.use((err, req, res, next) => { console.error('Unhandled:', err); res.status(500).json({ error: 'Internal Server Error', message: err.message }); });

app.listen(PORT, () => { console.log(`🚀 Server on port ${PORT}`); });
process.on('SIGTERM', () => { mongoose.connection.close(); process.exit(0); });