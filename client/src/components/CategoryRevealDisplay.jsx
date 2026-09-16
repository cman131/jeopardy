export default function CategoryRevealDisplay({ categories, step, round }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-deep)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: 48,
    }}>
      <style>{`
        @keyframes categorySlideUp {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {step === 0 ? (
        <div style={{ fontSize: 64, fontWeight: 'bold', color: 'var(--color-amber)', letterSpacing: 8 }}>
          {round === 1 ? 'JEOPARDY!' : 'DOUBLE JEOPARDY!'}
        </div>
      ) : (
        <>
          <div
            key={step}
            style={{
              background: '#1e2a5e',
              borderTop: '4px solid #3b82f6',
              borderRadius: 8,
              padding: '32px 56px',
              fontSize: 28,
              fontWeight: 'bold',
              letterSpacing: 4,
              color: '#93c5fd',
              textTransform: 'uppercase',
              animation: 'categorySlideUp 0.5s ease-out',
              animationFillMode: 'forwards',
              maxWidth: 600,
            }}
          >
            {categories[step - 1]}
          </div>
          <div style={{ marginTop: 20, fontSize: 11, color: 'var(--color-muted)', letterSpacing: 3 }}>
            CATEGORY {step} OF {categories.length}
          </div>
        </>
      )}
    </div>
  );
}
