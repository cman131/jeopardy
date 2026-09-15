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

  const activeClue = activeCell
    ? (categories[activeCell.ci]?.clues[activeCell.qi] || { question: '', answer: '', type: 'regular', mediaUrl: '', answerImage: '' })
    : null;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {categories.map((cat, ci) => (
          <div key={ci}>
            <input
              value={cat.name}
              onChange={e => updateCategory(ci, e.target.value)}
              style={{ width: '100%', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '8px 4px', fontSize: 11, fontWeight: 'bold', color: 'var(--color-white)', textAlign: 'center', boxSizing: 'border-box', marginBottom: 4 }}
            />
            {values.map((value, qi) => {
              const clue = cat.clues[qi] || { question: '', answer: '' };
              const type = clue.type || 'regular';
              const complete = type === 'regular'
                ? !!(clue.question && clue.answer)
                : !!(clue.answer && (clue.mediaUrl || clue.mediaHash));
              const isActive = activeCell?.ci === ci && activeCell?.qi === qi;
              return (
                <div
                  key={qi}
                  onClick={() => setActiveCell({ ci, qi })}
                  style={{
                    marginBottom: 4,
                    background: 'var(--bg-surface)',
                    border: isActive ? '2px solid var(--border-accent)' : complete ? '1px solid var(--border-subtle)' : '1px dashed var(--border-subtle)',
                    borderRadius: 5,
                    padding: '8px 6px',
                    cursor: 'pointer',
                    opacity: complete ? 1 : 0.6,
                    boxShadow: isActive ? '0 0 8px rgba(251,191,36,0.3)' : 'none',
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--color-amber)', fontWeight: 'bold' }}>
                    ${value}{complete ? ' ✓' : ''}
                  </div>
                  {complete ? (
                    <div style={{ fontSize: 9, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                      {type === 'image' ? '📷' : type === 'video' ? '▶' : type === 'audio' ? '🔊' : ''}{clue.question ? (type !== 'regular' ? ' ' : '') + clue.question : ''}
                    </div>
                  ) : (
                    <div style={{ fontSize: 9, color: '#374151', fontStyle: 'italic', marginTop: 2 }}>Click to add...</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {activeCell && activeClue && (
        <ClueModal
          ci={activeCell.ci}
          qi={activeCell.qi}
          value={values[activeCell.qi]}
          categoryName={categories[activeCell.ci]?.name || ''}
          clue={activeClue}
          onUpdate={(field, value) => updateClue(activeCell.ci, activeCell.qi, field, value)}
          onClose={() => setActiveCell(null)}
        />
      )}
    </>
  );
}

function ClueModal({ ci, qi, value, categoryName, clue, onUpdate, onClose }) {
  const type = clue.type || 'regular';

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 24, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--color-amber)', fontWeight: 'bold', letterSpacing: 1 }}>
            {categoryName} · ${value}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>

        <div style={{ fontSize: 10, color: 'var(--color-label)', letterSpacing: 1, marginBottom: 6 }}>CLUE TYPE</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {['regular', 'image', 'video', 'audio'].map(t => (
            <button
              key={t}
              onClick={() => onUpdate('type', t)}
              style={{
                flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
                background: type === t ? '#7c3aed' : 'var(--bg-surface)',
                color: type === t ? '#fff' : 'var(--color-muted)',
                border: `1px solid ${type === t ? '#7c3aed' : 'var(--border-subtle)'}`,
                borderRadius: 5,
              }}
            >
              {t === 'regular' ? 'Text' : t === 'image' ? '📷 Image' : t === 'video' ? '▶ Video' : '🔊 Audio'}
            </button>
          ))}
        </div>

        {(type === 'image' || type === 'video' || type === 'audio') && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--color-label)', letterSpacing: 1, marginBottom: 6 }}>
              {type === 'image' ? 'IMAGE URL' : type === 'video' ? 'YOUTUBE URL' : 'AUDIO URL'}
            </div>
            <input
              value={clue.mediaUrl || ''}
              onChange={e => onUpdate('mediaUrl', e.target.value)}
              placeholder={type === 'video' ? 'https://youtube.com/watch?v=...' : 'https://...'}
              style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--color-white)', fontSize: 13, padding: '10px 12px', boxSizing: 'border-box' }}
            />
          </div>
        )}

        <div style={{ fontSize: 10, color: 'var(--color-label)', letterSpacing: 1, marginBottom: 6 }}>
          CLUE{type !== 'regular' ? <span style={{ color: 'var(--color-muted)', fontWeight: 'normal' }}> (optional)</span> : ''}
        </div>
        <textarea
          value={clue.question}
          onChange={e => onUpdate('question', e.target.value)}
          rows={4}
          placeholder="Write the clue here..."
          style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--color-white)', fontSize: 14, padding: '10px 12px', resize: 'vertical', boxSizing: 'border-box', marginBottom: 16 }}
        />

        <div style={{ fontSize: 10, color: 'var(--color-green)', letterSpacing: 1, marginBottom: 6 }}>ANSWER</div>
        <input
          value={clue.answer}
          onChange={e => onUpdate('answer', e.target.value)}
          placeholder="What is...?"
          style={{ width: '100%', background: '#0a1f0f', border: '1px solid #16a34a', borderRadius: 6, color: 'var(--color-green)', fontSize: 14, padding: '10px 12px', boxSizing: 'border-box', marginBottom: 16 }}
        />

        <div style={{ fontSize: 10, color: 'var(--color-muted)', letterSpacing: 1, marginBottom: 6 }}>
          ANSWER IMAGE <span style={{ color: '#374151' }}>(optional)</span>
        </div>
        <input
          value={clue.answerImage || ''}
          onChange={e => onUpdate('answerImage', e.target.value)}
          placeholder="https://..."
          style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--color-muted)', fontSize: 13, padding: '10px 12px', boxSizing: 'border-box', marginBottom: 20 }}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: 12, background: '#14532d', border: '1px solid #16a34a', color: 'var(--color-green)', borderRadius: 6, fontSize: 13, fontWeight: 'bold', cursor: 'pointer' }}
          >
            Save &amp; Close
          </button>
          <button
            onClick={onClose}
            style={{ padding: '12px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--color-muted)', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
