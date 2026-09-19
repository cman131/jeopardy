import { describe, it, expect } from 'vitest';
import { validateBoardJson, parseBuzzingaCsv } from './boardImportUtils.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeValidBoard() {
  const clue = { question: 'Q', answer: 'A' };
  const category = { name: 'CAT', clues: Array(5).fill(clue) };
  const round = { categories: Array(6).fill(category) };
  return {
    round1: round,
    round2: round,
    finalJeopardy: { category: 'CAT', clue: 'Q', answer: 'A' },
  };
}

const CSV_HEADER =
  'round,col,cat,catDescription,row,customValue,clueText,correctResponse,' +
  'isDailyDouble,clueType,topCaption,bottomCaption,answerType,answerTopCaption,' +
  'answerBottomCaption,buzzerActivationMode,isAudioOnly,isAnswerAudioOnly';

// Full 2-round + final CSV where all clues are TEXT, except the first clue
// (round=1, col=1, row=1) which can be replaced by `overrideRow`.
function buildCsv(overrideRow = null) {
  const rows = [CSV_HEADER];
  for (let round = 1; round <= 2; round++) {
    for (let col = 1; col <= 6; col++) {
      for (let row = 1; row <= 5; row++) {
        if (overrideRow && round === 1 && col === 1 && row === 1) {
          rows.push(overrideRow);
        } else {
          rows.push(
            `${round},${col},Cat${col},,${row},,Q${round}${col}${row},A${round}${col}${row},FALSE,TEXT,,,TEXT,,,none,FALSE,FALSE`,
          );
        }
      }
    }
  }
  rows.push(
    'final,,FinalCat,,,,"Final clue","Final answer",FALSE,TEXT,,,TEXT,,,none,FALSE,FALSE',
  );
  return rows.join('\n');
}

// ─── validateBoardJson ───────────────────────────────────────────────────────

describe('validateBoardJson', () => {
  it('returns true for a valid board', () => {
    expect(validateBoardJson(makeValidBoard())).toBe(true);
  });

  it('returns false for null', () => {
    expect(validateBoardJson(null)).toBe(false);
  });

  it('returns false for old single-round format', () => {
    expect(validateBoardJson({ categories: [] })).toBe(false);
  });

  it('returns false when round1 is missing', () => {
    const b = makeValidBoard();
    delete b.round1;
    expect(validateBoardJson(b)).toBe(false);
  });

  it('returns false when finalJeopardy is missing', () => {
    const b = makeValidBoard();
    delete b.finalJeopardy;
    expect(validateBoardJson(b)).toBe(false);
  });

  it('returns false when a round has fewer than 6 categories', () => {
    const b = makeValidBoard();
    b.round1.categories = b.round1.categories.slice(0, 5);
    expect(validateBoardJson(b)).toBe(false);
  });
});

// ─── parseBuzzingaCsv ────────────────────────────────────────────────────────

describe('parseBuzzingaCsv', () => {
  it('produces a board with 6 categories and 5 clues per round', () => {
    const { board } = parseBuzzingaCsv(buildCsv());
    expect(board.round1.categories).toHaveLength(6);
    expect(board.round2.categories).toHaveLength(6);
    expect(board.round1.categories[0].clues).toHaveLength(5);
  });

  it('maps TEXT clue to regular type with no media fields', () => {
    const { board, warnings } = parseBuzzingaCsv(buildCsv());
    const clue = board.round1.categories[0].clues[0];
    expect(clue.type).toBe('regular');
    expect(clue.question).toBe('Q111');
    expect(clue.answer).toBe('A111');
    expect(clue.mediaHash).toBe('');
    expect(clue.mediaUrl).toBe('');
    expect(warnings).toBe(0);
  });

  it('maps IMAGE clue to image type with mediaUrl resolved from hash', () => {
    const row =
      '1,1,Cat1,,1,,abc123hash,The answer,FALSE,IMAGE,Name the movie,,,TEXT,,,none,FALSE,FALSE';
    const { board, warnings } = parseBuzzingaCsv(buildCsv(row));
    const clue = board.round1.categories[0].clues[0];
    expect(clue.type).toBe('image');
    expect(clue.question).toBe('Name the movie');
    expect(clue.mediaUrl).toBe('https://buzzinga.s3.us-east-2.amazonaws.com/abc123hash');
    expect(clue.mediaHash).toBe('');
    expect(warnings).toBe(0);
  });

  it('maps VIDEO clue to video type with mediaUrl and no mediaHash', () => {
    const row =
      '1,1,Cat1,,1,,https://youtube.com/watch?v=abc,Squid Game,FALSE,VIDEO,Name the show,,,TEXT,,,none,FALSE,FALSE';
    const { board, warnings } = parseBuzzingaCsv(buildCsv(row));
    const clue = board.round1.categories[0].clues[0];
    expect(clue.type).toBe('video');
    expect(clue.question).toBe('Name the show');
    expect(clue.mediaUrl).toBe('https://youtube.com/watch?v=abc');
    expect(clue.mediaHash).toBe('');
    expect(warnings).toBe(0);
  });

  it('maps AUDIO clue to audio type with mediaUrl resolved from hash', () => {
    const row =
      '1,1,Cat1,,1,,def456hash,Song name,FALSE,AUDIO,Name the song,,,TEXT,,,none,FALSE,FALSE';
    const { board, warnings } = parseBuzzingaCsv(buildCsv(row));
    const clue = board.round1.categories[0].clues[0];
    expect(clue.type).toBe('audio');
    expect(clue.question).toBe('Name the song');
    expect(clue.mediaUrl).toBe('https://buzzinga.s3.us-east-2.amazonaws.com/def456hash');
    expect(clue.mediaHash).toBe('');
    expect(warnings).toBe(0);
  });

  it('maps the final jeopardy row correctly', () => {
    const { board } = parseBuzzingaCsv(buildCsv());
    expect(board.finalJeopardy.category).toBe('FinalCat');
    expect(board.finalJeopardy.clue).toBe('Final clue');
    expect(board.finalJeopardy.answer).toBe('Final answer');
    expect(board.finalJeopardy.type).toBe('regular');
  });

  it('uses category name from the rows of each column', () => {
    const { board } = parseBuzzingaCsv(buildCsv());
    expect(board.round1.categories[0].name).toBe('Cat1');
    expect(board.round1.categories[5].name).toBe('Cat6');
  });

  it('skips blank separator rows without errors', () => {
    const csv = buildCsv() + '\n,,,,,,,,,,,,,,,,,';
    expect(() => parseBuzzingaCsv(csv)).not.toThrow();
    const { board } = parseBuzzingaCsv(csv);
    expect(board.round1.categories).toHaveLength(6);
  });
});
