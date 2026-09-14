// Props: locked (bool), onBuzz (fn), buzzedBy (string|null), myName (string)
export default function BuzzerButton({ locked, onBuzz, buzzedBy, myName }) {
  const isMine = buzzedBy === myName;
  const isOther = buzzedBy && !isMine;

  return (
    <div style={{ textAlign: 'center' }}>
      <div
        onClick={!locked && !buzzedBy ? onBuzz : undefined}
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: locked || buzzedBy ? 'not-allowed' : 'pointer',
          background: isMine ? '#14532d' : locked || isOther ? 'var(--bg-panel)' : '#1d4ed8',
          border: `4px solid ${isMine ? 'var(--color-green)' : locked || isOther ? 'var(--border-subtle)' : '#3b82f6'}`,
          opacity: locked || isOther ? 0.4 : 1,
          fontSize: 14,
          fontWeight: 'bold',
          color: isMine ? 'var(--color-green)' : locked || isOther ? 'var(--color-muted)' : '#fff',
          userSelect: 'none',
          transition: 'all 0.1s',
        }}
      >
        {isMine ? 'YOU!' : 'BUZZ'}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-muted)' }}>
        {isMine ? 'Answer out loud!' : isOther ? `${buzzedBy} is answering...` : locked ? '🔒 Locked' : 'Buzzers open!'}
      </div>
    </div>
  );
}
