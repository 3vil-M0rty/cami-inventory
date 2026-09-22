// debug/checkOrdersNow.js
const mongoose = require('mongoose');
require('dotenv').config();

const orderSchema = new mongoose.Schema({}, { strict: false });
const Order = mongoose.model('Order', orderSchema);

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const total = await Order.countDocuments();
    const nonDraft = await Order.countDocuments({ status: { $ne: 'brouillon' } });
    const withCategories = await Order.countDocuments({ categories: { $exists: true } });
    
    console.log(`📊 Database status:`);
    console.log(`   Total orders: ${total}`);
    console.log(`   Non-draft orders: ${nonDraft}`);
    console.log(`   With categories field: ${withCategories}`);
    
    const sample = await Order.findOne({ status: { $ne: 'brouillon' } });
    if (sample) {
      console.log(`\n📋 Sample order:`);
      console.log(`   Number: ${sample.number}`);
      console.log(`   Status: ${sample.status}`);
      console.log(`   Categories:`, sample.categories);
    }
    
  } finally {
    await mongoose.connection.close();
  }
}

check();