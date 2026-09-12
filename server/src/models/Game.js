const mongoose = require('mongoose');

const scoreHistorySchema = new mongoose.Schema({
  categoryIndex: Number,
  clueIndex: Number,
  clueValue: Number,
  result: { type: String, enum: ['correct', 'incorrect'] },
  delta: Number,
  timestamp: { type: Date, default: Date.now },
});

const playerSchema = new mongoose.Schema({
  name: String,
  score: { type: Number, default: 0 },
  scoreHistory: [scoreHistorySchema],
});

const revealedClueSchema = new mongoose.Schema({
  categoryIndex: Number,
  clueIndex: Number,
});

const gameSchema = new mongoose.Schema({
  boardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
  gameCode: { type: String, required: true, unique: true },
  status: { type: String, enum: ['lobby', 'active', 'finished'], default: 'lobby' },
  players: [playerSchema],
  revealedClues: [revealedClueSchema],
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
});

module.exports = mongoose.model('Game', gameSchema);
