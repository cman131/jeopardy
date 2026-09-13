import { useState } from 'react';

// Props: categories (array of 6), values (array of 5 dollar amounts), onChange(updatedCategories)
export default function BoardEditorGrid({ categories, values, onChange }) {
  const [activeCell, setActiveCell] = useState(null); // { ci, qi }

  function updateCategory(ci, name) {
    const updated = categories.map((c, i) => i === ci ? { ...c, name } : c);
    onChange(updated);
  }

  function updateClue(ci, qi, field, value) {
    const updated = categories.map((c, i) => {
      if (i !== ci) return c;
      const clues = c.clues.map((cl, j) => j === qi ? { ...cl, [field]: value } : cl);
      return { ...c, clues };
    });
    onChange(updated);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
      {categories.map((cat, ci) => (
        <div key={ci}>
          <input
            value={cat.name}
            onChange={e => updateCategory(ci, e.target.value)}
            style={{ width: '100%', background: '#1d4ed8', border: '1px solid #3b82f6', borderRadius: 6, padding: '7px 4px', fontSize: 11, fontWeight: 'bold', color: '#fff', textAlign: 'center', boxSizing: 'border-box', marginBottom: 4 }}
          />
          {values.map((value, qi) => {
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
  );
}
