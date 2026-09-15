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

describe('player:rejoin', () => {
  test('reconnects a known player and returns current game state', async () => {
    const { host, player1, player2, gameCode } = await createStartedGame();

    player1.disconnect();
    const rejoining = await makeClient();

    const rejoined = waitFor(rejoining, 'player:rejoined');
    rejoining.emit('player:rejoin', { gameCode, name: 'Alice' });
    const data = await rejoined;

    expect(data.name).toBe('Alice');
    expect(data.phase).toBe('board');
    expect(data.players.find(p => p.name === 'Alice')).toBeDefined();
    expect(typeof data.currentRound).toBe('number');

    host.disconnect();
    player2.disconnect();
    rejoining.disconnect();
  });

  test('emits error:gameNotFound for unknown game code', async () => {
    const socket = await makeClient();
    const err = waitFor(socket, 'error:gameNotFound');
    socket.emit('player:rejoin', { gameCode: 'ZZZZ', name: 'Alice' });
    await err;
    socket.disconnect();
  });

  test('emits error:notInGame when player name not in game', async () => {
    const { host, player1, player2, gameCode } = await createStartedGame();
    const socket = await makeClient();

    const err = waitFor(socket, 'error:notInGame');
    socket.emit('player:rejoin', { gameCode, name: 'Charlie' });
    await err;

    host.disconnect();
    player1.disconnect();
    player2.disconnect();
    socket.disconnect();
  });

  test('rejoined player can buzz after rejoining', async () => {
    const { host, player1, player2, gameCode } = await createStartedGame();

    host.emit('host:selectClue', { categoryIndex: 0, clueIndex: 0 });
    await waitFor(player2, 'game:clueRevealed');

    player1.disconnect();
    const rejoining = await makeClient();
    rejoining.emit('player:rejoin', { gameCode, name: 'Alice' });
    await waitFor(rejoining, 'player:rejoined');

    host.emit('host:unlock');
    await waitFor(rejoining, 'game:buzzersOpen');

    rejoining.emit('player:buzz');
    const claimed = await waitFor(host, 'game:buzzClaimed');
    expect(claimed.playerName).toBe('Alice');

    host.disconnect();
    player2.disconnect();
    rejoining.disconnect();
  });
});

describe('player:rejoin FJ fields', () => {
  test('includes fjType and fjMediaUrl in payload when rejoining during final-clue', async () => {
    const board = makeTestBoard({
      finalJeopardy: {
        category: 'FJ-CAT', clue: 'FJ-CLUE', answer: 'FJ-ANSWER',
        type: 'image', mediaUrl: 'https://example.com/fj.jpg',
      },
    });
    const boardDoc = await Board.create(board);
    const gameCode = gameStore.create(boardDoc.toObject());
    await Game.create({ boardId: boardDoc._id, gameCode });

    const host = await makeClient();
    const player = await makeClient();

    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');
    player.emit('player:join', { gameCode, name: 'Alice' });
    await waitFor(player, 'player:joined');

    // Force to final-clue phase
    const entry = gameStore.get(gameCode);
    entry.state.phase = 'final-clue';

    player.disconnect();
    const rejoining = await makeClient();
    const rejoinedP = waitFor(rejoining, 'player:rejoined');
    rejoining.emit('player:rejoin', { gameCode, name: 'Alice' });
    const data = await rejoinedP;

    expect(data.fjType).toBe('image');
    expect(data.fjMediaUrl).toBe('https://example.com/fj.jpg');

    host.disconnect();
    rejoining.disconnect();
  });

  test('fjType and fjMediaUrl are null when rejoining outside FJ phases', async () => {
    const { host, player1, player2, gameCode } = await createStartedGame();

    player1.disconnect();
    const rejoining = await makeClient();
    const rejoinedP = waitFor(rejoining, 'player:rejoined');
    rejoining.emit('player:rejoin', { gameCode, name: 'Alice' });
    const data = await rejoinedP;

    expect(data.fjType).toBeNull();
    expect(data.fjMediaUrl).toBeNull();

    host.disconnect();
    player2.disconnect();
    rejoining.disconnect();
  });
});

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

