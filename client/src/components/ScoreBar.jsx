// Props: players ({name, score}[]), currentPicker (string|null)
export default function ScoreBar({ players = [], currentPicker }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
      {players.map(p => {
        const isPicker = p.name === currentPicker;
        return (
          <div key={p.name} style={{
            background: isPicker ? 'var(--color-amber)' : 'var(--bg-panel)',
            borderRadius: 6,
            padding: '6px 14px',
            textAlign: 'center',
            minWidth: 80,
            position: 'relative',
            border: isPicker ? '2px solid var(--border-accent)' : '1px solid var(--border-subtle)',
          }}>
            {isPicker && (
              <div style={{
                position: 'absolute',
                top: -10,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--color-amber)',
                color: '#0a0a0a',
                fontSize: 9,
                fontWeight: 'bold',
                padding: '1px 5px',
                borderRadius: 3,
                whiteSpace: 'nowrap',
              }}>
                PICKING
              </div>
            )}
            <div style={{ fontSize: 12, color: isPicker ? '#0a0a0a' : 'var(--color-muted)' }}>{p.name}</div>
            <div style={{ fontSize: 14, fontWeight: 'bold', color: isPicker ? '#0a0a0a' : p.score < 0 ? 'var(--color-red)' : 'var(--color-green)' }}>
              {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
