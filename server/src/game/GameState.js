function clueValue(round, clueIndex) {
  return (clueIndex + 1) * (round === 1 ? 200 : 400);
}

class GameState {
  constructor(board) {
    this.board = board;
    this.phase = 'lobby';
    this.currentRound = 1;
    this.players = [];
    this.revealedClues = [];
    this.currentClue = null;
    this.buzzerState = 'locked';
    this.buzzedBy = null;
    this.buzzedPlayers = [];
    this.currentPicker = null;
    this.finalWagers = new Map();
    this.finalAnswers = new Map();
    this.finalJudgments = new Map();
    this.finalRevealOrder = [];
    this.finalRevealIndex = 0;
  }

  _currentCategories() {
    return this.board[`round${this.currentRound}`].categories;
  }

  addPlayer(name) {
    if (this.phase !== 'lobby') throw new Error('Game already started');
    if (this.players.find(p => p.name === name)) throw new Error('Name taken');
    this.players.push({ name, score: 0, scoreHistory: [] });
  }

  start() {
    if (this.phase !== 'lobby') throw new Error('Invalid phase');
    if (this.players.length < 2) throw new Error('Need at least 2 players');
    this.currentPicker = this.players[0].name;
    this.phase = 'board';
  }

  // Alias for backward compatibility with socket handlers
  startGame() {
    return this.start();
  }

  selectClue(categoryIndex, clueIndex) {
    if (this.phase !== 'board') throw new Error('Invalid phase');
    const cats = this._currentCategories();
    if (categoryIndex < 0 || categoryIndex >= cats.length) throw new Error('Invalid category');
    if (clueIndex < 0 || clueIndex >= cats[categoryIndex].clues.length) throw new Error('Invalid clue');
    const alreadyRevealed = this.revealedClues.some(
      r => r.round === this.currentRound && r.categoryIndex === categoryIndex && r.clueIndex === clueIndex
    );
    if (alreadyRevealed) throw new Error('Clue already revealed');
    this.currentClue = { categoryIndex, clueIndex };
    this.buzzedPlayers = [];
    this.buzzedBy = null;
    this.buzzerState = 'locked';
    this.phase = 'clue';
  }

  openBuzzers() {
    if (this.phase !== 'clue') throw new Error('Invalid phase');
    this.buzzerState = 'open';
  }

  // Alias for backward compatibility with socket handlers
  unlock() {
    if (this.phase !== 'clue' || this.buzzerState !== 'locked') throw new Error('Invalid state');
    return this.openBuzzers();
  }

  buzz(playerName) {
    if (!this.players.some(p => p.name === playerName)) return false;
    if (this.phase !== 'clue' || this.buzzerState !== 'open') return false;
    if (this.buzzedPlayers.includes(playerName)) return false;
    this.buzzedPlayers.push(playerName);
    this.buzzedBy = playerName;
    this.buzzerState = 'claimed';
    this.phase = 'judging';
    return true;
  }

  judge(result) {
    if (this.phase !== 'judging') throw new Error('Invalid phase');
    if (result !== 'correct' && result !== 'incorrect') throw new Error('Invalid result');
    const player = this.players.find(p => p.name === this.buzzedBy);
    const value = clueValue(this.currentRound, this.currentClue.clueIndex);
    const delta = result === 'correct' ? value : -value;
    player.score += delta;
    player.scoreHistory.push({
      categoryIndex: this.currentClue.categoryIndex,
      clueIndex: this.currentClue.clueIndex,
      clueValue: value,
      result,
      delta,
      timestamp: new Date(),
    });
    if (result === 'correct') {
      this.currentPicker = this.buzzedBy;
      this._closeClue();
    } else {
      this.buzzedBy = null;
      this.buzzerState = 'open';
      this.phase = 'clue';
      // Auto-skip if all players have buzzed incorrectly
      if (this.buzzedPlayers.length >= this.players.length) {
        this._closeClue();
      }
    }
  }

  skipClue() {
    if (this.phase !== 'clue') throw new Error('Invalid phase');
    this._closeClue();
  }

  startRound2() {
    if (this.phase !== 'between-rounds') throw new Error('Invalid phase');
    this.currentRound = 2;
    this.currentClue = null;
    this.buzzerState = 'locked';
    this.buzzedBy = null;
    this.buzzedPlayers = [];
    const sorted = [...this.players].sort((a, b) => b.score - a.score);
    this.currentPicker = sorted[0].name;
    this.phase = 'board';
  }

  submitWager(playerName, wager) {
    if (this.phase !== 'final-wager') throw new Error('Invalid phase');
    const player = this.players.find(p => p.name === playerName);
    if (!player) throw new Error('Player not found');
    if (this.finalWagers.has(playerName)) throw new Error('Wager already submitted');
    const maxWager = Math.max(player.score, 1000);
    if (typeof wager !== 'number' || wager < 0 || wager > maxWager) throw new Error('Invalid wager');
    this.finalWagers.set(playerName, wager);
    if (this.finalWagers.size >= this.players.length) this.phase = 'final-clue';
  }

