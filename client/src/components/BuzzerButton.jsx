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
          background: isMine ? '#16a34a' : locked || isOther ? '#1e293b' : '#1d4ed8',
          border: `4px solid ${isMine ? '#4ade80' : locked || isOther ? '#334155' : '#3b82f6'}`,
          opacity: locked || isOther ? 0.4 : 1,
          fontSize: 14,
          fontWeight: 'bold',
          color: locked || isOther ? '#64748b' : '#fff',
          userSelect: 'none',
          transition: 'all 0.1s',
        }}
      >
        {isMine ? 'YOU!' : 'BUZZ'}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
        {isMine ? 'Answer out loud!' : isOther ? `${buzzedBy} is answering...` : locked ? '🔒 Locked' : 'Buzzers open!'}
      </div>
    </div>
  );
}
