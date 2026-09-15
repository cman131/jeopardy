import Papa from 'papaparse';

const CLUE_TYPE_MAP = {
  TEXT: 'regular',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
};

function emptyClue() {
  return { question: '', answer: '', type: 'regular', mediaUrl: '', answerImage: '', mediaHash: '' };
}

function mapClueRow(row) {
  const buzzingaType = (row.clueType || 'TEXT').trim().toUpperCase();
  const ourType = CLUE_TYPE_MAP[buzzingaType] || 'regular';
  const clue = {
    question: '',
    answer: (row.correctResponse || '').trim(),
    type: ourType,
    mediaUrl: '',
    answerImage: '',
    mediaHash: '',
  };

  if (ourType === 'regular') {
    clue.question = (row.clueText || '').trim();
  } else if (ourType === 'video') {
    clue.question = (row.topCaption || '').trim();
    clue.mediaUrl = (row.clueText || '').trim();
  } else {
    // image or audio — clueText is a Buzzinga content hash
    clue.question = (row.topCaption || '').trim();
    clue.mediaHash = (row.clueText || '').trim();
  }

  return clue;
}

export function parseBuzzingaCsv(csvText) {
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  const rounds = { 1: {}, 2: {} };
  let finalJeopardy = null;
  let warnings = 0;

  for (const row of data) {
    const roundVal = String(row.round || '').trim().toLowerCase();
    if (!roundVal) continue;

    if (roundVal === 'final') {
      const buzzingaType = (row.clueType || 'TEXT').trim().toUpperCase();
      const ourType = CLUE_TYPE_MAP[buzzingaType] || 'regular';
      finalJeopardy = {
        category: (row.cat || '').trim(),
        clue: ourType === 'regular' ? (row.clueText || '').trim() : (row.topCaption || '').trim(),
        answer: (row.correctResponse || '').trim(),
        type: ourType,
        mediaUrl: ourType === 'video' ? (row.clueText || '').trim() : '',
        mediaHash:
          ourType === 'image' || ourType === 'audio' ? (row.clueText || '').trim() : '',
        answerImage: '',
      };
      if (finalJeopardy.mediaHash) warnings++;
      continue;
    }

    const roundNum = parseInt(roundVal, 10);
    if (roundNum !== 1 && roundNum !== 2) continue;

    const col = parseInt(row.col, 10);
    const rowNum = parseInt(row.row, 10);
    if (isNaN(col) || isNaN(rowNum)) continue;

    if (!rounds[roundNum][col]) {
      rounds[roundNum][col] = { name: (row.cat || 'CATEGORY').trim(), clues: {} };
    }

    const clue = mapClueRow(row);
    if (clue.mediaHash) warnings++;
    rounds[roundNum][col].clues[rowNum] = clue;
  }

  function buildRound(roundData) {
    return {
      categories: Array.from({ length: 6 }, (_, i) => {
        const col = i + 1;
        const cat = roundData[col] || { name: 'CATEGORY', clues: {} };
        return {
          name: cat.name,
          clues: Array.from({ length: 5 }, (__, j) => cat.clues[j + 1] || emptyClue()),
        };
      }),
    };
  }

  return {
    board: {
      name: 'Imported Board',
      round1: buildRound(rounds[1]),
      round2: buildRound(rounds[2]),
      finalJeopardy: finalJeopardy || {
        category: '',
        clue: '',
        answer: '',
        type: 'regular',
        mediaUrl: '',
        mediaHash: '',
        answerImage: '',
      },
    },
    warnings,
  };
}

export function validateBoardJson(data) {
  if (!data || typeof data !== 'object') return false;
  const validRound = (r) =>
    r &&
    Array.isArray(r.categories) &&
    r.categories.length === 6 &&
    r.categories.every(
      (c) =>
        Array.isArray(c.clues) &&
        c.clues.length === 5 &&
        c.clues.every((cl) => 'question' in cl && 'answer' in cl),
    );
  const validFj = (fj) => fj && 'category' in fj && 'clue' in fj && 'answer' in fj;
  if ('categories' in data) return false;
  return !!(validRound(data.round1) && validRound(data.round2) && validFj(data.finalJeopardy));
}