  closeWagers() {
    if (this.phase !== 'final-wager') throw new Error('Invalid phase');
    for (const player of this.players) {
      if (!this.finalWagers.has(player.name)) this.finalWagers.set(player.name, 0);
    }
    this.phase = 'final-clue';
  }

  submitAnswer(playerName, answer) {
    if (this.phase !== 'final-clue') throw new Error('Invalid phase');
    if (!this.players.find(p => p.name === playerName)) throw new Error('Player not found');
    this.finalAnswers.set(playerName, answer);
    if (this.finalAnswers.size >= this.players.length) this.phase = 'final-judging';
  }

  closeAnswers() {
    if (this.phase !== 'final-clue') throw new Error('Invalid phase');
    for (const player of this.players) {
      if (!this.finalAnswers.has(player.name)) this.finalAnswers.set(player.name, '');
    }
    this.phase = 'final-judging';
  }

  judgeFinal(playerName, correct) {
    if (this.phase !== 'final-judging') throw new Error('Invalid phase');
    if (!this.players.find(p => p.name === playerName)) throw new Error('Player not found');
    if (this.finalJudgments.has(playerName)) throw new Error('Player already judged');
    this.finalJudgments.set(playerName, correct);
    if (this.finalJudgments.size >= this.players.length) {
      this.finalRevealOrder = [...this.players]
        .sort((a, b) => a.score - b.score)
        .map(p => p.name);
      this.finalRevealIndex = 0;
      this.phase = 'final-reveal';
    }
  }

  revealNext() {
    if (this.phase !== 'final-reveal') throw new Error('Invalid phase');
    const playerName = this.finalRevealOrder[this.finalRevealIndex];
    const player = this.players.find(p => p.name === playerName);
    const wager = this.finalWagers.get(playerName);
    const answer = this.finalAnswers.get(playerName);
    const correct = this.finalJudgments.get(playerName);
    const delta = correct ? wager : -wager;
    player.score += delta;
    player.scoreHistory.push({
      isFinal: true,
      clueValue: wager,
      result: correct ? 'correct' : 'incorrect',
      delta,
      timestamp: new Date(),
    });
    this.finalRevealIndex++;
    if (this.finalRevealIndex >= this.players.length) this.phase = 'finished';
    return { playerName, wager, answer, correct };
  }

  endGame() {
    if (this.currentClue) this._closeClue();
    this.phase = 'finished';
  }

  _closeClue() {
    this.revealedClues.push({ round: this.currentRound, ...this.currentClue });
    this.currentClue = null;
    this.buzzedBy = null;
    this.buzzerState = 'locked';
    this.buzzedPlayers = [];
    if (this._allRevealedInRound()) {
      this.phase = this.currentRound === 1 ? 'between-rounds' : 'final-wager';
    } else {
      this.phase = 'board';
    }
  }

  _allRevealedInRound() {
    return this.revealedClues.filter(r => r.round === this.currentRound).length >= 30;
  }

  getPublicState() {
    return {
      phase: this.phase,
      currentRound: this.currentRound,
      players: this.players.map(p => ({ name: p.name, score: p.score })),
      revealedClues: [...this.revealedClues],
      buzzerState: this.buzzerState,
      buzzedBy: this.buzzedBy,
      currentPicker: this.currentPicker,
      categoryNames: this._currentCategories().map(c => c.name),
      currentClue: this.currentClue ? {
        categoryIndex: this.currentClue.categoryIndex,
        clueIndex: this.currentClue.clueIndex,
        question: this._currentCategories()[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex].question,
        value: clueValue(this.currentRound, this.currentClue.clueIndex),
        type: this._currentCategories()[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex].type || 'regular',
        mediaUrl: this._currentCategories()[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex].mediaUrl || null,
      } : null,
      wagersSubmitted: [...this.finalWagers.keys()],
      answersSubmitted: [...this.finalAnswers.keys()],
      finalRevealIndex: this.finalRevealIndex,
      finalJeopardyCategory: this.board.finalJeopardy?.category,
    };
  }

  getHostState() {
    const state = this.getPublicState();
    if (this.currentClue) {
      const clue = this._currentCategories()[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex];
      state.currentClue.answer = clue.answer;
      state.currentClue.answerImage = clue.answerImage || null;
    }
    if (this.phase === 'final-judging') {
      state.finalAnswers = Object.fromEntries(this.finalAnswers);
      state.finalWagers = Object.fromEntries(this.finalWagers);
    }
    return state;
  }
}

module.exports = { GameState, clueValue };
