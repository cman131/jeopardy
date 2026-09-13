import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import socket from '../socket';
import BuzzerButton from '../components/BuzzerButton';

export default function PlayerPage() {
  const { gameCode } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const myName = state?.name;
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!myName) { navigate('/'); return; }

    socket.connect();
    socket.emit('player:join', { gameCode, name: myName });

    socket.on('player:joined', () => setGame({ phase: 'lobby', players: [], currentClue: null, buzzerState: 'locked', buzzedBy: null }));
    socket.on('error:gameNotFound', () => setError('Game not found'));
    socket.on('error:nameTaken', () => setError('Name already taken'));
    socket.on('game:playerJoined', ({ players }) => setGame(g => ({ ...g, players })));
    socket.on('game:started', ({ players, currentPicker }) =>
      setGame(g => ({ ...g, phase: 'board', players, currentPicker, revealedClues: [], currentClue: null, buzzedBy: null, buzzerState: 'locked' })));
    socket.on('game:clueRevealed', clue => setGame(g => ({ ...g, phase: 'clue', currentClue: clue, buzzedBy: null, buzzerState: 'locked' })));
    socket.on('game:buzzersOpen', () => setGame(g => ({ ...g, buzzerState: 'open' })));
    socket.on('game:buzzClaimed', ({ playerName }) => setGame(g => ({ ...g, phase: 'judging', buzzedBy: playerName, buzzerState: 'claimed' })));
    socket.on('game:scored', ({ players, currentPicker, revealedClues }) =>
      setGame(g => ({ ...g, phase: 'board', players, currentPicker, revealedClues, currentClue: null, buzzedBy: null, buzzerState: 'locked' })));
    socket.on('game:clueSkipped', ({ revealedClues, currentPicker }) =>
      setGame(g => ({ ...g, phase: 'board', revealedClues, currentPicker, currentClue: null, buzzerState: 'locked' })));
    socket.on('game:finished', ({ players }) => setGame(g => ({ ...g, phase: 'finished', players })));

    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [gameCode, myName]);

  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#f87171' }}>{error} <button onClick={() => navigate('/')} style={{ color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer' }}>Go back</button></div>;
  if (!game) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Joining...</div>;

  const myScore = game.players?.find(p => p.name === myName)?.score ?? 0;
  const isPicker = game.currentPicker === myName;

  return (
    <div style={{ maxWidth: 360, margin: '0 auto', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>{myName}</div>
      <div style={{ fontSize: 28, fontWeight: 'bold', color: myScore < 0 ? '#f87171' : '#4ade80', marginBottom: 16 }}>
        {myScore < 0 ? `-$${Math.abs(myScore)}` : `$${myScore}`}
      </div>

      {game.phase === 'lobby' && (
        <div>
          <div style={{ color: '#4ade80', marginBottom: 12 }}>✓ You're in!</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>Waiting for host to start...</div>
          <div style={{ marginTop: 16, fontSize: 12, color: '#475569' }}>Also joined:</div>
          {(game.players || []).filter(p => p.name !== myName).map(p => (
            <div key={p.name} style={{ color: '#94a3b8', marginTop: 4 }}>{p.name}</div>
          ))}
        </div>
      )}

      {game.phase === 'board' && (
        <div>
          {isPicker
            ? <div style={{ background: '#fbbf24', color: '#0a0a0a', borderRadius: 8, padding: '8px 16px', fontWeight: 'bold', marginBottom: 16 }}>Your turn to pick a clue!</div>
            : <div style={{ color: '#64748b', marginBottom: 16 }}>{game.currentPicker} is picking...</div>}
          <BuzzerButton locked buzzedBy={null} myName={myName} />
        </div>
      )}

      {(game.phase === 'clue' || game.phase === 'judging') && (
        <div>
          {game.currentClue && (
            <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 24, color: '#e2e8f0' }}>
              {game.currentClue.question}
            </div>
          )}
          <BuzzerButton
            locked={game.buzzerState === 'locked' || (game.buzzerState === 'claimed' && game.buzzedBy !== myName)}
            onBuzz={() => socket.emit('player:buzz')}
            buzzedBy={game.buzzedBy}
            myName={myName}
          />
        </div>
      )}

      {game.phase === 'finished' && (
        <div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24', marginBottom: 16 }}>Game Over!</div>
          {[...game.players].sort((a, b) => b.score - a.score).map((p, i) => (
            <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1e293b' }}>
              <span style={{ color: p.name === myName ? '#fbbf24' : '#94a3b8' }}>{i === 0 ? '🏆 ' : ''}{p.name}</span>
              <span style={{ color: p.score >= 0 ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
                {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Mini scoreboard always visible during active play */}
      {game.phase !== 'lobby' && game.phase !== 'finished' && (
        <div style={{ marginTop: 24, fontSize: 12, borderTop: '1px solid #1e293b', paddingTop: 12 }}>
          <div style={{ color: '#475569', marginBottom: 6 }}>SCORES</div>
          {[...(game.players || [])].sort((a, b) => b.score - a.score).map(p => (
            <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: p.name === myName ? '#fbbf24' : '#64748b' }}>
              <span>{p.name === myName ? '▶ ' : ''}{p.name}</span>
              <span style={{ color: p.score < 0 ? '#f87171' : '#4ade80' }}>
                {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
