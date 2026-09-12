import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const [gameCode, setGameCode] = useState('');
  const [name, setName] = useState('');
  const navigate = useNavigate();

  function joinGame(e) {
    e.preventDefault();
    if (gameCode && name) navigate(`/play/${gameCode.toUpperCase()}`, { state: { name } });
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24 }}>
      <h1 style={{ color: '#fbbf24', textAlign: 'center', marginBottom: 32 }}>JEOPARDY!</h1>
      <form onSubmit={joinGame} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input value={gameCode} onChange={e => setGameCode(e.target.value.toUpperCase())} placeholder="Game Code" maxLength={4}
          style={{ padding: 10, borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#fff', fontSize: 18, textAlign: 'center', letterSpacing: 4 }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your Name"
          style={{ padding: 10, borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#fff', fontSize: 16 }} />
        <button type="submit" style={{ padding: 12, borderRadius: 6, background: '#1d4ed8', color: '#fff', border: 'none', fontSize: 16, cursor: 'pointer' }}>
          Join Game
        </button>
      </form>
      <div style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={() => navigate('/editor')} style={{ padding: '8px 16px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Board Editor
        </button>
      </div>
    </div>
  );
}
