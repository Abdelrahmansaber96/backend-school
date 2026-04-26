/**
 * migrate-add-subdomain.js — Adds subdomain + branding fields to existing schools
 * Run: node scripts/migrate-add-subdomain.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const School = require('../src/models/School.model');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/basma';

async function migrate() {
  console.log('🔌 Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected.\n');

  const schools = await School.find({ $or: [{ subdomain: { $exists: false } }, { subdomain: null }] });
  console.log(`Found ${schools.length} school(s) without subdomain.\n`);

  for (const school of schools) {
    // Use a safe ASCII subdomain — fallback to school ID
    let asciiSubdomain = school.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!asciiSubdomain || asciiSubdomain.length < 3) {
      asciiSubdomain = `school-${school._id.toString().slice(-6)}`;
    }

    school.subdomain = asciiSubdomain;
    if (!school.branding) {
      school.branding = {
        primaryColor: '#C8A24D',
        secondaryColor: '#0a0e1a',
      };
    }
    await school.save();
    console.log(`  ✅ ${school.name} → subdomain: "${asciiSubdomain}"`);
  }

  console.log('\n✅ Migration complete.');
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ Migration error:', err);
  process.exit(1);
});
