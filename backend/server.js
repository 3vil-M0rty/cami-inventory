/**
 * Aluminum Inventory Backend Server
 * 
 * Production-ready Express + MongoDB API
 * Shared database for all users
 * WITH QUANTITY UPDATE FEATURE
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

// Mongoose Schema & Model
const itemSchema = new mongoose.Schema({
  image: {
    type: String,
    default: ''
  },
  designation: {
    it: {
      type: String,
      required: [true, 'Italian designation is required'],
      trim: true
    },
    fr: {
      type: String,
      required: [true, 'French designation is required'],
      trim: true
    },
    en: {
      type: String,
      required: [true, 'English designation is required'],
      trim: true
    }
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [0, 'Quantity cannot be negative']
  },
  threshold: {
    type: Number,
    required: [true, 'Threshold is required'],
    min: [0, 'Threshold cannot be negative']
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

const Item = mongoose.model('Item', itemSchema);

// Initialize sample data
async function initializeSampleData() {
  try {
    const count = await Item.countDocuments();
    
    if (count === 0) {
      console.log('📦 Initializing sample data...');
      
      const sampleData = [
        {
          image: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=400',
          designation: {
            it: 'Barra Alluminio 6063 - 50x25mm',
            fr: 'Barre Aluminium 6063 - 50x25mm',
            en: 'Aluminum Bar 6063 - 50x25mm'
          },
          quantity: 45,
          threshold: 20
        },
        {
          image: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=400',
          designation: {
            it: 'Barra Alluminio 7075 - 30x30mm',
            fr: 'Barre Aluminium 7075 - 30x30mm',
            en: 'Aluminum Bar 7075 - 30x30mm'
          },
          quantity: 8,
          threshold: 15
        },
        {
          image: 'https://images.unsplash.com/photo-1596555544573-f7c0d5c3bbba?w=400',
          designation: {
            it: 'Barra Alluminio 5052 - 60x40mm',
            fr: 'Barre Aluminium 5052 - 60x40mm',
            en: 'Aluminum Bar 5052 - 60x40mm'
          },
          quantity: 32,
          threshold: 25
        },
        {
          image: 'https://images.unsplash.com/photo-1565793298595-6a879b1d9492?w=400',
          designation: {
            it: 'Barra Alluminio 2024 - 40x20mm',
            fr: 'Barre Aluminium 2024 - 40x20mm',
            en: 'Aluminum Bar 2024 - 40x20mm'
          },
          quantity: 12,
          threshold: 30
        }
      ];
      
      await Item.insertMany(sampleData);
      console.log('✅ Sample data initialized');
    }
  } catch (error) {
    console.error('Error initializing sample data:', error);
  }
}

// ==================== API ROUTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// GET all items
app.get('/api/inventory', async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ 
      error: 'Failed to fetch inventory items',
      message: error.message 
    });
  }
});

// GET single item by ID
app.get('/api/inventory/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ 
        error: 'Item not found',
        message: `No item found with id: ${req.params.id}` 
      });
    }
    
    res.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The provided ID is not valid' 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch item',
      message: error.message 
    });
  }
});

// POST create new item
app.post('/api/inventory', async (req, res) => {
  try {
    const itemData = {
      image: req.body.image || '',
      designation: {
        it: req.body.designation?.it,
        fr: req.body.designation?.fr,
        en: req.body.designation?.en
      },
      quantity: Number(req.body.quantity),
      threshold: Number(req.body.threshold)
    };
    
    const item = new Item(itemData);
    await item.save();
    
    console.log('✅ Created item:', item.id);
    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating item:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation error',
        message: error.message,
        details: Object.keys(error.errors).reduce((acc, key) => {
          acc[key] = error.errors[key].message;
          return acc;
        }, {})
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create item',
      message: error.message 
    });
  }
});

// PUT update item
app.put('/api/inventory/:id', async (req, res) => {
  try {
    const updateData = {
      image: req.body.image,
      designation: {
        it: req.body.designation?.it,
        fr: req.body.designation?.fr,
        en: req.body.designation?.en
      },
      quantity: Number(req.body.quantity),
      threshold: Number(req.body.threshold)
    };
    
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      updateData,
      { 
        new: true,
        runValidators: true
      }
    );
    
    if (!item) {
      return res.status(404).json({ 
        error: 'Item not found',
        message: `No item found with id: ${req.params.id}` 
      });
    }
    
    console.log('✅ Updated item:', item.id);
    res.json(item);
  } catch (error) {
    console.error('Error updating item:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The provided ID is not valid' 
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation error',
        message: error.message 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to update item',
      message: error.message 
    });
  }
});

// PATCH update quantity only (NEW FEATURE!)
app.patch('/api/inventory/:id/quantity', async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (typeof amount !== 'number') {
      return res.status(400).json({
        error: 'Invalid amount',
        message: 'Amount must be a number'
      });
    }
    
    const item = await Item.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ 
        error: 'Item not found',
        message: `No item found with id: ${req.params.id}` 
      });
    }
    
    // Update quantity, but don't allow negative values
    item.quantity = Math.max(0, item.quantity + amount);
    await item.save();
    
    console.log(`✅ Updated quantity for item ${item.id}: ${amount > 0 ? '+' : ''}${amount} (new: ${item.quantity})`);
    res.json(item);
  } catch (error) {
    console.error('Error updating quantity:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The provided ID is not valid' 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to update quantity',
      message: error.message 
    });
  }
});

// DELETE item
app.delete('/api/inventory/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    
    if (!item) {
      return res.status(404).json({ 
        error: 'Item not found',
        message: `No item found with id: ${req.params.id}` 
      });
    }
    
    console.log('✅ Deleted item:', req.params.id);
    res.json({ 
      success: true,
      id: req.params.id,
      message: 'Item deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting item:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        message: 'The provided ID is not valid' 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to delete item',
      message: error.message 
    });
  }
});

// GET low stock items
app.get('/api/inventory/filter/low-stock', async (req, res) => {
  try {
    const items = await Item.find();
    const lowStock = items.filter(item => item.quantity < item.threshold);
    res.json(lowStock);
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    res.status(500).json({ 
      error: 'Failed to fetch low stock items',
      message: error.message 
    });
  }
});

// SEARCH items
app.get('/api/inventory/search', async (req, res) => {
  try {
    const searchTerm = req.query.q || '';
    
    if (!searchTerm) {
      const items = await Item.find().sort({ createdAt: -1 });
      return res.json(items);
    }
    
    const items = await Item.find({
      $or: [
        { 'designation.it': { $regex: searchTerm, $options: 'i' } },
        { 'designation.fr': { $regex: searchTerm, $options: 'i' } },
        { 'designation.en': { $regex: searchTerm, $options: 'i' } }
      ]
    }).sort({ createdAt: -1 });
    
    res.json(items);
  } catch (error) {
    console.error('Error searching items:', error);
    res.status(500).json({ 
      error: 'Failed to search items',
      message: error.message 
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}` 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/inventory`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  mongoose.connection.close();
  process.exit(0);
});
