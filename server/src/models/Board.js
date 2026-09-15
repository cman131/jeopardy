const mongoose = require('mongoose');

const clueSchema = new mongoose.Schema({
  question: { type: String },
  answer: { type: String, required: true },
  type: { type: String, enum: ['regular', 'image', 'video', 'audio'], default: 'regular' },
  mediaUrl: { type: String },
  answerImage: { type: String },
  mediaHash: { type: String },
});

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  clues: {
    type: [clueSchema],
    validate: { validator: v => v.length === 5, message: '5 clues required per category' },
  },
});

const roundSchema = new mongoose.Schema({
  categories: {
    type: [categorySchema],
    validate: { validator: v => v.length === 6, message: '6 categories required per round' },
  },
}, { _id: false });

const finalJeopardySchema = new mongoose.Schema({
  category: { type: String, required: true },
  clue: { type: String },
  answer: { type: String, required: true },
  type: { type: String, enum: ['regular', 'image', 'video', 'audio'], default: 'regular' },
  mediaUrl: { type: String },
  answerImage: { type: String },
  mediaHash: { type: String },
}, { _id: false });

const boardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  round1: { type: roundSchema, required: true },
  round2: { type: roundSchema, required: true },
  finalJeopardy: { type: finalJeopardySchema, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Board', boardSchema);
