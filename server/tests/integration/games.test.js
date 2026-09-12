const request = require('supertest');
const express = require('express');
const boardsRouter = require('../../src/routes/boards');
const gamesRouter = require('../../src/routes/games');
const { startDb, stopDb, clearDb, makeTestBoard } = require('../helpers');

let app, boardId;
beforeAll(async () => {
  await startDb();
  app = express();
  app.use(express.json());
  app.use('/api/boards', boardsRouter);
  app.use('/api/games', gamesRouter);
});
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  const res = await request(app).post('/api/boards').send(makeTestBoard());
  boardId = res.body._id;
});

describe('POST /api/games', () => {
  test('creates a game and returns gameCode and gameId', async () => {
    const res = await request(app).post('/api/games').send({ boardId });
    expect(res.status).toBe(201);
    expect(res.body.gameCode).toMatch(/^[A-Z]{4}$/);
    expect(res.body.gameId).toBeDefined();
  });

  test('returns 400 for unknown boardId', async () => {
    const res = await request(app).post('/api/games').send({ boardId: '000000000000000000000000' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/games/:gameCode', () => {
  test('returns game by gameCode', async () => {
    const created = await request(app).post('/api/games').send({ boardId });
    const res = await request(app).get(`/api/games/${created.body.gameCode}`);
    expect(res.status).toBe(200);
    expect(res.body.gameCode).toBe(created.body.gameCode);
    expect(res.body.status).toBe('lobby');
    expect(res.body.boardId).toBe(boardId);
  });

  test('returns 404 for unknown code', async () => {
    const res = await request(app).get('/api/games/ZZZZ');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/games/:id/history', () => {
  test('returns 404 for non-finished game', async () => {
    const created = await request(app).post('/api/games').send({ boardId });
    const res = await request(app).get(`/api/games/${created.body.gameId}/history`);
    expect(res.status).toBe(404);
  });
});
