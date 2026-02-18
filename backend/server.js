/**
 * Aluminum Inventory Backend Server
 *
 * Production-ready Express + MongoDB API
 * Shared database for all users
 * WITH ORDERED QUANTITY + PROJECTS MODULE
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3001;

// Security & Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aluminum-inventory';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ Connected to MongoDB');
  initializeSampleData();
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});

// ==================== SCHEMAS ====================

// Category Schema & Model
const categorySchema = new mongoose.Schema({
  name: {
    it: { type: String, required: [true, 'Italian category name is required'], trim: true },
    fr: { type: String, required: [true, 'French category name is required'], trim: true },
    en: { type: String, required: [true, 'English category name is required'], trim: true }
  },
  color: { type: String, default: '#3b82f6' },
  order: { type: Number, default: 0 }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id; delete ret._id; delete ret.__v; return ret;
    }
  }
});

const Category = mongoose.model('Category', categorySchema);

// Item (Inventory) Schema & Model
const itemSchema = new mongoose.Schema({
  image: { type: String, default: '' },
  designation: {
    it: { type: String, required: [true, 'Italian designation is required'], trim: true },
    fr: { type: String, required: [true, 'French designation is required'], trim: true },
    en: { type: String, required: [true, 'English designation is required'], trim: true }
  },
  quantity:        { type: Number, required: true, min: [0, 'Quantity cannot be negative'], default: 0 },
  orderedQuantity: { type: Number, min: [0, 'Ordered quantity cannot be negative'], default: 0 },
  threshold:       { type: Number, required: true, min: [0, 'Threshold cannot be negative'], default: 0 },
  categoryId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id; delete ret._id; delete ret.__v; return ret;
    }
  }
});

const Item = mongoose.model('Item', itemSchema);

// ==================== PROJECT SCHEMAS ====================

// Component sub-schema (used inside composite chassis: dormant + vantaux)
const componentSchema = new mongoose.Schema({
  role:    { type: String, enum: ['dormant', 'vantail'], required: true },
  repere:  { type: String, default: '' },
  largeur: { type: Number, default: 0 },
  hauteur: { type: Number, default: 0 },
  etat: {
    type: String,
    enum: ['non_entame', 'en_cours', 'fabrique', 'livre'],
    default: 'non_entame'
  }
}, { _id: true });

// ── ChassisType Model (dynamically managed via API) ─────────────
const chassisTypeSchema = new mongoose.Schema({
  value:     { type: String, required: true, unique: true },
  fr:        { type: String, required: true },
  it:        { type: String, default: '' },
  en:        { type: String, default: '' },
  composite: { type: Boolean, default: false },
  vantaux:   { type: Number, default: 0 },
  order:     { type: Number, default: 0 }
}, { timestamps: true });
const ChassisType = mongoose.model('ChassisType', chassisTypeSchema);

// Chassis sub-schema (embedded in Project)
const chassisSchema = new mongoose.Schema({
  type:      { type: String, required: true },  // open — managed via ChassisType collection
  repere:    { type: String, required: true },
  quantity:  { type: Number, required: true, min: 1, default: 1 },
  largeur:   { type: Number, required: true },
  hauteur:   { type: Number, required: true },
  dimension: { type: String, default: '' },
  etat: {
    type: String,
    enum: ['non_entame', 'en_cours', 'fabrique', 'livre'],
    default: 'non_entame'
  },
  // Only populated for composite chassis (coulisse / minimaliste)
  components: [componentSchema]
}, { _id: true });

// Project Schema & Model
const projectSchema = new mongoose.Schema({
  name:      { type: String, required: [true, 'Project name is required'], trim: true },
  reference: { type: String, required: [true, 'Reference is required'], trim: true },
  ralCode:   { type: String, required: [true, 'RAL code is required'], trim: true },
  ralColor:  { type: String, default: '#ffffff' },
  date:      { type: Date, required: [true, 'Date is required'] },
  status: {
    type: String,
    enum: ['en_cours', 'termine', 'livre'],
    default: 'en_cours'
  },
  chassis: [chassisSchema],
  usedBars: [{
    itemId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    quantity: { type: Number, required: true, min: 1 }
  }]
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id; delete ret._id; delete ret.__v; return ret;
    }
  }
});

const Project = mongoose.model('Project', projectSchema);

// ==================== SAMPLE DATA ====================

async function initializeSampleData() {
  try {
    // Seed chassis types
    const ctCount = await ChassisType.countDocuments();
    if (ctCount === 0) {
      console.log('🪟 Seeding chassis types...');
      await ChassisType.insertMany([
        { value: 'chassis_fixe',            fr: 'Châssis fixe',            it: 'Telaio fisso',              en: 'Fixed frame',          composite: false, vantaux: 0, order: 1 },
        { value: 'fenetre_1_ouvrant',        fr: 'Fenêtre 1 ouvrant',       it: 'Finestra 1 anta',           en: 'Window 1 sash',         composite: false, vantaux: 0, order: 2 },
        { value: 'fenetre_2_ouvrants',       fr: 'Fenêtre 2 ouvrants',      it: 'Finestra 2 ante',           en: 'Window 2 sashes',       composite: false, vantaux: 0, order: 3 },
        { value: 'fenetre_oscillo_battant',  fr: 'Fenêtre oscillo-battant', it: 'Finestra oscillo-battente', en: 'Tilt & turn window',    composite: false, vantaux: 0, order: 4 },
        { value: 'soufflet',                 fr: 'Soufflet',                it: 'Soffietto',                 en: 'Bellows',               composite: false, vantaux: 0, order: 5 },
        { value: 'porte_1_ouvrant',          fr: 'Porte 1 ouvrant',         it: 'Porta 1 anta',              en: 'Door 1 leaf',           composite: false, vantaux: 0, order: 6 },
        { value: 'mur_rideau',               fr: 'Mur rideau',              it: 'Muro cortina',              en: 'Curtain wall',          composite: false, vantaux: 0, order: 7 },
        { value: 'volet_roulant',            fr: 'Volet roulant',           it: 'Tapparella',                en: 'Rolling shutter',       composite: false, vantaux: 0, order: 8 },
        { value: 'faux_cadre',               fr: 'Faux cadre',              it: 'Falso telaio',              en: 'Sub-frame',             composite: false, vantaux: 0, order: 9 },
        { value: 'minimaliste_2_vantaux',    fr: 'Minimaliste 2 vantaux',   it: 'Minimalista 2 ante',        en: 'Minimalist 2 leaves',   composite: true,  vantaux: 2, order: 10 },
        { value: 'minimaliste_3_vantaux',    fr: 'Minimaliste 3 vantaux',   it: 'Minimalista 3 ante',        en: 'Minimalist 3 leaves',   composite: true,  vantaux: 3, order: 11 },
        { value: 'minimaliste_4_vantaux',    fr: 'Minimaliste 4 vantaux',   it: 'Minimalista 4 ante',        en: 'Minimalist 4 leaves',   composite: true,  vantaux: 4, order: 12 },
        { value: 'coulisse_2_vantaux',       fr: 'Coulisse 2 vantaux',      it: 'Scorrevole 2 ante',         en: 'Sliding 2 leaves',      composite: true,  vantaux: 2, order: 13 },
        { value: 'coulisse_3_vantaux',       fr: 'Coulisse 3 vantaux',      it: 'Scorrevole 3 ante',         en: 'Sliding 3 leaves',      composite: true,  vantaux: 3, order: 14 },
        { value: 'coulisse_4_vantaux',       fr: 'Coulisse 4 vantaux',      it: 'Scorrevole 4 ante',         en: 'Sliding 4 leaves',      composite: true,  vantaux: 4, order: 15 },
      ]);
      console.log('✅ Chassis types seeded');
    }

    const categoryCount = await Category.countDocuments();
    if (categoryCount === 0) {
      console.log('📦 Initializing sample categories...');
      await Category.insertMany([
        { name: { it: 'Serie 6000', fr: 'Série 6000', en: '6000 Series' }, color: '#3b82f6', order: 1 },
        { name: { it: 'Serie 7000', fr: 'Série 7000', en: '7000 Series' }, color: '#8b5cf6', order: 2 },
        { name: { it: 'Serie 5000', fr: 'Série 5000', en: '5000 Series' }, color: '#10b981', order: 3 },
        { name: { it: 'Serie 2000', fr: 'Série 2000', en: '2000 Series' }, color: '#f59e0b', order: 4 }
      ]);
      console.log('✅ Sample categories initialized');
    }

    const count = await Item.countDocuments();
    if (count === 0) {
      console.log('📦 Initializing sample data...');
      await Item.insertMany([
        {
          image: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=400',
          designation: { it: 'Barra Alluminio 6063 - 50x25mm', fr: 'Barre Aluminium 6063 - 50x25mm', en: 'Aluminum Bar 6063 - 50x25mm' },
          quantity: 45, orderedQuantity: 10, threshold: 20
        },
        {
          image: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=400',
          designation: { it: 'Barra Alluminio 7075 - 30x30mm', fr: 'Barre Aluminium 7075 - 30x30mm', en: 'Aluminum Bar 7075 - 30x30mm' },
          quantity: 8, orderedQuantity: 25, threshold: 15
        },
        {
          image: 'https://images.unsplash.com/photo-1596555544573-f7c0d5c3bbba?w=400',
          designation: { it: 'Barra Alluminio 5052 - 60x40mm', fr: 'Barre Aluminium 5052 - 60x40mm', en: 'Aluminum Bar 5052 - 60x40mm' },
          quantity: 32, orderedQuantity: 0, threshold: 25
        },
        {
          image: 'https://images.unsplash.com/photo-1565793298595-6a879b1d9492?w=400',
          designation: { it: 'Barra Alluminio 2024 - 40x20mm', fr: 'Barre Aluminium 2024 - 40x20mm', en: 'Aluminum Bar 2024 - 40x20mm' },
          quantity: 12, orderedQuantity: 20, threshold: 30
        }
      ]);
      console.log('✅ Sample data initialized');
    }
  } catch (error) {
    console.error('Error initializing sample data:', error);
  }
}

// ==================== CATEGORY ROUTES ====================

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Category.find().sort({ order: 1, createdAt: 1 });
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories', message: error.message });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const category = new Category({
      name: { it: req.body.name?.it, fr: req.body.name?.fr, en: req.body.name?.en },
      color: req.body.color || '#3b82f6',
      order: req.body.order || 0
    });
    await category.save();
    console.log('✅ Created category:', category.id);
    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    if (error.name === 'ValidationError') return res.status(400).json({ error: 'Validation error', message: error.message });
    res.status(500).json({ error: 'Failed to create category', message: error.message });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name: { it: req.body.name?.it, fr: req.body.name?.fr, en: req.body.name?.en }, color: req.body.color, order: req.body.order },
      { new: true, runValidators: true }
    );
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category', message: error.message });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    console.log('✅ Deleted category:', req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category', message: error.message });
  }
});

// ==================== INVENTORY ROUTES ====================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime(), mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

app.get('/api/inventory', async (req, res) => {
  try {
    const { categoryId } = req.query;
    const filter = {};
    if (categoryId && categoryId !== 'all') filter.categoryId = categoryId;
    const items = await Item.find(filter).populate('categoryId').sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inventory items', message: error.message });
  }
});

app.get('/api/inventory/filter/low-stock', async (req, res) => {
  try {
    const items = await Item.find().populate('categoryId');
    const lowStock = items.filter(item => item.quantity + (item.orderedQuantity || 0) < item.threshold);
    res.json(lowStock);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch low stock items', message: error.message });
  }
});

app.get('/api/inventory/search', async (req, res) => {
  try {
    const searchTerm = req.query.q || '';
    const { categoryId } = req.query;
    const filter = {};
    if (categoryId && categoryId !== 'all') filter.categoryId = categoryId;
    if (searchTerm) {
      filter.$or = [
        { 'designation.it': { $regex: searchTerm, $options: 'i' } },
        { 'designation.fr': { $regex: searchTerm, $options: 'i' } },
        { 'designation.en': { $regex: searchTerm, $options: 'i' } }
      ];
    }
    const items = await Item.find(filter).populate('categoryId').sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search items', message: error.message });
  }
});

app.get('/api/inventory/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id).populate('categoryId');
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (error) {
    if (error.kind === 'ObjectId') return res.status(400).json({ error: 'Invalid ID format' });
    res.status(500).json({ error: 'Failed to fetch item', message: error.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const item = new Item({
      image: req.body.image || '',
      designation: { it: req.body.designation?.it, fr: req.body.designation?.fr, en: req.body.designation?.en },
      quantity: Number(req.body.quantity) || 0,
      orderedQuantity: Number(req.body.orderedQuantity) || 0,
      threshold: Number(req.body.threshold) || 0,
      categoryId: req.body.categoryId || null
    });
    await item.save();
    await item.populate('categoryId');
    console.log('✅ Created item:', item.id);
    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating item:', error);
    if (error.name === 'ValidationError') return res.status(400).json({ error: 'Validation error', message: error.message });
    res.status(500).json({ error: 'Failed to create item', message: error.message });
  }
});

app.put('/api/inventory/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      {
        image: req.body.image,
        designation: { it: req.body.designation?.it, fr: req.body.designation?.fr, en: req.body.designation?.en },
        quantity: Number(req.body.quantity) || 0,
        orderedQuantity: Number(req.body.orderedQuantity) || 0,
        threshold: Number(req.body.threshold) || 0,
        categoryId: req.body.categoryId || null
      },
      { new: true, runValidators: true }
    ).populate('categoryId');
    if (!item) return res.status(404).json({ error: 'Item not found' });
    console.log('✅ Updated item:', item.id);
    res.json(item);
  } catch (error) {
    console.error('Error updating item:', error);
    if (error.name === 'ValidationError') return res.status(400).json({ error: 'Validation error', message: error.message });
    res.status(500).json({ error: 'Failed to update item', message: error.message });
  }
});

app.patch('/api/inventory/:id/quantity', async (req, res) => {
  try {
    const { amount } = req.body;
    if (typeof amount !== 'number') return res.status(400).json({ error: 'Amount must be a number' });
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    item.quantity = Math.max(0, item.quantity + amount);
    await item.save();
    await item.populate('categoryId');
    console.log(`✅ Updated quantity for item ${item.id}: ${amount > 0 ? '+' : ''}${amount} (new: ${item.quantity})`);
    res.json(item);
  } catch (error) {
    if (error.kind === 'ObjectId') return res.status(400).json({ error: 'Invalid ID format' });
    res.status(500).json({ error: 'Failed to update quantity', message: error.message });
  }
});

app.delete('/api/inventory/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    console.log('✅ Deleted item:', req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    if (error.kind === 'ObjectId') return res.status(400).json({ error: 'Invalid ID format' });
    res.status(500).json({ error: 'Failed to delete item', message: error.message });
  }
});

// ==================== PROJECT ROUTES ====================

// GET all projects
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await Project.find()
      .populate('usedBars.itemId')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects', message: error.message });
  }
});

// GET single project
app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('usedBars.itemId');
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (error) {
    if (error.kind === 'ObjectId') return res.status(400).json({ error: 'Invalid ID format' });
    res.status(500).json({ error: 'Failed to fetch project', message: error.message });
  }
});

// POST create project
app.post('/api/projects', async (req, res) => {
  try {
    const project = new Project({
      name:      req.body.name,
      reference: req.body.reference,
      ralCode:   req.body.ralCode,
      ralColor:  req.body.ralColor || '#ffffff',
      date:      req.body.date,
      status:    req.body.status || 'en_cours'
    });
    await project.save();
    console.log('✅ Created project:', project.id);
    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    if (error.name === 'ValidationError') return res.status(400).json({ error: 'Validation error', message: error.message });
    res.status(500).json({ error: 'Failed to create project', message: error.message });
  }
});

// PUT update project metadata
app.put('/api/projects/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      {
        name:      req.body.name,
        reference: req.body.reference,
        ralCode:   req.body.ralCode,
        ralColor:  req.body.ralColor,
        date:      req.body.date,
        status:    req.body.status
      },
      { new: true, runValidators: true }
    ).populate('usedBars.itemId');
    if (!project) return res.status(404).json({ error: 'Project not found' });
    console.log('✅ Updated project:', project.id);
    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    if (error.name === 'ValidationError') return res.status(400).json({ error: 'Validation error', message: error.message });
    res.status(500).json({ error: 'Failed to update project', message: error.message });
  }
});

// DELETE project — restore all used bar stock
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Restore stock for all used bars
    for (const usedBar of project.usedBars) {
      await Item.findByIdAndUpdate(usedBar.itemId, {
        $inc: { quantity: usedBar.quantity }
      });
    }

    await Project.findByIdAndDelete(req.params.id);
    console.log('✅ Deleted project:', req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    console.error('Error deleting project:', error);
    if (error.kind === 'ObjectId') return res.status(400).json({ error: 'Invalid ID format' });
    res.status(500).json({ error: 'Failed to delete project', message: error.message });
  }
});

// ==================== CHASSIS ROUTES ====================

// POST add chassis to project
app.post('/api/projects/:id/chassis', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const chassisData = {
      type:      req.body.type,
      repere:    req.body.repere,
      quantity:  Number(req.body.quantity) || 1,
      largeur:   Number(req.body.largeur) || 0,
      hauteur:   Number(req.body.hauteur) || 0,
      dimension: req.body.dimension || `${req.body.largeur}x${req.body.hauteur}`,
      etat:      req.body.etat || 'non_entame',
      components: req.body.components || []
    };

    project.chassis.push(chassisData);
    await project.save();

    const newChassis = project.chassis[project.chassis.length - 1];
    console.log('✅ Added chassis to project:', project.id);
    res.status(201).json(newChassis);
  } catch (error) {
    console.error('Error adding chassis:', error);
    if (error.name === 'ValidationError') return res.status(400).json({ error: 'Validation error', message: error.message });
    res.status(500).json({ error: 'Failed to add chassis', message: error.message });
  }
});

// PUT update chassis
app.put('/api/projects/:id/chassis/:cid', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const chassis = project.chassis.id(req.params.cid);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });

    chassis.type      = req.body.type      ?? chassis.type;
    chassis.repere    = req.body.repere    ?? chassis.repere;
    chassis.quantity  = req.body.quantity  !== undefined ? Number(req.body.quantity) : chassis.quantity;
    chassis.largeur   = req.body.largeur   !== undefined ? Number(req.body.largeur) : chassis.largeur;
    chassis.hauteur   = req.body.hauteur   !== undefined ? Number(req.body.hauteur) : chassis.hauteur;
    chassis.dimension = req.body.dimension ?? `${chassis.largeur}x${chassis.hauteur}`;
    chassis.etat      = req.body.etat      ?? chassis.etat;
    if (req.body.components !== undefined) chassis.components = req.body.components;

    await project.save();
    console.log('✅ Updated chassis:', req.params.cid);
    res.json(chassis);
  } catch (error) {
    console.error('Error updating chassis:', error);
    res.status(500).json({ error: 'Failed to update chassis', message: error.message });
  }
});

// DELETE chassis
app.delete('/api/projects/:id/chassis/:cid', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const chassis = project.chassis.id(req.params.cid);
    if (!chassis) return res.status(404).json({ error: 'Chassis not found' });

    project.chassis.pull(req.params.cid);
    await project.save();
    console.log('✅ Deleted chassis:', req.params.cid);
    res.json({ success: true, id: req.params.cid });
  } catch (error) {
    console.error('Error deleting chassis:', error);
    res.status(500).json({ error: 'Failed to delete chassis', message: error.message });
  }
});

// ==================== USED BARS ROUTES ====================

// POST add bar to project — decrements inventory stock
app.post('/api/projects/:id/bars', async (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    if (!itemId || !quantity || quantity < 1) {
      return res.status(400).json({ error: 'itemId and quantity (≥1) are required' });
    }

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const item = await Item.findById(itemId);
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });

    if (item.quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock', available: item.quantity });
    }

    // Check if bar already in project — update quantity if so
    const existing = project.usedBars.find(b => b.itemId.toString() === itemId.toString());
    if (existing) {
      if (item.quantity < quantity) {
        return res.status(400).json({ error: 'Insufficient stock for additional quantity' });
      }
      existing.quantity += Number(quantity);
    } else {
      project.usedBars.push({ itemId, quantity: Number(quantity) });
    }

    // Decrement inventory
    item.quantity = Math.max(0, item.quantity - Number(quantity));
    await item.save();
    await project.save();
    await project.populate('usedBars.itemId');

    console.log(`✅ Added bar ${itemId} (qty: ${quantity}) to project ${project.id}`);
    res.status(201).json(project);
  } catch (error) {
    console.error('Error adding bar to project:', error);
    if (error.kind === 'ObjectId') return res.status(400).json({ error: 'Invalid ID format' });
    res.status(500).json({ error: 'Failed to add bar', message: error.message });
  }
});

// DELETE bar from project — restores inventory stock
app.delete('/api/projects/:id/bars/:itemId', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const barEntry = project.usedBars.find(b => b.itemId.toString() === req.params.itemId);
    if (!barEntry) return res.status(404).json({ error: 'Bar not found in project' });

    // Restore inventory stock
    await Item.findByIdAndUpdate(req.params.itemId, {
      $inc: { quantity: barEntry.quantity }
    });

    project.usedBars = project.usedBars.filter(b => b.itemId.toString() !== req.params.itemId);
    await project.save();
    await project.populate('usedBars.itemId');

    console.log(`✅ Removed bar ${req.params.itemId} from project ${project.id}`);
    res.json(project);
  } catch (error) {
    console.error('Error removing bar from project:', error);
    if (error.kind === 'ObjectId') return res.status(400).json({ error: 'Invalid ID format' });
    res.status(500).json({ error: 'Failed to remove bar', message: error.message });
  }
});

// ==================== ERROR HANDLERS ====================

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Cannot ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});


// ==================== CHASSIS TYPES CRUD ====================

// GET all chassis types
app.get('/api/chassis-types', async (req, res) => {
  try {
    const types = await ChassisType.find().sort({ order: 1, createdAt: 1 });
    res.json(types);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chassis types' });
  }
});

// POST create chassis type
app.post('/api/chassis-types', async (req, res) => {
  try {
    const { value, fr, it, en, composite, vantaux } = req.body;
    if (!value || !fr) return res.status(400).json({ error: 'value and fr are required' });
    const count = await ChassisType.countDocuments();
    const ct = new ChassisType({ value, fr, it: it||fr, en: en||fr, composite: !!composite, vantaux: composite ? (Number(vantaux)||2) : 0, order: count });
    await ct.save();
    res.status(201).json(ct);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Type value already exists' });
    res.status(500).json({ error: 'Failed to create chassis type', message: error.message });
  }
});

// PUT update chassis type
app.put('/api/chassis-types/:id', async (req, res) => {
  try {
    const ct = await ChassisType.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!ct) return res.status(404).json({ error: 'Not found' });
    res.json(ct);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update chassis type' });
  }
});

// DELETE chassis type
app.delete('/api/chassis-types/:id', async (req, res) => {
  try {
    await ChassisType.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete chassis type' });
  }
});

// ==================== START ====================

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/inventory`);
  console.log(`📁 Projects API: http://localhost:${PORT}/api/projects`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  mongoose.connection.close();
  process.exit(0);
});
