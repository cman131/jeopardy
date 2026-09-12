const mongoose = require('mongoose');

const clueSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  value: { type: Number, enum: [200, 400, 600, 800, 1000], required: true },
});

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  clues: { type: [clueSchema], validate: v => v.length === 5 },
});

const boardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  categories: { type: [categorySchema], validate: v => v.length === 6 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Board', boardSchema);
