const GameState = require('./GameState');

const store = new Map(); // gameCode → { state, hostSocketId, playerSockets }

function generateGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (store.has(code));
  return code;
}

function create(board) {
  const gameCode = generateGameCode();
  store.set(gameCode, { state: new GameState(board), hostSocketId: null, playerSockets: new Map() });
  return gameCode;
}

function get(gameCode) {
  return store.get(gameCode) || null;
}

function remove(gameCode) {
  store.delete(gameCode);
}

module.exports = { create, get, remove, generateGameCode };
