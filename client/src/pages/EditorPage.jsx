import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BoardEditorGrid from '../components/BoardEditorGrid';

const R1_VALUES = [200, 400, 600, 800, 1000];
const R2_VALUES = [400, 800, 1200, 1600, 2000];

function emptyRound() {
  return {
    categories: Array.from({ length: 6 }, () => ({
      name: 'CATEGORY',
      clues: Array.from({ length: 5 }, () => ({ question: '', answer: '' })),
    })),
  };
}

function emptyBoard() {
  return {
    name: 'New Board',
    round1: emptyRound(),
    round2: emptyRound(),
    finalJeopardy: { category: '', clue: '', answer: '' },
  };
}

function validateBoardJson(data) {
  if (!data || typeof data !== 'object') return false;
  const validRound = (r) =>
    r && Array.isArray(r.categories) && r.categories.length === 6 &&
    r.categories.every(c => Array.isArray(c.clues) && c.clues.length === 5 &&
      c.clues.every(cl => 'question' in cl && 'answer' in cl));
  const validFj = (fj) => fj && 'category' in fj && 'clue' in fj && 'answer' in fj;
  // Reject old single-round format
  if ('categories' in data) return false;
  return validRound(data.round1) && validRound(data.round2) && validFj(data.finalJeopardy);
}

function countFilled(board) {
  const countRound = (round) =>
    round.categories.reduce((sum, c) => sum + c.clues.filter(cl => cl.question && cl.answer).length, 0);
  const fj = board.finalJeopardy;
  return {
    r1: countRound(board.round1),
    r2: countRound(board.round2),
    fj: (fj.category && fj.clue && fj.answer) ? 1 : 0,
  };
}

