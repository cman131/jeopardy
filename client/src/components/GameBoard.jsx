// Props: categoryNames (string[6]), revealedClues ({categoryIndex,clueIndex}[]),
//        onSelect (optional fn(ci,qi)), activeClue ({categoryIndex,clueIndex}|null), round (1|2)
export default function GameBoard({ categoryNames = [], revealedClues = [], onSelect, activeClue, round = 1 }) {
  const values = [1, 2, 3, 4, 5].map(i => i * (round === 1 ? 200 : 400));
  function isRevealed(ci, qi) {
    return revealedClues.some(r => r.categoryIndex === ci && r.clueIndex === qi);
  }

  function isActive(ci, qi) {
    return activeClue && activeClue.categoryIndex === ci && activeClue.clueIndex === qi;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(6, 1fr)`, gap: 4 }}>
      {categoryNames.map((name, ci) => (
        <div key={ci} style={{ background: '#1d4ed8', padding: '10px 4px', textAlign: 'center', fontWeight: 'bold', fontSize: 12, borderRadius: 4, lineHeight: 1.3 }}>
          {name}
        </div>
      ))}
      {values.map((value, qi) =>
        categoryNames.map((_, ci) => {
          const revealed = isRevealed(ci, qi);
          const active = isActive(ci, qi);
          return (
            <div
              key={`${ci}-${qi}`}
              onClick={() => !revealed && onSelect && onSelect(ci, qi)}
              style={{
                background: revealed ? '#0f172a' : active ? '#7c3aed' : '#1e40af',
                padding: '10px 2px',
                textAlign: 'center',
                color: revealed ? '#334155' : '#fbbf24',
                fontWeight: 'bold',
                fontSize: 13,
                borderRadius: 4,
                cursor: !revealed && onSelect ? 'pointer' : 'default',
                userSelect: 'none',
              }}
            >
              {revealed ? '✓' : `$${value}`}
            </div>
          );
        })
      )}
    </div>
  );
}
