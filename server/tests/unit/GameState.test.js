const GameState = require('../../src/game/GameState');

const makeBoard = () => ({
  name: 'Test Board',
  categories: Array.from({ length: 6 }, (_, ci) => ({
    name: `CAT${ci}`,
    clues: [200, 400, 600, 800, 1000].map((value, qi) => ({
      question: `Q${ci}-${qi}`,
      answer: `A${ci}-${qi}`,
      value,
    })),
  })),
});

describe('GameState — lobby', () => {
  test('addPlayer registers a player', () => {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    expect(gs.players).toHaveLength(1);
    expect(gs.players[0].name).toBe('Alice');
    expect(gs.players[0].score).toBe(0);
  });

  test('addPlayer throws on duplicate name', () => {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    expect(() => gs.addPlayer('Alice')).toThrow('Name taken');
  });

  test('startGame sets phase to board and assigns first picker', () => {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.startGame();
    expect(gs.phase).toBe('board');
    expect(gs.currentPicker).toBe('Alice');
  });

  test('startGame throws with fewer than 2 players', () => {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    expect(() => gs.startGame()).toThrow('at least 2');
  });
});

describe('GameState — board → clue', () => {
  function startedGame() {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.startGame();
    return gs;
  }

  test('selectClue moves to clue phase with buzzers locked', () => {
    const gs = startedGame();
    gs.selectClue(0, 0);
    expect(gs.phase).toBe('clue');
    expect(gs.buzzerState).toBe('locked');
    expect(gs.currentClue).toEqual({ categoryIndex: 0, clueIndex: 0 });
  });

  test('selectClue throws on already-revealed clue', () => {
    const gs = startedGame();
    gs.selectClue(0, 0);
    gs.unlock();
    gs.buzz('Alice');
    gs.judge('correct');
    expect(() => gs.selectClue(0, 0)).toThrow('already revealed');
  });
});

describe('GameState — buzzer flow', () => {
  function clueGame() {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.startGame();
    gs.selectClue(0, 0);
    return gs;
  }

  test('unlock opens buzzers', () => {
    const gs = clueGame();
    gs.unlock();
    expect(gs.buzzerState).toBe('open');
  });

  test('first buzz wins, moves to judging', () => {
    const gs = clueGame();
    gs.unlock();
    const won = gs.buzz('Alice');
    expect(won).toBe(true);
    expect(gs.phase).toBe('judging');
    expect(gs.buzzedBy).toBe('Alice');
    expect(gs.buzzerState).toBe('claimed');
  });

  test('second buzz is ignored when claimed', () => {
    const gs = clueGame();
    gs.unlock();
    gs.buzz('Alice');
    const won = gs.buzz('Bob');
    expect(won).toBe(false);
    expect(gs.buzzedBy).toBe('Alice');
  });

  test('buzz is ignored when buzzers are locked', () => {
    const gs = clueGame();
    const won = gs.buzz('Alice');
    expect(won).toBe(false);
  });
});

describe('GameState — judging', () => {
  function judgingGame() {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.startGame();
    gs.selectClue(0, 2); // $600 clue
    gs.unlock();
    gs.buzz('Alice');
    return gs;
  }

  test('correct: adds score, appends history, sets picker, returns to board', () => {
    const gs = judgingGame();
    gs.judge('correct');
    expect(gs.phase).toBe('board');
    expect(gs.players[0].score).toBe(600);
    expect(gs.players[0].scoreHistory).toHaveLength(1);
    expect(gs.players[0].scoreHistory[0]).toMatchObject({
      categoryIndex: 0, clueIndex: 2, clueValue: 600, result: 'correct', delta: 600,
    });
    expect(gs.currentPicker).toBe('Alice');
    expect(gs.revealedClues).toContainEqual({ categoryIndex: 0, clueIndex: 2 });
  });

  test('incorrect: subtracts score, re-opens buzzers, excludes buzzer', () => {
    const gs = judgingGame();
    gs.judge('incorrect');
    expect(gs.phase).toBe('clue');
    expect(gs.buzzerState).toBe('open');
    expect(gs.players[0].score).toBe(-600);
    expect(gs.buzzedPlayers).toContain('Alice');
    expect(gs.buzzedBy).toBeNull();
  });

  test('excluded player cannot buzz again on same clue', () => {
    const gs = judgingGame();
    gs.judge('incorrect');
    const won = gs.buzz('Alice');
    expect(won).toBe(false);
  });

  test('all-incorrect auto-skips clue and returns to board', () => {
    const gs = judgingGame();
    gs.judge('incorrect');
    gs.buzz('Bob');
    gs.judge('incorrect');
    expect(gs.phase).toBe('board');
    expect(gs.revealedClues).toContainEqual({ categoryIndex: 0, clueIndex: 2 });
    expect(gs.currentPicker).toBe('Alice'); // unchanged on all-incorrect
  });
});

describe('GameState — skip', () => {
  test('skipClue marks revealed and returns to board, picker unchanged', () => {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.startGame();
    gs.selectClue(1, 1);
    gs.skipClue();
    expect(gs.phase).toBe('board');
    expect(gs.revealedClues).toContainEqual({ categoryIndex: 1, clueIndex: 1 });
    expect(gs.currentPicker).toBe('Alice');
  });
});

describe('GameState — finished', () => {
  test('auto-finishes when all 30 clues revealed', () => {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.startGame();
    // Reveal 29 clues manually
    for (let ci = 0; ci < 6; ci++) {
      for (let qi = 0; qi < 5; qi++) {
        if (ci === 5 && qi === 4) continue;
        gs.selectClue(ci, qi);
        gs.unlock();
        gs.buzz('Alice');
        gs.judge('correct');
      }
    }
    // Reveal last clue
    gs.selectClue(5, 4);
    gs.unlock();
    gs.buzz('Alice');
    gs.judge('correct');
    expect(gs.phase).toBe('finished');
  });
});

describe('GameState — getPublicState / getHostState', () => {
  test('getPublicState omits answers', () => {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.startGame();
    gs.selectClue(0, 0);
    const pub = gs.getPublicState();
    expect(pub.currentClue.answer).toBeUndefined();
    expect(pub.currentClue.question).toBe('Q0-0');
  });

  test('getHostState includes answer', () => {
    const gs = new GameState(makeBoard());
    gs.addPlayer('Alice');
    gs.addPlayer('Bob');
    gs.startGame();
    gs.selectClue(0, 0);
    const host = gs.getHostState();
    expect(host.currentClue.answer).toBe('A0-0');
  });
});
