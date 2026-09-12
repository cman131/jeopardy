const mongoose = require('mongoose');

const clueSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  value: { type: Number, enum: [200, 400, 600, 800, 1000], required: true },
});

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  clues: { type: [clueSchema], validate: { validator: v => v.length === 5, message: 'Each category must have exactly 5 clues' } },
});

const boardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  categories: { type: [categorySchema], validate: { validator: v => v.length === 6, message: 'Board must have exactly 6 categories' } },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Board', boardSchema);
