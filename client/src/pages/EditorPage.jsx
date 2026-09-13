import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BoardEditorGrid from '../components/BoardEditorGrid';

const VALUES = [200, 400, 600, 800, 1000];

function emptyBoard() {
  return {
    name: 'New Board',
    categories: Array.from({ length: 6 }, () => ({
      name: 'CATEGORY',
      clues: VALUES.map(value => ({ question: '', answer: '', value })),
    })),
  };
}

export default function EditorPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [board, setBoard] = useState(emptyBoard());
  const [activeBoardId, setActiveBoardId] = useState(boardId || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/boards').then(r => r.json()).then(setBoards);
  }, []);

  useEffect(() => {
    if (activeBoardId) {
      fetch(`/api/boards/${activeBoardId}`).then(r => r.json()).then(setBoard);
    }
  }, [activeBoardId]);

  async function save() {
    setSaving(true);
    const method = activeBoardId ? 'PUT' : 'POST';
    const url = activeBoardId ? `/api/boards/${activeBoardId}` : '/api/boards';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(board) });
    const saved = await res.json();
    setSaving(false);
    if (!activeBoardId) {
      setActiveBoardId(saved._id);
      navigate(`/editor/${saved._id}`, { replace: true });
    }
    const allBoards = await fetch('/api/boards').then(r => r.json());
    setBoards(allBoards);
  }

  async function play() {
    await save();
    const res = await fetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boardId: activeBoardId }) });
    const { gameCode } = await res.json();
    navigate(`/host/${gameCode}`);
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
          setBoard(data);
          setActiveBoardId(null);
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

  const filled = board.categories.reduce((sum, c) => sum + c.clues.filter(cl => cl.question && cl.answer).length, 0);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 200, background: '#0f172a', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 12px', borderBottom: '1px solid #1e293b', fontSize: 12, fontWeight: 'bold', color: '#e2e8f0', letterSpacing: 1 }}>MY BOARDS</div>
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          {boards.map(b => (
            <div key={b._id} onClick={() => setActiveBoardId(b._id)}
              style={{ background: b._id === activeBoardId ? '#1d4ed8' : '#0f172a', borderRadius: 6, padding: '8px 10px', marginBottom: 4, cursor: 'pointer' }}>
              <div style={{ fontSize: 11, color: b._id === activeBoardId ? '#fff' : '#94a3b8' }}>{b.name}</div>
            </div>
          ))}
          <button onClick={() => { setBoard(emptyBoard()); setActiveBoardId(null); navigate('/editor'); }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <input value={board.name} onChange={e => setBoard(b => ({ ...b, name: e.target.value }))}
            style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', fontSize: 15, color: '#fff' }} />
          <button onClick={save} disabled={saving}
            style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={play} disabled={filled < 30}
            title={filled < 30 ? 'Board must be complete (30/30) to play' : ''}
            style={{ padding: '8px 18px', background: filled >= 30 ? '#1d4ed8' : '#1e293b', color: filled >= 30 ? '#fff' : '#475569', border: 'none', borderRadius: 6, cursor: filled >= 30 ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
            ▶ Play
          </button>
        </div>
        <BoardEditorGrid board={board} onChange={setBoard} />
      </div>
    </div>
  );
}
