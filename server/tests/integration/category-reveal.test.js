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

async function createStartedGame() {
  const { gameCode } = await setupGame();
  const host = await makeClient();
  const player1 = await makeClient();
  const player2 = await makeClient();

  host.emit('host:join', { gameCode });
  await waitFor(host, 'host:joined');

  player1.emit('player:join', { gameCode, name: 'Alice' });
  await waitFor(player1, 'player:joined');
  player2.emit('player:join', { gameCode, name: 'Bob' });
  await waitFor(player2, 'player:joined');

  host.emit('host:startGame', { gameCode });
  await waitFor(host, 'game:started');

  return { host, player1, player2, gameCode };
}

describe('host:revealCategory relay', () => {
  test('during board phase, broadcasts game:categoryRevealed to all room members', async () => {
    const { host, player1, player2, gameCode } = await createStartedGame();

    const display = await makeClient();
    display.emit('display:join', { gameCode });
    await waitFor(display, 'display:joined');

    const displayReceived = waitFor(display, 'game:categoryRevealed');
    const player1Received = waitFor(player1, 'game:categoryRevealed');

    host.emit('host:revealCategory');

    await displayReceived;
    await player1Received;

    // Both received — test passes
    host.disconnect();
    player1.disconnect();
    player2.disconnect();
    display.disconnect();
  });

  test('phase guard — silently ignored during non-board phase', async () => {
    const { host, player1, player2, gameCode } = await createStartedGame();

    // Force game into clue phase
    host.emit('host:selectClue', { categoryIndex: 0, clueIndex: 0 });
    await waitFor(player1, 'game:clueRevealed');

    const display = await makeClient();
    display.emit('display:join', { gameCode });
    await waitFor(display, 'display:joined');

    host.emit('host:revealCategory');

    const received = await Promise.race([
      waitFor(display, 'game:categoryRevealed').then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), 150)),
    ]);
    expect(received).toBe(false);

    host.disconnect();
    player1.disconnect();
    player2.disconnect();
    display.disconnect();
  });

  test('auth guard — non-host socket is silently ignored', async () => {
    const { host, player1, player2, gameCode } = await createStartedGame();

    const unjoined = await makeClient();

    const display = await makeClient();
    display.emit('display:join', { gameCode });
    await waitFor(display, 'display:joined');

    unjoined.emit('host:revealCategory');

    const received = await Promise.race([
      waitFor(display, 'game:categoryRevealed').then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), 150)),
    ]);
    expect(received).toBe(false);

    host.disconnect();
    player1.disconnect();
    player2.disconnect();
    unjoined.disconnect();
    display.disconnect();
  });

  test('full reveal flow — 7 consecutive emits all relay correctly', async () => {
    const { host, player1, player2, gameCode } = await createStartedGame();

    const display = await makeClient();
    display.emit('display:join', { gameCode });
    await waitFor(display, 'display:joined');

    let receivedCount = 0;

    for (let i = 0; i < 7; i++) {
      const eventReceived = waitFor(display, 'game:categoryRevealed');
      host.emit('host:revealCategory');
      await eventReceived;
      receivedCount++;
    }

    expect(receivedCount).toBe(7);

    // Verify server game state is still in board phase (relay doesn't change phase)
    const entry = gameStore.get(gameCode);
    expect(entry.state.phase).toBe('board');

    host.disconnect();
    player1.disconnect();
    player2.disconnect();
    display.disconnect();
  });
});
