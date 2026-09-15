const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const gameStore = require('../src/game/gameStore');

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
  gameStore.clear();
}

function makeTestBoard(overrides = {}) {
  const makeRound = (prefix) => ({
    categories: Array.from({ length: 6 }, (_, ci) => ({
      name: `${prefix}-CAT${ci}`,
      clues: Array.from({ length: 5 }, (_, qi) => ({
        question: `${prefix}-Q${ci}-${qi}`,
        answer: `${prefix}-A${ci}-${qi}`,
      })),
    })),
  });
  return {
    name: 'Test Board',
    round1: makeRound('R1'),
    round2: makeRound('R2'),
    finalJeopardy: { category: 'FJ-CAT', clue: 'FJ-CLUE', answer: 'FJ-ANSWER' },
    ...overrides,
  };
}

function makeMediaClue(type, mediaUrl, answer, overrides = {}) {
  return { question: '', answer, type, mediaUrl, answerImage: '', mediaHash: '', ...overrides };
}

module.exports = { startDb, stopDb, clearDb, makeTestBoard, makeMediaClue };
