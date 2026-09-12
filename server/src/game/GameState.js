class GameState {
  constructor(board) {
    this.board = board;
    this.phase = 'lobby';
    this.players = [];
    this.revealedClues = [];
    this.currentClue = null;
    this.buzzerState = 'locked';
    this.buzzedBy = null;
    this.buzzedPlayers = [];
    this.currentPicker = null;
  }

  addPlayer(name) {
    if (this.phase !== 'lobby') throw new Error('Game already started');
    if (this.players.find(p => p.name === name)) throw new Error('Name taken');
    this.players.push({ name, score: 0, scoreHistory: [] });
  }

  startGame() {
    if (this.phase !== 'lobby') throw new Error('Invalid phase');
    if (this.players.length < 2) throw new Error('Need at least 2 players');
    this.phase = 'board';
    this.currentPicker = this.players[0].name;
  }

  selectClue(categoryIndex, clueIndex) {
    if (this.phase !== 'board') throw new Error('Invalid phase');
    if (!this.board.categories[categoryIndex]?.clues[clueIndex]) throw new Error('Invalid clue');
    if (this.revealedClues.some(r => r.categoryIndex === categoryIndex && r.clueIndex === clueIndex)) {
      throw new Error('Clue already revealed');
    }
    this.currentClue = { categoryIndex, clueIndex };
    this.buzzerState = 'locked';
    this.buzzedBy = null;
    this.buzzedPlayers = [];
    this.phase = 'clue';
  }

  unlock() {
    if (this.phase !== 'clue' || this.buzzerState !== 'locked') throw new Error('Invalid state');
    this.buzzerState = 'open';
  }

  buzz(playerName) {
    if (this.phase !== 'clue') return false;
    if (this.buzzerState !== 'open') return false;
    if (this.buzzedPlayers.includes(playerName)) return false;
    this.buzzerState = 'claimed';
    this.buzzedBy = playerName;
    this.phase = 'judging';
    return true;
  }

  judge(result) {
    if (this.phase !== 'judging') throw new Error('Invalid phase');
    const { categoryIndex, clueIndex } = this.currentClue;
    const clue = this.board.categories[categoryIndex].clues[clueIndex];
    const player = this.players.find(p => p.name === this.buzzedBy);
    const delta = result === 'correct' ? clue.value : -clue.value;

    player.score += delta;
    player.scoreHistory.push({ categoryIndex, clueIndex, clueValue: clue.value, result, delta, timestamp: new Date() });
    this.buzzedPlayers.push(this.buzzedBy);

    if (result === 'correct') {
      this.currentPicker = this.buzzedBy;
      this._closeClue();
    } else if (this.buzzedPlayers.length >= this.players.length) {
      this._closeClue(); // auto-skip: picker unchanged
    } else {
      this.buzzedBy = null;
      this.buzzerState = 'open';
      this.phase = 'clue';
    }
  }

  skipClue() {
    if (this.phase !== 'clue') throw new Error('Invalid phase');
    this._closeClue();
  }

  endGame() {
    this.phase = 'finished';
  }

  _closeClue() {
    this.revealedClues.push({ ...this.currentClue });
    this.currentClue = null;
    this.buzzedBy = null;
    this.buzzerState = 'locked';
    this.phase = this._allRevealed() ? 'finished' : 'board';
  }

  _allRevealed() {
    const total = this.board.categories.reduce((s, c) => s + c.clues.length, 0);
    return this.revealedClues.length >= total;
  }

  getPublicState() {
    return {
      phase: this.phase,
      players: this.players.map(p => ({ name: p.name, score: p.score })),
      revealedClues: this.revealedClues,
      buzzerState: this.buzzerState,
      buzzedBy: this.buzzedBy,
      currentPicker: this.currentPicker,
      categoryNames: this.board.categories.map(c => c.name),
      currentClue: this.currentClue ? {
        categoryIndex: this.currentClue.categoryIndex,
        clueIndex: this.currentClue.clueIndex,
        question: this.board.categories[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex].question,
        value: this.board.categories[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex].value,
      } : null,
    };
  }

  getHostState() {
    const state = this.getPublicState();
    if (state.currentClue && this.currentClue) {
      state.currentClue.answer =
        this.board.categories[this.currentClue.categoryIndex].clues[this.currentClue.clueIndex].answer;
    }
    return state;
  }
}

module.exports = GameState;
