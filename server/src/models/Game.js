const mongoose = require('mongoose');

const scoreHistorySchema = new mongoose.Schema({
  isFinal: { type: Boolean, default: false },
  categoryIndex: { type: Number },
  clueIndex: { type: Number },
  clueValue: { type: Number, required: true },
  result: { type: String, enum: ['correct', 'incorrect'], required: true },
  delta: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const playerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  score: { type: Number, default: 0 },
  scoreHistory: [scoreHistorySchema],
});

const revealedClueSchema = new mongoose.Schema({
  round: { type: Number, enum: [1, 2], required: true },
  categoryIndex: { type: Number, required: true },
  clueIndex: { type: Number, required: true },
}, { _id: false });

const finalJeopardyEntrySchema = new mongoose.Schema({
  playerName: { type: String, required: true },
  wager: { type: Number },
  answer: { type: String },
  correct: { type: Boolean },
}, { _id: false });

const gameSchema = new mongoose.Schema({
  boardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
  gameCode: { type: String, required: true, unique: true },
  status: { type: String, enum: ['lobby', 'active', 'finished'], default: 'lobby' },
  players: [playerSchema],
  revealedClues: [revealedClueSchema],
  finalJeopardy: { type: [finalJeopardyEntrySchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
});

module.exports = mongoose.model('Game', gameSchema);
