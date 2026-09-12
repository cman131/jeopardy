const Game = require('../models/Game');
const gameStore = require('../game/gameStore');

function registerGameHandlers(io, socket) {
  socket.on('host:join', ({ gameCode }) => {
    const entry = gameStore.get(gameCode);
    if (!entry) return socket.emit('error:gameNotFound');
    const wasDisconnected = entry.hostSocketId === null && entry.state.phase !== 'lobby';
    entry.hostSocketId = socket.id;
    socket.join(gameCode);
    socket.emit('host:joined', entry.state.getHostState());
    if (wasDisconnected) io.to(gameCode).emit('host:reconnected');
  });

  socket.on('display:join', ({ gameCode }) => {
    const entry = gameStore.get(gameCode);
    if (!entry) return socket.emit('error:gameNotFound');
    socket.join(gameCode);
    socket.emit('display:joined', entry.state.getPublicState());
  });

  socket.on('player:join', async ({ gameCode, name }) => {
    const entry = gameStore.get(gameCode);
    if (!entry) return socket.emit('error:gameNotFound');
    try {
      entry.state.addPlayer(name);
    } catch (err) {
      if (err.message === 'Name taken') return socket.emit('error:nameTaken');
      return socket.emit('error:generic', { message: err.message });
    }
    entry.playerSockets.set(name, socket.id);
    socket.join(gameCode);
    await Game.updateOne({ gameCode }, { $push: { players: { name, score: 0, scoreHistory: [] } } });
    io.to(gameCode).emit('game:playerJoined', { players: entry.state.players.map(p => ({ name: p.name, score: p.score })) });
    socket.emit('player:joined', { name, gameCode });
  });

  socket.on('host:startGame', ({ gameCode }) => {
    const entry = gameStore.get(gameCode);
    if (!entry || entry.hostSocketId !== socket.id) return;
    try {
      entry.state.startGame();
    } catch (err) {
      return socket.emit('error:generic', { message: err.message });
    }
    const state = entry.state.getPublicState();
    io.to(gameCode).emit('game:started', {
      board: { name: entry.state.board.name, categoryNames: state.categoryNames },
      players: state.players,
      currentPicker: state.currentPicker,
    });
    socket.emit('host:state', entry.state.getHostState());
  });

  socket.on('host:selectClue', ({ categoryIndex, clueIndex }) => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    try {
      entry.state.selectClue(categoryIndex, clueIndex);
    } catch (err) {
      return socket.emit('error:generic', { message: err.message });
    }
    const gameCode = _gameCodeFor(socket);
    const pub = entry.state.getPublicState();
    io.to(gameCode).emit('game:clueRevealed', pub.currentClue);
    socket.emit('host:clue', entry.state.getHostState().currentClue);
  });

  socket.on('host:unlock', () => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    try { entry.state.unlock(); } catch { return; }
    io.to(_gameCodeFor(socket)).emit('game:buzzersOpen');
  });

  socket.on('player:buzz', () => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    if (!rooms.length) return;
    const gameCode = rooms[0];
    const entry = gameStore.get(gameCode);
    if (!entry) return;
    const playerName = [...entry.playerSockets.entries()].find(([, sid]) => sid === socket.id)?.[0];
    if (!playerName) return;
    const won = entry.state.buzz(playerName);
    if (won) io.to(gameCode).emit('game:buzzClaimed', { playerName });
  });

  socket.on('host:judge', async ({ result }) => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    const gameCode = _gameCodeFor(socket);
    try { entry.state.judge(result); } catch { return; }
    const pub = entry.state.getPublicState();

    for (const p of entry.state.players) {
      const lastEntry = p.scoreHistory[p.scoreHistory.length - 1];
      if (lastEntry) {
        await Game.updateOne(
          { gameCode, 'players.name': p.name },
          { $set: { 'players.$.score': p.score }, $push: { 'players.$.scoreHistory': lastEntry } }
        );
      }
    }
    await Game.updateOne({ gameCode }, { $set: { revealedClues: pub.revealedClues } });

    if (pub.phase === 'finished') {
      await Game.updateOne({ gameCode }, { $set: { status: 'finished', completedAt: new Date() } });
      io.to(gameCode).emit('game:finished', { players: entry.state.players });
    } else {
      io.to(gameCode).emit('game:scored', { players: pub.players, currentPicker: pub.currentPicker, revealedClues: pub.revealedClues });
    }
  });

  socket.on('host:skipClue', async () => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    const gameCode = _gameCodeFor(socket);
    try { entry.state.skipClue(); } catch { return; }
    const pub = entry.state.getPublicState();
    await Game.updateOne({ gameCode }, { $set: { revealedClues: pub.revealedClues } });
    io.to(gameCode).emit('game:clueSkipped', { revealedClues: pub.revealedClues, currentPicker: pub.currentPicker });
  });

  socket.on('host:endGame', async () => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    const gameCode = _gameCodeFor(socket);
    entry.state.endGame();
    await Game.updateOne({ gameCode }, { $set: { status: 'finished', completedAt: new Date() } });
    io.to(gameCode).emit('game:finished', { players: entry.state.players });
  });

  socket.on('disconnect', () => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    for (const gameCode of rooms) {
      const entry = gameStore.get(gameCode);
      if (!entry) continue;
      if (entry.hostSocketId === socket.id) {
        entry.hostSocketId = null;
        io.to(gameCode).emit('host:disconnected');
      }
    }
  });

  function _gameCodeFor(s) {
    return Array.from(s.rooms).find(r => r !== s.id) || null;
  }

  function _getHostEntry(s) {
    const gameCode = _gameCodeFor(s);
    if (!gameCode) return null;
    const entry = gameStore.get(gameCode);
    if (!entry || entry.hostSocketId !== s.id) return null;
    return entry;
  }
}

module.exports = { registerGameHandlers };
