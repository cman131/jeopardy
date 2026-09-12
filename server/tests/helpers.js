const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongod;

async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function stopDb() {
  await mongoose.disconnect();
  await mongod.stop();
}

async function clearDb() {
  const collections = mongoose.connection.collections;
  for (const key in collections) await collections[key].deleteMany({});
}

function makeTestBoard(overrides = {}) {
  return {
    name: 'Test Board',
    categories: Array.from({ length: 6 }, (_, ci) => ({
      name: `CAT${ci}`,
      clues: [200, 400, 600, 800, 1000].map((value, qi) => ({
        question: `Q${ci}-${qi}`,
        answer: `A${ci}-${qi}`,
        value,
      })),
    })),
    ...overrides,
  };
}

module.exports = { startDb, stopDb, clearDb, makeTestBoard };
