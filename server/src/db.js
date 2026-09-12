const mongoose = require('mongoose');

async function connect(uri) {
  await mongoose.connect(uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/jeopardy', { serverSelectionTimeoutMS: 5000 });
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { connect, disconnect };
