const express = require('express');
const Board = require('../models/Board');
const Game = require('../models/Game');
const gameStore = require('../game/gameStore');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { boardId } = req.body;
    const board = await Board.findById(boardId);
    if (!board) return res.status(400).json({ error: 'Board not found' });

    const gameCode = gameStore.create(board.toObject());
    const game = await Game.create({ boardId, gameCode });
    res.status(201).json({ gameCode, gameId: game._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const game = await Game.findById(req.params.id).populate('boardId', 'name categories');
    if (!game || game.status !== 'finished') return res.status(404).json({ error: 'Not found' });
    res.json(game);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:gameCode', async (req, res) => {
  try {
    const game = await Game.findOne({ gameCode: req.params.gameCode });
    if (!game) return res.status(404).json({ error: 'Not found' });
    res.json(game);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
