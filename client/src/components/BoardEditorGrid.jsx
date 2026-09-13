import { useState } from 'react';

const VALUES = [200, 400, 600, 800, 1000];

// Props: board ({name, categories}), onChange(updatedBoard), filled (number)
export default function BoardEditorGrid({ board, onChange, filled }) {
  const [activeCell, setActiveCell] = useState(null); // { ci, qi }

  function updateCategory(ci, name) {
    const cats = board.categories.map((c, i) => i === ci ? { ...c, name } : c);
    onChange({ ...board, categories: cats });
  }

  function updateClue(ci, qi, field, value) {
    const cats = board.categories.map((c, i) => {
      if (i !== ci) return c;
      const clues = c.clues.map((cl, j) => j === qi ? { ...cl, [field]: value } : cl);
      return { ...c, clues };
    });
    onChange({ ...board, categories: cats });
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {board.categories.map((cat, ci) => (
          <div key={ci}>
            <input
              value={cat.name}
              onChange={e => updateCategory(ci, e.target.value)}
              style={{ width: '100%', background: '#1d4ed8', border: '1px solid #3b82f6', borderRadius: 6, padding: '7px 4px', fontSize: 11, fontWeight: 'bold', color: '#fff', textAlign: 'center', boxSizing: 'border-box', marginBottom: 4 }}
            />
            {VALUES.map((value, qi) => {
              const clue = cat.clues[qi] || { question: '', answer: '' };
              const complete = !!(clue.question && clue.answer);
              const isActive = activeCell?.ci === ci && activeCell?.qi === qi;
              return (
                <div key={qi} style={{ marginBottom: 4 }}>
                  {!isActive ? (
                    <div
                      onClick={() => setActiveCell({ ci, qi })}
                      style={{ background: '#0f172a', border: `1px solid ${complete ? '#334155' : '#1e293b'}`, borderRadius: 5, padding: '7px 6px', cursor: 'pointer', opacity: complete ? 1 : 0.5 }}
                    >
                      <div style={{ fontSize: 10, color: '#fbbf24', fontWeight: 'bold' }}>${value} {complete ? '✓' : ''}</div>
                      {!complete && <div style={{ fontSize: 9, color: '#475569', fontStyle: 'italic' }}>Click to add...</div>}
                      {complete && <div style={{ fontSize: 9, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clue.question}</div>}
                    </div>
                  ) : (
                    <div style={{ background: '#1e293b', border: '2px solid #7c3aed', borderRadius: 5, padding: 8 }}>
                      <div style={{ fontSize: 10, color: '#fbbf24', fontWeight: 'bold', marginBottom: 4 }}>${value}</div>
                      <div style={{ fontSize: 10, color: '#a5b4fc', marginBottom: 3 }}>CLUE</div>
                      <textarea
                        value={clue.question}
                        onChange={e => updateClue(ci, qi, 'question', e.target.value)}
                        rows={3}
                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#fff', fontSize: 10, padding: 5, resize: 'none', boxSizing: 'border-box' }}
                      />
                      <div style={{ fontSize: 10, color: '#86efac', margin: '5px 0 3px' }}>ANSWER</div>
                      <input
                        value={clue.answer}
                        onChange={e => updateClue(ci, qi, 'answer', e.target.value)}
                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#4ade80', fontSize: 10, padding: 5, boxSizing: 'border-box' }}
                      />
                      <button onClick={() => setActiveCell(null)} style={{ marginTop: 6, width: '100%', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 4, padding: 4, fontSize: 10, cursor: 'pointer' }}>Done</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, background: '#0f172a', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Completion:</span>
        <div style={{ flex: 1, background: '#1e293b', borderRadius: 4, height: 6, overflow: 'hidden' }}>
          <div style={{ background: filled === 30 ? '#16a34a' : '#3b82f6', height: '100%', width: `${(filled / 30) * 100}%`, transition: 'width 0.2s, background 0.2s' }} />
        </div>
        <span style={{ fontSize: 12, color: filled === 30 ? '#4ade80' : '#94a3b8', fontWeight: 'bold' }}>{filled}/30</span>
        {filled < 30 && <span style={{ fontSize: 11, color: '#f87171' }}>⚠ Incomplete</span>}
      </div>
    </div>
  );
}
