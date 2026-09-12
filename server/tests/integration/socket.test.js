const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const { registerGameHandlers } = require('../../src/sockets/gameHandlers');
const gameStore = require('../../src/game/gameStore');
const { startDb, stopDb, clearDb, makeTestBoard } = require('../helpers');
const Board = require('../../src/models/Board');
const Game = require('../../src/models/Game');

let httpServer, ioServer, port;

beforeAll(async () => {
  await startDb();
  httpServer = createServer();
  ioServer = new Server(httpServer, { cors: { origin: '*' } });
  ioServer.on('connection', socket => registerGameHandlers(ioServer, socket));
  await new Promise(resolve => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  await new Promise(resolve => httpServer.close(resolve));
  await stopDb();
});

beforeEach(clearDb);

function makeClient() {
  return new Promise(resolve => {
    const socket = Client(`http://localhost:${port}`, { forceNew: true });
    socket.on('connect', () => resolve(socket));
  });
}

function waitFor(socket, event) {
  return new Promise(resolve => socket.once(event, resolve));
}

async function setupGame() {
  const board = await Board.create(makeTestBoard());
  const gameCode = gameStore.create(board.toObject());
  await Game.create({ boardId: board._id, gameCode });
  return { gameCode, boardId: board._id.toString() };
}

describe('player:join', () => {
  test('emits game:playerJoined to room on success', async () => {
    const { gameCode } = await setupGame();
    const host = await makeClient();
    const player = await makeClient();

    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');

    const joined = waitFor(host, 'game:playerJoined');
    player.emit('player:join', { gameCode, name: 'Alice' });
    const data = await joined;
    expect(data.players[0].name).toBe('Alice');

    host.disconnect();
    player.disconnect();
  });

  test('emits error:gameNotFound for bad code', async () => {
    const socket = await makeClient();
    const err = waitFor(socket, 'error:gameNotFound');
    socket.emit('player:join', { gameCode: 'ZZZZ', name: 'Alice' });
    await err;
    socket.disconnect();
  });

  test('emits error:nameTaken for duplicate name', async () => {
    const { gameCode } = await setupGame();
    const p1 = await makeClient();
    const p2 = await makeClient();

    p1.emit('player:join', { gameCode, name: 'Alice' });
    await waitFor(p1, 'player:joined');

    const err = waitFor(p2, 'error:nameTaken');
    p2.emit('player:join', { gameCode, name: 'Alice' });
    await err;

    p1.disconnect();
    p2.disconnect();
  });
});

describe('full game flow', () => {
  test('correct answer: scores player, returns to board', async () => {
    const { gameCode } = await setupGame();
    const host = await makeClient();
    const alice = await makeClient();
    const bob = await makeClient();

    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');

    alice.emit('player:join', { gameCode, name: 'Alice' });
    await waitFor(alice, 'player:joined');
    bob.emit('player:join', { gameCode, name: 'Bob' });
    await waitFor(bob, 'player:joined');

    host.emit('host:startGame', { gameCode });
    await waitFor(host, 'game:started');

    host.emit('host:selectClue', { categoryIndex: 0, clueIndex: 2 }); // $600
    await waitFor(alice, 'game:clueRevealed');

    host.emit('host:unlock');
    await waitFor(alice, 'game:buzzersOpen');

    alice.emit('player:buzz');
    const claimed = await waitFor(host, 'game:buzzClaimed');
    expect(claimed.playerName).toBe('Alice');

    host.emit('host:judge', { result: 'correct' });
    const scored = await waitFor(alice, 'game:scored');
    expect(scored.players.find(p => p.name === 'Alice').score).toBe(600);
    expect(scored.currentPicker).toBe('Alice');

    host.disconnect();
    alice.disconnect();
    bob.disconnect();
  });

  test('incorrect then correct: first wrong player loses points, second gains', async () => {
    const { gameCode } = await setupGame();
    const host = await makeClient();
    const alice = await makeClient();
    const bob = await makeClient();

    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');
    alice.emit('player:join', { gameCode, name: 'Alice' });
    await waitFor(alice, 'player:joined');
    bob.emit('player:join', { gameCode, name: 'Bob' });
    await waitFor(bob, 'player:joined');

    host.emit('host:startGame', { gameCode });
    await waitFor(host, 'game:started');
    host.emit('host:selectClue', { categoryIndex: 0, clueIndex: 0 }); // $200
    await waitFor(alice, 'game:clueRevealed');
    host.emit('host:unlock');
    await waitFor(alice, 'game:buzzersOpen');

    alice.emit('player:buzz');
    await waitFor(host, 'game:buzzClaimed');
    host.emit('host:judge', { result: 'incorrect' });
    await waitFor(alice, 'game:scored'); // Alice: -200

    // Bob can now buzz
    bob.emit('player:buzz');
    await waitFor(host, 'game:buzzClaimed');
    host.emit('host:judge', { result: 'correct' });
    const scored = await waitFor(bob, 'game:scored');
    expect(scored.players.find(p => p.name === 'Alice').score).toBe(-200);
    expect(scored.players.find(p => p.name === 'Bob').score).toBe(200);

    host.disconnect();
    alice.disconnect();
    bob.disconnect();
  });
});
