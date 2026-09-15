const request = require('supertest');
const express = require('express');
const boardsRouter = require('../../src/routes/boards');
const { startDb, stopDb, clearDb, makeTestBoard, makeMediaClue } = require('../helpers');

let app;
beforeAll(async () => {
  await startDb();
  app = express();
  app.use(express.json());
  app.use('/api/boards', boardsRouter);
});
afterAll(stopDb);
afterEach(clearDb);

describe('POST /api/boards', () => {
  test('creates a board and returns it', async () => {
    const res = await request(app).post('/api/boards').send(makeTestBoard());
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Board');
    expect(res.body._id).toBeDefined();
  });

  test('rejects board with missing name', async () => {
    const board = makeTestBoard();
    delete board.name;
    const res = await request(app).post('/api/boards').send(board);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/boards', () => {
  test('returns all boards', async () => {
    await request(app).post('/api/boards').send(makeTestBoard({ name: 'A' }));
    await request(app).post('/api/boards').send(makeTestBoard({ name: 'B' }));
    const res = await request(app).get('/api/boards');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('GET /api/boards/:id', () => {
  test('returns board by id', async () => {
    const created = await request(app).post('/api/boards').send(makeTestBoard());
    const res = await request(app).get(`/api/boards/${created.body._id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test Board');
  });

  test('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/boards/000000000000000000000000');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/boards/:id', () => {
  test('updates board name', async () => {
    const created = await request(app).post('/api/boards').send(makeTestBoard());
    const res = await request(app).put(`/api/boards/${created.body._id}`).send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated');
  });

  test('returns 404 for unknown id', async () => {
    const res = await request(app).put('/api/boards/000000000000000000000000').send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/boards/:id', () => {
  test('deletes a board', async () => {
    const created = await request(app).post('/api/boards').send(makeTestBoard());
    const del = await request(app).delete(`/api/boards/${created.body._id}`);
    expect(del.status).toBe(204);
    const get = await request(app).get(`/api/boards/${created.body._id}`);
    expect(get.status).toBe(404);
  });

  test('returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/boards/000000000000000000000000');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/boards — media clues without text', () => {
  function boardWithMediaClue(type) {
    const board = makeTestBoard();
    board.round1.categories[0].clues[0] = makeMediaClue(type, 'https://example.com/media', 'The answer');
    return board;
  }

  test('accepts image clue with empty question', async () => {
    const res = await request(app).post('/api/boards').send(boardWithMediaClue('image'));
    expect(res.status).toBe(201);
  });

  test('accepts audio clue with empty question', async () => {
    const res = await request(app).post('/api/boards').send(boardWithMediaClue('audio'));
    expect(res.status).toBe(201);
  });

  test('accepts video clue with empty question', async () => {
    const res = await request(app).post('/api/boards').send(boardWithMediaClue('video'));
    expect(res.status).toBe(201);
  });

  test('accepts final jeopardy image clue with empty clue text', async () => {
    const board = makeTestBoard();
    board.finalJeopardy = { category: 'FJ-CAT', clue: '', answer: 'FJ-ANSWER', type: 'image', mediaUrl: 'https://example.com/img.jpg' };
    const res = await request(app).post('/api/boards').send(board);
    expect(res.status).toBe(201);
  });
});
