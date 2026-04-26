const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/basma').then(async () => {
  const User = require('./src/models/User.model');
  const r = await User.updateMany({}, { $set: { failedLoginAttempts: 0, lockedUntil: null } });
  console.log('Reset:', r.modifiedCount, 'users');
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
