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
    try {
      await Game.updateOne({ gameCode }, { $push: { players: { name, score: 0, scoreHistory: [] } } });
    } catch (err) {
      // Roll back in-memory state if DB write fails
      entry.state.players = entry.state.players.filter(p => p.name !== name);
      entry.playerSockets.delete(name);
      return socket.emit('error:generic', { message: 'Failed to join game' });
    }
    io.to(gameCode).emit('game:playerJoined', { players: entry.state.players.map(p => ({ name: p.name, score: p.score })) });
    socket.emit('player:joined', { name, gameCode });
  });

  socket.on('player:rejoin', ({ gameCode, name }) => {
    const entry = gameStore.get(gameCode);
    if (!entry) return socket.emit('error:gameNotFound');
    const player = entry.state.players.find(p => p.name === name);
    if (!player) return socket.emit('error:notInGame');
    entry.playerSockets.set(name, socket.id);
    socket.join(gameCode);
    const pub = entry.state.getPublicState();
    const fjPhases = ['final-clue', 'final-judging', 'final-reveal'];
    socket.emit('player:rejoined', {
      ...pub,
      name,
      fjClue: fjPhases.includes(pub.phase) ? (entry.state.board.finalJeopardy?.clue || null) : null,
      fjType: fjPhases.includes(pub.phase) ? (entry.state.board.finalJeopardy?.type || 'regular') : null,
      fjMediaUrl: fjPhases.includes(pub.phase) ? (entry.state.board.finalJeopardy?.mediaUrl || null) : null,
    });
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
      currentRound: 1,
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
    // Capture buzzedBy before judge() clears it
    const judgedPlayer = entry.state.buzzedBy;
    try { entry.state.judge(result); } catch (err) {
      return socket.emit('error:generic', { message: err.message });
    }
    const pub = entry.state.getPublicState();

    // Only persist the judged player's updated score + new history entry
    if (judgedPlayer) {
      const player = entry.state.players.find(p => p.name === judgedPlayer);
      if (player) {
        const lastEntry = player.scoreHistory[player.scoreHistory.length - 1];
        if (lastEntry) {
          await Game.updateOne(
            { gameCode, 'players.name': judgedPlayer },
            { $set: { 'players.$.score': player.score }, $push: { 'players.$.scoreHistory': lastEntry } }
          );
        }
      }
    }
    await Game.updateOne({ gameCode }, { $set: { revealedClues: pub.revealedClues } });

    const phase = entry.state.phase;
    if (phase === 'clue') {
      // Wrong answer — clue continues; go back to awaiting buzzers
      const state = entry.state.getPublicState();
      io.to(gameCode).emit('game:wrongAnswer', {
        players: state.players,
        judgedPlayer,
        buzzedPlayers: entry.state.buzzedPlayers,
      });
    } else if (phase === 'between-rounds') {
      io.to(gameCode).emit('game:betweenRounds', { players: entry.state.getPublicState().players });
    } else if (phase === 'final-wager') {
      io.to(gameCode).emit('game:finalWager', { category: entry.state.board.finalJeopardy.category });
    } else if (phase === 'finished') {
      await Game.updateOne({ gameCode }, { $set: { status: 'finished', completedAt: new Date() } });
      io.to(gameCode).emit('game:finished', { players: entry.state.getPublicState().players });
    } else {
      const state = entry.state.getPublicState();
      io.to(gameCode).emit('game:scored', {
        players: state.players,
        currentPicker: state.currentPicker,
        currentRound: state.currentRound,
        revealedClues: state.revealedClues.filter(r => r.round === entry.state.currentRound),
      });
    }
  });

  socket.on('host:skipClue', async () => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    const gameCode = _gameCodeFor(socket);
    try { entry.state.skipClue(); } catch { return; }
    const pub = entry.state.getPublicState();
    await Game.updateOne({ gameCode }, { $set: { revealedClues: pub.revealedClues } });

    const phase = entry.state.phase;
    if (phase === 'between-rounds') {
      io.to(gameCode).emit('game:betweenRounds', { players: entry.state.getPublicState().players });
    } else if (phase === 'final-wager') {
      io.to(gameCode).emit('game:finalWager', { category: entry.state.board.finalJeopardy.category });
    } else if (phase === 'finished') {
      await Game.updateOne({ gameCode }, { $set: { status: 'finished', completedAt: new Date() } });
      io.to(gameCode).emit('game:finished', { players: entry.state.getPublicState().players });
    } else {
      const state = entry.state.getPublicState();
      io.to(gameCode).emit('game:scored', {
        players: state.players,
        currentPicker: state.currentPicker,
        currentRound: state.currentRound,
        revealedClues: state.revealedClues.filter(r => r.round === entry.state.currentRound),
      });
    }
  });

  socket.on('host:startRound2', () => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    const gameCode = _gameCodeFor(socket);
    const gs = entry.state;
    try {
      gs.startRound2();
      const state = gs.getPublicState();
      io.to(gameCode).emit('game:round2Started', {
        currentRound: 2,
        categoryNames: state.categoryNames,
        currentPicker: state.currentPicker,
        players: state.players,
      });
    } catch (e) {
      socket.emit('error:generic', { message: e.message });
    }
  });

  socket.on('player:submitWager', ({ wager }) => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    if (!rooms.length) return;
    const gameCode = rooms[0];
    const entry = gameStore.get(gameCode);
    if (!entry) return;
    const playerName = [...entry.playerSockets.entries()].find(([, sid]) => sid === socket.id)?.[0];
    if (!playerName) return;
    const gs = entry.state;
    try {
      gs.submitWager(playerName, wager);
      io.to(gameCode).emit('game:wagerSubmitted', { playerName });
      if (gs.phase === 'final-clue') {
        io.to(gameCode).emit('game:finalClue', {
          category: gs.board.finalJeopardy.category,
          clue: gs.board.finalJeopardy.clue,
          type: gs.board.finalJeopardy.type || 'regular',
          mediaUrl: gs.board.finalJeopardy.mediaUrl || null,
        });
      }
    } catch (e) {
      socket.emit('error:generic', { message: e.message });
    }
  });

  socket.on('host:closeWagers', () => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    const gameCode = _gameCodeFor(socket);
    const gs = entry.state;
    try {
      gs.closeWagers();
      io.to(gameCode).emit('game:finalClue', {
        category: gs.board.finalJeopardy.category,
        clue: gs.board.finalJeopardy.clue,
        type: gs.board.finalJeopardy.type || 'regular',
        mediaUrl: gs.board.finalJeopardy.mediaUrl || null,
      });
    } catch (e) {
      socket.emit('error:generic', { message: e.message });
    }
  });

  socket.on('player:submitAnswer', ({ answer }) => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    if (!rooms.length) return;
    const gameCode = rooms[0];
    const entry = gameStore.get(gameCode);
    if (!entry) return;
    const playerName = [...entry.playerSockets.entries()].find(([, sid]) => sid === socket.id)?.[0];
    if (!playerName) return;
    const gs = entry.state;
    try {
      gs.submitAnswer(playerName, answer);
      io.to(gameCode).emit('game:answerSubmitted', { playerName });
      if (gs.phase === 'final-judging') {
        const answers = [...gs.finalAnswers.entries()].map(([name, ans]) => ({ playerName: name, answer: ans }));
        io.to(entry.hostSocketId).emit('game:finalJudgingReady', {
          answers,
          fjAnswerImage: gs.board.finalJeopardy.answerImage || null,
        });
        io.to(gameCode).emit('game:finalJudging');
      }
    } catch (e) {
      socket.emit('error:generic', { message: e.message });
    }
  });

  socket.on('host:closeAnswers', () => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    const gameCode = _gameCodeFor(socket);
    const gs = entry.state;
    try {
      gs.closeAnswers();
      const answers = [...gs.finalAnswers.entries()].map(([name, ans]) => ({ playerName: name, answer: ans }));
      io.to(entry.hostSocketId).emit('game:finalJudgingReady', {
        answers,
        fjAnswerImage: gs.board.finalJeopardy.answerImage || null,
      });
      io.to(gameCode).emit('game:finalJudging');
    } catch (e) {
      socket.emit('error:generic', { message: e.message });
    }
  });

  socket.on('host:judgeFinal', ({ playerName: targetName, correct }) => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    const gameCode = _gameCodeFor(socket);
    const gs = entry.state;
    try {
      gs.judgeFinal(targetName, correct);
      if (gs.phase === 'final-reveal') {
        io.to(gameCode).emit('game:revealReady', { players: gs.getPublicState().players });
      }
    } catch (e) {
      socket.emit('error:generic', { message: e.message });
    }
  });

  socket.on('host:revealNext', () => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    const gameCode = _gameCodeFor(socket);
    const gs = entry.state;
    try {
      const result = gs.revealNext();
      io.to(gameCode).emit('game:finalReveal', {
        ...result,
        players: gs.getPublicState().players,
      });
      if (gs.phase === 'finished') {
        io.to(gameCode).emit('game:finished', { players: gs.getPublicState().players });
      }
    } catch (e) {
      socket.emit('error:generic', { message: e.message });
    }
  });

  socket.on('host:endGame', async () => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    const gameCode = _gameCodeFor(socket);
    entry.state.endGame();
    await Game.updateOne({ gameCode }, { $set: { status: 'finished', completedAt: new Date() } });
    io.to(gameCode).emit('game:finished', { players: entry.state.players });
  });

  socket.on('host:revealAnswer', () => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    if (entry.state.phase !== 'judging') return;
    const gameCode = _gameCodeFor(socket);
    const { categoryIndex, clueIndex } = entry.state.currentClue;
    const clue = entry.state.board[`round${entry.state.currentRound}`].categories[categoryIndex].clues[clueIndex];
    io.to(gameCode).emit('game:answerRevealed', {
      answer: clue.answer,
      answerImage: clue.answerImage || null,
    });
  });

  socket.on('host:playVideo', () => {
    const entry = _getHostEntry(socket);
    if (!entry) return;
    const gameCode = _gameCodeFor(socket);
    io.to(gameCode).emit('game:videoPlay');
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