export default function EditorPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [board, setBoard] = useState(emptyBoard());
  const [activeBoardId, setActiveBoardId] = useState(boardId || null);
  const [activeTab, setActiveTab] = useState('round1');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/boards')
      .then(r => { if (!r.ok) throw new Error('Failed to load boards'); return r.json(); })
      .then(setBoards)
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (activeBoardId) {
      fetch(`/api/boards/${activeBoardId}`)
        .then(r => { if (!r.ok) throw new Error('Failed to load board'); return r.json(); })
        .then(b => { setBoard(b); setDirty(false); })
        .catch(err => setError(err.message));
    }
  }, [activeBoardId]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const method = activeBoardId ? 'PUT' : 'POST';
      const url = activeBoardId ? `/api/boards/${activeBoardId}` : '/api/boards';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(board) });
      if (!res.ok) throw new Error('Save failed — check that all fields are filled');
      const saved = await res.json();
      const id = activeBoardId || saved._id;
      if (!activeBoardId) {
        setActiveBoardId(saved._id);
        navigate(`/editor/${saved._id}`, { replace: true });
      }
      const allBoards = await fetch('/api/boards').then(r => r.json());
      setBoards(allBoards);
      setDirty(false);
      return id;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function play() {
    try {
      const id = await save();
      const res = await fetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boardId: id }) });
      if (!res.ok) throw new Error('Failed to create game');
      const { gameCode } = await res.json();
      navigate(`/host/${gameCode}`);
    } catch (err) {
      setError(err.message);
    }
  }

  function confirmDiscard() {
    return !dirty || window.confirm('You have unsaved changes. Discard them?');
  }

  function selectBoard(id) {
    if (!confirmDiscard()) return;
    setActiveBoardId(id);
    setActiveTab('round1');
  }

  function newBoard() {
    if (!confirmDiscard()) return;
    setBoard(emptyBoard());
    setActiveBoardId(null);
    setActiveTab('round1');
    setDirty(false);
    navigate('/editor');
  }

  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!validateBoardJson(data)) {
            alert('Invalid board JSON. Must use multi-round format with round1, round2, and finalJeopardy sections. Old single-round boards are not supported.');
            return;
          }
          setBoard(data);
          setActiveBoardId(null);
          setActiveTab('round1');
          setDirty(true);
        } catch { alert('Invalid JSON file'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${board.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const { r1, r2, fj } = countFilled(board);
  const allFilled = r1 === 30 && r2 === 30 && fj === 1;

  const tabStyle = (tab) => ({
    padding: '8px 16px',
    background: activeTab === tab ? '#1d4ed8' : '#1e293b',
    color: activeTab === tab ? '#fff' : '#64748b',
    border: 'none',
    borderRadius: '6px 6px 0 0',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 'bold',
  });

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 200, background: '#0f172a', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 12px', borderBottom: '1px solid #1e293b', fontSize: 12, fontWeight: 'bold', color: '#e2e8f0', letterSpacing: 1 }}>MY BOARDS</div>
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          {boards.map(b => (
            <div key={b._id} onClick={() => selectBoard(b._id)}
              style={{ background: b._id === activeBoardId ? '#1d4ed8' : '#0f172a', borderRadius: 6, padding: '8px 10px', marginBottom: 4, cursor: 'pointer' }}>
              <div style={{ fontSize: 11, color: b._id === activeBoardId ? '#fff' : '#94a3b8' }}>{b.name}</div>
            </div>
          ))}
          <button onClick={newBoard}
            style={{ width: '100%', background: '#0f172a', border: '1px dashed #334155', color: '#64748b', borderRadius: 6, padding: 7, fontSize: 10, cursor: 'pointer', marginTop: 4 }}>
            + New Board
          </button>
        </div>
        <div style={{ padding: 8, borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={importJson} style={{ background: '#1e293b', border: 'none', color: '#94a3b8', borderRadius: 5, padding: 7, fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>⬆ Import JSON</button>
          <button onClick={exportJson} style={{ background: '#1e293b', border: 'none', color: '#94a3b8', borderRadius: 5, padding: 7, fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>⬇ Export JSON</button>
        </div>
      </div>

      {/* Main editor area */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {error && (
          <div style={{ background: '#450a0a', border: '1px solid #b91c1c', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#fca5a5' }}>
            {error}
          </div>
        )}
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <input
            value={board.name}
            onChange={e => { setBoard(b => ({ ...b, name: e.target.value })); setDirty(true); }}
            placeholder="Board name"
            maxLength={80}
            style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', fontSize: 15, color: '#fff' }}
          />
          <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
            R1: <span style={{ color: r1 === 30 ? '#4ade80' : '#94a3b8' }}>{r1}/30</span>
            {' · '}
            R2: <span style={{ color: r2 === 30 ? '#4ade80' : '#94a3b8' }}>{r2}/30</span>
            {' · '}
            FJ: <span style={{ color: fj === 1 ? '#4ade80' : '#94a3b8' }}>{fj}/1</span>
          </span>
          <button onClick={save} disabled={saving}
            style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={play} disabled={!allFilled}
            title={!allFilled ? 'Board must be complete (R1: 30/30, R2: 30/30, FJ: 1/1) to play' : ''}
            style={{ padding: '8px 18px', background: allFilled ? '#1d4ed8' : '#1e293b', color: allFilled ? '#fff' : '#475569', border: 'none', borderRadius: 6, cursor: allFilled ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
            ▶ Play
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 0, borderBottom: '1px solid #1e293b' }}>
          <button style={tabStyle('round1')} onClick={() => setActiveTab('round1')}>ROUND 1</button>
          <button style={tabStyle('round2')} onClick={() => setActiveTab('round2')}>ROUND 2</button>
          <button style={tabStyle('finalJeopardy')} onClick={() => setActiveTab('finalJeopardy')}>FINAL JEOPARDY</button>
        </div>

        <div style={{ background: '#0f172a', borderRadius: '0 0 8px 8px', padding: 12 }}>
          {activeTab === 'round1' && (
            <BoardEditorGrid
              key={activeBoardId ? `${activeBoardId}-r1` : 'new-r1'}
              categories={board.round1.categories}
              values={R1_VALUES}
              onChange={cats => { setBoard(b => ({ ...b, round1: { ...b.round1, categories: cats } })); setDirty(true); }}
            />
          )}
          {activeTab === 'round2' && (
            <BoardEditorGrid
              key={activeBoardId ? `${activeBoardId}-r2` : 'new-r2'}
              categories={board.round2.categories}
              values={R2_VALUES}
              onChange={cats => { setBoard(b => ({ ...b, round2: { ...b.round2, categories: cats } })); setDirty(true); }}
            />
          )}
          {activeTab === 'finalJeopardy' && (
            <FinalJeopardyTab fj={board.finalJeopardy} onChange={fj => { setBoard(b => ({ ...b, finalJeopardy: fj })); setDirty(true); }} />
          )}
        </div>
      </div>
    </div>
  );
}

function FinalJeopardyTab({ fj, onChange }) {
  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#a5b4fc', marginBottom: 6 }}>CATEGORY</div>
        <input
          value={fj.category}
          onChange={e => onChange({ ...fj, category: e.target.value })}
          placeholder="e.g. POTENT POTABLES"
          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#fff', fontSize: 14, padding: '8px 10px', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#a5b4fc', marginBottom: 6 }}>CLUE</div>
        <textarea
          value={fj.clue}
          onChange={e => onChange({ ...fj, clue: e.target.value })}
          rows={4}
          placeholder="This is the Final Jeopardy clue..."
          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#fff', fontSize: 13, padding: '8px 10px', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#86efac', marginBottom: 6 }}>ANSWER</div>
        <input
          value={fj.answer}
          onChange={e => onChange({ ...fj, answer: e.target.value })}
          placeholder="What is...?"
          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#4ade80', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }}
        />
      </div>
      {fj.category && fj.clue && fj.answer && (
        <div style={{ fontSize: 11, color: '#4ade80' }}>✓ Final Jeopardy complete</div>
      )}
    </div>
  );
}