describe('multi-round socket flow', () => {
  // Wait for one of multiple possible events; resolves with { event, data }
  function waitForEvent(socket, eventOrEvents, timeout = 5000) {
    const events = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${events}`)), timeout);
      const cleanup = () => {
        clearTimeout(timer);
        events.forEach(e => socket.off(e, handlers[e]));
      };
      const handlers = {};
      events.forEach(e => {
        handlers[e] = (data) => { cleanup(); resolve({ event: e, data }); };
        socket.on(e, handlers[e]);
      });
    });
  }

  // Exhausts all 30 clues in the current round by selecting and skipping each one.
  // Resolves when the last skip produces game:betweenRounds or game:finalWager.
  async function exhaustRound(host, player1) {
    for (let ci = 0; ci < 6; ci++) {
      for (let qi = 0; qi < 5; qi++) {
        const clueRevealed = waitForEvent(player1, 'game:clueRevealed');
        host.emit('host:selectClue', { categoryIndex: ci, clueIndex: qi });
        await clueRevealed;
        const done = waitForEvent(player1, ['game:scored', 'game:betweenRounds', 'game:finalWager']);
        host.emit('host:skipClue');
        await done;
      }
    }
  }

  // Drive a game from started → final-wager phase.
  async function reachFinalWager(host, player1) {
    // Exhaust round 1 → between-rounds
    await exhaustRound(host, player1);
    // Start round 2
    const round2Started = waitForEvent(player1, 'game:round2Started');
    host.emit('host:startRound2');
    await round2Started;
    // Exhaust round 2 → final-wager
    await exhaustRound(host, player1);
  }

  test('host:startRound2 emits game:round2Started with currentRound: 2 and 6 categories', async () => {
    const { host, player1, player2 } = await createStartedGame();
    await exhaustRound(host, player1);
    const resultP = waitForEvent(player1, 'game:round2Started', 5000);
    host.emit('host:startRound2');
    const { data } = await resultP;
    expect(data.currentRound).toBe(2);
    expect(data.categoryNames).toHaveLength(6);
    host.disconnect();
    player1.disconnect();
    player2.disconnect();
  }, 15000);

  test('player:submitWager emits game:wagerSubmitted; host:closeWagers emits game:finalClue', async () => {
    const { host, player1, player2 } = await createStartedGame();
    await reachFinalWager(host, player1);

    // Submit one wager from player1 (Alice)
    const wagerSubmittedP = waitForEvent(player1, 'game:wagerSubmitted', 5000);
    player1.emit('player:submitWager', { wager: 200 });
    const { data: submittedData } = await wagerSubmittedP;
    expect(submittedData.playerName).toBeDefined();

    // Force-close wagers
    const finalClueP = waitForEvent(player1, 'game:finalClue', 5000);
    host.emit('host:closeWagers');
    const { data: clueData } = await finalClueP;
    expect(clueData.clue).toBeDefined();
    expect(clueData.category).toBeDefined();

    host.disconnect();
    player1.disconnect();
    player2.disconnect();
  }, 40000);

  test('player:submitAnswer emits game:answerSubmitted; host:closeAnswers emits game:finalJudging', async () => {
    const { host, player1, player2 } = await createStartedGame();
    await reachFinalWager(host, player1);

    const finalClueP = waitForEvent(player1, 'game:finalClue', 5000);
    host.emit('host:closeWagers');
    await finalClueP;

    // Submit one answer
    const answerSubmittedP = waitForEvent(player1, 'game:answerSubmitted', 5000);
    player1.emit('player:submitAnswer', { answer: 'What is a test?' });
    const { data: ansData } = await answerSubmittedP;
    expect(ansData.playerName).toBeDefined();

    // Force-close answers
    const judgingP = waitForEvent(player1, 'game:finalJudging', 5000);
    host.emit('host:closeAnswers');
    await judgingP;

    host.disconnect();
    player1.disconnect();
    player2.disconnect();
  }, 40000);

  test('host:revealNext emits game:finalReveal then game:finished after last player', async () => {
    const { host, player1, player2 } = await createStartedGame();
    await reachFinalWager(host, player1);

    // Close wagers and answers
    const finalClueP = waitForEvent(player1, 'game:finalClue', 5000);
    host.emit('host:closeWagers');
    await finalClueP;

    const judgingP = waitForEvent(player1, 'game:finalJudging', 5000);
    host.emit('host:closeAnswers');
    await judgingP;

    // Judge both players (host:closeAnswers transitions to final-judging)
    host.emit('host:judgeFinal', { playerName: 'Alice', correct: true });
    host.emit('host:judgeFinal', { playerName: 'Bob', correct: false });

    // Wait briefly for judgments to be processed, then reveal
    await new Promise(r => setTimeout(r, 100));

    // Reveal first player
    const reveal1P = waitForEvent(player1, 'game:finalReveal', 5000);
    host.emit('host:revealNext');
    const { data: rev1 } = await reveal1P;
    expect(rev1.playerName).toBeDefined();
    expect(rev1.players).toHaveLength(2);

    // Reveal second player — should also trigger game:finished
    const finishedP = waitForEvent(player1, 'game:finished', 5000);
    host.emit('host:revealNext');
    const { data: finishedData } = await finishedP;
    expect(finishedData.players).toHaveLength(2);

    host.disconnect();
    player1.disconnect();
    player2.disconnect();
  }, 40000);
});

describe('host:revealAnswer', () => {
  async function reachJudgingPhase(gameCode) {
    const host = await makeClient();
    const display = await makeClient();
    const p1 = await makeClient();
    const p2 = await makeClient();
    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');
    display.emit('display:join', { gameCode });
    await waitFor(display, 'display:joined');
    p1.emit('player:join', { gameCode, name: 'Alice' });
    await waitFor(p1, 'player:joined');
    p2.emit('player:join', { gameCode, name: 'Bob' });
    await waitFor(p2, 'player:joined');
    host.emit('host:startGame', { gameCode });
    await waitFor(host, 'host:state');
    host.emit('host:selectClue', { categoryIndex: 0, clueIndex: 0 });
    await waitFor(host, 'host:clue');
    host.emit('host:unlock');
    await waitFor(display, 'game:buzzersOpen');
    p1.emit('player:buzz');
    await waitFor(display, 'game:buzzClaimed');
    return { host, display, p1, p2 };
  }

  test('broadcasts game:answerRevealed with answer and answerImage', async () => {
    const board = makeTestBoard();
    board.round1.categories[0].clues[0].answerImage = 'https://example.com/ans.jpg';
    const boardDoc = await Board.create(board);
    const gameCode = gameStore.create(boardDoc.toObject());
    await Game.create({ boardId: boardDoc._id, gameCode });

    const { host, display, p1, p2 } = await reachJudgingPhase(gameCode);
    const revealed = waitFor(display, 'game:answerRevealed');
    host.emit('host:revealAnswer');
    const data = await revealed;
    expect(data.answer).toBe('R1-A0-0');
    expect(data.answerImage).toBe('https://example.com/ans.jpg');
    host.disconnect(); display.disconnect(); p1.disconnect(); p2.disconnect();
  });

  test('game:answerRevealed has null answerImage when clue has none', async () => {
    const { gameCode } = await setupGame();
    const { host, display, p1, p2 } = await reachJudgingPhase(gameCode);
    const revealed = waitFor(display, 'game:answerRevealed');
    host.emit('host:revealAnswer');
    const data = await revealed;
    expect(data.answer).toBe('R1-A0-0');
    expect(data.answerImage).toBeNull();
    host.disconnect(); display.disconnect(); p1.disconnect(); p2.disconnect();
  });

  test('host:revealAnswer is ignored outside judging phase', async () => {
    const { gameCode } = await setupGame();
    const host = await makeClient();
    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');
    let received = false;
    host.on('game:answerRevealed', () => { received = true; });
    host.emit('host:revealAnswer');
    await new Promise(r => setTimeout(r, 100));
    expect(received).toBe(false);
    host.disconnect();
  });
});

describe('FJ socket events include media fields', () => {
  function forceFinalWager(gameCode) {
    const entry = gameStore.get(gameCode);
    entry.state.players = [{ name: 'Alice', score: 0, scoreHistory: [] }];
    entry.state.phase = 'final-wager';
  }

  function forceFinalClue(gameCode) {
    const entry = gameStore.get(gameCode);
    entry.state.players = [{ name: 'Alice', score: 0, scoreHistory: [] }];
    entry.state.phase = 'final-clue';
  }

  test('game:finalClue includes type and mediaUrl', async () => {
    const board = makeTestBoard({
      finalJeopardy: {
        category: 'FJ-CAT', clue: 'FJ-CLUE', answer: 'FJ-ANSWER',
        type: 'image', mediaUrl: 'https://example.com/fj.jpg',
      },
    });
    const boardDoc = await Board.create(board);
    const gameCode = gameStore.create(boardDoc.toObject());
    await Game.create({ boardId: boardDoc._id, gameCode });

    const host = await makeClient();
    const display = await makeClient();
    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');
    display.emit('display:join', { gameCode });
    await waitFor(display, 'display:joined');

    forceFinalWager(gameCode);
    const finalClue = waitFor(display, 'game:finalClue');
    host.emit('host:closeWagers');
    const data = await finalClue;
    expect(data.type).toBe('image');
    expect(data.mediaUrl).toBe('https://example.com/fj.jpg');
    host.disconnect(); display.disconnect();
  });

  test('game:finalJudgingReady includes fjAnswerImage', async () => {
    const board = makeTestBoard({
      finalJeopardy: {
        category: 'FJ-CAT', clue: 'FJ-CLUE', answer: 'FJ-ANSWER',
        answerImage: 'https://example.com/fjans.jpg',
      },
    });
    const boardDoc = await Board.create(board);
    const gameCode = gameStore.create(boardDoc.toObject());
    await Game.create({ boardId: boardDoc._id, gameCode });

    const host = await makeClient();
    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');

    forceFinalClue(gameCode);
    const judging = waitFor(host, 'game:finalJudgingReady');
    host.emit('host:closeAnswers');
    const data = await judging;
    expect(data.fjAnswerImage).toBe('https://example.com/fjans.jpg');
    host.disconnect();
  });

  test('game:finalJudgingReady has null fjAnswerImage when not set', async () => {
    const { gameCode } = await setupGame();
    const host = await makeClient();
    host.emit('host:join', { gameCode });
    await waitFor(host, 'host:joined');

    forceFinalClue(gameCode);
    const judging = waitFor(host, 'game:finalJudgingReady');
    host.emit('host:closeAnswers');
    const data = await judging;
    expect(data.fjAnswerImage).toBeNull();
    host.disconnect();
  });
});
