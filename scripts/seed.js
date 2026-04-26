/**
 * Seed script — creates the initial super_admin account.
 * Run with: node scripts/seed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/basma';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;

// ─── Minimal inline schema (avoids circular imports) ─────────────────────────
const userSchema = new mongoose.Schema({
  name: { first: String, last: String },
  nationalId: { type: String, unique: true },
  phone: { type: String, unique: true },
  email: { type: String },
  password: { type: String },
  role: { type: String, enum: ['super_admin', 'school_admin', 'teacher', 'parent', 'student'] },
  schoolId: { type: mongoose.Schema.Types.ObjectId, default: null },
  isActive: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  refreshToken: { type: String, default: null },
  lastLogin: { type: Date, default: null },
}, { timestamps: true });

async function seed() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  // Use the real User model path to keep schema consistent
  let User;
  try {
    User = require('./src/models/User.model');
  } catch {
    User = mongoose.model('User', userSchema);
  }

  const superAdmins = [
    {
      name: { first: 'Super', last: 'Admin' },
      nationalId: '1000000001',
      phone: '0500000001',
      email: 'admin@basma.edu',
      password: 'Admin@1234',
      role: 'super_admin',
    },
  ];

  for (const data of superAdmins) {
    const exists = await User.findOne({ nationalId: data.nationalId });
    if (exists) {
      console.log(`  ⚠ User ${data.nationalId} already exists — skipping.`);
      continue;
    }
    const hashed = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    await User.create({ ...data, password: hashed });
    console.log(`  ✅ Created ${data.role}: ${data.name.first} ${data.name.last}`);
    console.log(`     National ID : ${data.nationalId}`);
    console.log(`     Password    : ${data.password}`);
    console.log(`     Phone       : ${data.phone}`);
  }

  await mongoose.disconnect();
  console.log('\nSeeding complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
