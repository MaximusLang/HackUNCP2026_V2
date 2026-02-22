// reset_db.js
// Usage: node reset_db.js
// Clears all assignments, courses, and completed_assignments collections.

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://0.0.0.0:27017/hackuncp';

async function resetDB() {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.collection('assignments').deleteMany({});
  await mongoose.connection.collection('courses').deleteMany({});
  await mongoose.connection.collection('completed_assignments').deleteMany({});
  console.log('Database cleared.');
  await mongoose.disconnect();
}

resetDB().catch(err => { console.error('Error clearing DB:', err); process.exit(1); });
