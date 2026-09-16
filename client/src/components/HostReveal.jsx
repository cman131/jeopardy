export default function HostReveal({ categories, step, onReveal }) {
  const isIntro = step === 0;
  const allRevealed = step >= categories.length;

  return (
    <div style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ fontSize: 12, color: 'var(--color-muted)', letterSpacing: 3, marginBottom: 24 }}>
        {isIntro ? 'INTRO CARD' : `CATEGORY ${step} OF ${categories.length} REVEALED`}
      </div>
      <div style={{ marginBottom: 28, display: 'inline-block', textAlign: 'left' }}>
        {categories.map((name, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 16px',
            marginBottom: 4,
            borderRadius: 6,
            background: i < step ? 'var(--bg-panel)' : 'transparent',
            color: i < step ? 'var(--color-white)' : 'var(--color-muted)',
          }}>
            <span style={{ color: 'var(--color-green)', width: 16, flexShrink: 0 }}>
              {i < step ? '✓' : ''}
            </span>
            <span style={{ fontSize: 14, letterSpacing: 1 }}>{name}</span>
          </div>
        ))}
      </div>
      <div>
        {/* When allRevealed, this final emit pushes revealStep past categories.length, hiding this component */}
        <button
          onClick={onReveal}
          style={{
            padding: '14px 40px',
            background: '#1d4ed8',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          {allRevealed ? 'Show Board →' : 'Reveal Next →'}
        </button>
      </div>
    </div>
  );
}
