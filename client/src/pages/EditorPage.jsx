import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BoardEditorGrid from '../components/BoardEditorGrid';
import NavBreadcrumb from '../components/NavBreadcrumb';
import ImportBoardModal from '../components/ImportBoardModal.jsx';

const R1_VALUES = [200, 400, 600, 800, 1000];
const R2_VALUES = [400, 800, 1200, 1600, 2000];

function emptyRound() {
  return {
    categories: Array.from({ length: 6 }, () => ({
      name: 'CATEGORY',
      clues: Array.from({ length: 5 }, () => ({
        question: '', answer: '', type: 'regular', mediaUrl: '', answerImage: '', mediaHash: '',
      })),
    })),
  };
}

function emptyBoard() {
  return {
    name: 'New Board',
    round1: emptyRound(),
    round2: emptyRound(),
    finalJeopardy: { category: '', clue: '', answer: '', type: 'regular', mediaUrl: '', answerImage: '', mediaHash: '' },
  };
}


function countFilled(board) {
  const isClueComplete = (cl) => {
    const type = cl.type || 'regular';
    return !!(cl.question && cl.answer && (type === 'regular' || cl.mediaUrl || cl.mediaHash));
  };
  const countRound = (round) =>
    round.categories.reduce((sum, c) => sum + c.clues.filter(isClueComplete).length, 0);
  const fj = board.finalJeopardy;
  const fjType = fj.type || 'regular';
  return {
    r1: countRound(board.round1),
    r2: countRound(board.round2),
    fj: (fj.category && fj.clue && fj.answer && (fjType === 'regular' || fj.mediaUrl || fj.mediaHash)) ? 1 : 0,
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
  const [showImportModal, setShowImportModal] = useState(false);
  const [importWarnings, setImportWarnings] = useState(0);

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

  function handleImport(board, warnings) {
    setBoard(board);
    setActiveBoardId(null);
    setDirty(true);
    setImportWarnings(warnings);
    setShowImportModal(false);
    setActiveTab('round1');
    navigate('/editor', { replace: true });
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
    background: activeTab === tab ? '#1d4ed8' : 'var(--bg-panel)',
    color: activeTab === tab ? '#fff' : 'var(--color-muted)',
    border: 'none',
    borderRadius: '6px 6px 0 0',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 'bold',
  });

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 200, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, fontWeight: 'bold', color: 'var(--color-white)', letterSpacing: 1 }}>MY BOARDS</div>
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          {boards.map(b => (
            <div key={b._id} onClick={() => selectBoard(b._id)}
              style={{ background: b._id === activeBoardId ? '#1d4ed8' : 'var(--bg-surface)', borderRadius: 6, padding: '8px 10px', marginBottom: 4, cursor: 'pointer' }}>
              <div style={{ fontSize: 11, color: b._id === activeBoardId ? '#fff' : 'var(--color-muted)' }}>{b.name}</div>
            </div>
          ))}
          <button onClick={newBoard}
            style={{ width: '100%', background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)', color: 'var(--color-muted)', borderRadius: 6, padding: 7, fontSize: 10, cursor: 'pointer', marginTop: 4 }}>
            + New Board
          </button>
        </div>
        <div style={{ padding: 8, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => { if (confirmDiscard()) setShowImportModal(true); }} style={{ background: 'var(--bg-panel)', border: 'none', color: 'var(--color-muted)', borderRadius: 5, padding: 7, fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>⬆ Import Board</button>
          <button onClick={exportJson} style={{ background: 'var(--bg-panel)', border: 'none', color: 'var(--color-muted)', borderRadius: 5, padding: 7, fontSize: 10, cursor: 'pointer', textAlign: 'left' }}>⬇ Export Board (JSON)</button>
        </div>
      </div>

      {/* Main editor area */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <NavBreadcrumb />
        {error && (
          <div style={{ background: '#450a0a', border: '1px solid #b91c1c', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--color-red)' }}>
            {error}
          </div>
        )}
        {importWarnings > 0 && (
          <div style={{
            background: '#422006', border: '1px solid #92400e', borderRadius: 6,
            padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#fbbf24',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>
              {importWarnings} clue{importWarnings !== 1 ? 's' : ''} imported with Buzzinga media
              hashes — open those clues and replace the hash with a real URL to use
              image/audio/video media.
            </span>
            <button
              onClick={() => setImportWarnings(0)}
              style={{ background: 'none', border: 'none', color: '#fbbf24', cursor: 'pointer', fontSize: 16, lineHeight: 1, marginLeft: 12 }}
            >
              ×
            </button>
          </div>
        )}
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <input
            value={board.name}
            onChange={e => { setBoard(b => ({ ...b, name: e.target.value })); setDirty(true); }}
            placeholder="Board name"
            maxLength={80}
            style={{ flex: 1, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '8px 12px', fontSize: 15, color: 'var(--color-white)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
            R1: <span style={{ color: r1 === 30 ? 'var(--color-green)' : 'var(--color-muted)' }}>{r1}/30</span>
            {' · '}
            R2: <span style={{ color: r2 === 30 ? 'var(--color-green)' : 'var(--color-muted)' }}>{r2}/30</span>
            {' · '}
            FJ: <span style={{ color: fj === 1 ? 'var(--color-green)' : 'var(--color-muted)' }}>{fj}/1</span>
          </span>
          <button onClick={save} disabled={saving}
            style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={play} disabled={!allFilled}
            title={!allFilled ? 'Board must be complete (R1: 30/30, R2: 30/30, FJ: 1/1) to play' : ''}
            style={{ padding: '8px 18px', background: allFilled ? '#1d4ed8' : 'var(--bg-panel)', color: allFilled ? '#fff' : 'var(--color-muted)', border: 'none', borderRadius: 6, cursor: allFilled ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
            ▶ Play
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 0, borderBottom: '1px solid var(--border-subtle)' }}>
          <button style={tabStyle('round1')} onClick={() => setActiveTab('round1')}>ROUND 1</button>
          <button style={tabStyle('round2')} onClick={() => setActiveTab('round2')}>ROUND 2</button>
          <button style={tabStyle('finalJeopardy')} onClick={() => setActiveTab('finalJeopardy')}>FINAL JEOPARDY</button>
        </div>

        <div style={{ background: 'var(--bg-surface)', borderRadius: '0 0 8px 8px', padding: 16 }}>
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
      {showImportModal && (
        <ImportBoardModal
          onImport={handleImport}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}

function FinalJeopardyTab({ fj, onChange }) {
  const type = fj.type || 'regular';
  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--color-label)', marginBottom: 6 }}>CATEGORY</div>
        <input
          value={fj.category}
          onChange={e => onChange({ ...fj, category: e.target.value })}
          placeholder="e.g. POTENT POTABLES"
          style={{ width: '100%', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--color-white)', fontSize: 14, padding: '8px 10px', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--color-label)', marginBottom: 6 }}>CLUE TYPE</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['regular', 'image', 'video'].map(t => (
            <button
              key={t}
              onClick={() => onChange({ ...fj, type: t, mediaUrl: '' })}
              style={{
                flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
                background: type === t ? '#7c3aed' : 'var(--bg-panel)',
                color: type === t ? '#fff' : 'var(--color-muted)',
                border: `1px solid ${type === t ? '#7c3aed' : 'var(--border-subtle)'}`,
                borderRadius: 5,
              }}
            >
              {t === 'regular' ? 'Text' : t === 'image' ? '📷 Image' : '▶ Video'}
            </button>
          ))}
        </div>
      </div>

      {type !== 'regular' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--color-label)', marginBottom: 6 }}>
            {type === 'image' ? 'IMAGE URL' : 'YOUTUBE URL'}
          </div>
          <input
            value={fj.mediaUrl || ''}
            onChange={e => onChange({ ...fj, mediaUrl: e.target.value })}
            placeholder={type === 'image' ? 'https://...' : 'https://youtube.com/watch?v=...'}
            style={{ width: '100%', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--color-white)', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }}
          />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--color-label)', marginBottom: 6 }}>CLUE</div>
        <textarea
          value={fj.clue}
          onChange={e => onChange({ ...fj, clue: e.target.value })}
          rows={4}
          placeholder="This is the Final Jeopardy clue..."
          style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--color-white)', fontSize: 13, padding: '8px 10px', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--color-green)', marginBottom: 6 }}>ANSWER</div>
        <input
          value={fj.answer}
          onChange={e => onChange({ ...fj, answer: e.target.value })}
          placeholder="What is...?"
          style={{ width: '100%', background: '#0a1f0f', border: '1px solid #16a34a', borderRadius: 6, color: 'var(--color-green)', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 6 }}>ANSWER IMAGE (optional)</div>
        <input
          value={fj.answerImage || ''}
          onChange={e => onChange({ ...fj, answerImage: e.target.value })}
          placeholder="https://..."
          style={{ width: '100%', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--color-muted)', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box' }}
        />
      </div>

      {fj.category && fj.clue && fj.answer && (type === 'regular' || fj.mediaUrl) && (
        <div style={{ fontSize: 11, color: 'var(--color-green)' }}>✓ Final Jeopardy complete</div>
      )}
    </div>
  );
}
