import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import socket from '../socket';
import BuzzerButton from '../components/BuzzerButton';
import NavBreadcrumb from '../components/NavBreadcrumb';

export default function PlayerPage() {
  const { gameCode } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const nameFromState = state?.name;
  const nameFromStorage = (() => {
    try {
      const s = localStorage.getItem(`jeopardy_session_${gameCode}`);
      return s ? JSON.parse(s).name : null;
    } catch { return null; }
  })();
  const myName = nameFromState || nameFromStorage;
  const isRejoin = useRef(!!nameFromStorage && myName === nameFromStorage).current;
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);
  const [wagerInput, setWagerInput] = useState('');
  const [answerInput, setAnswerInput] = useState('');

  useEffect(() => {
    if (!myName) { navigate('/'); return; }

    socket.connect();

    if (isRejoin) {
      socket.emit('player:rejoin', { gameCode, name: myName });
      socket.once('player:rejoined', gs => {
        setGame({
          phase: gs.phase,
          currentRound: gs.currentRound || 1,
          players: gs.players,
          revealedClues: gs.revealedClues,
          buzzerState: gs.buzzerState,
          buzzedBy: gs.buzzedBy,
          currentPicker: gs.currentPicker,
          currentClue: gs.currentClue,
          fjCategory: gs.finalJeopardyCategory,
          fjClue: gs.fjClue,
          fjType: gs.fjType || 'regular',
          fjMediaUrl: gs.fjMediaUrl || null,
          wagersSubmitted: gs.wagersSubmitted,
          answersSubmitted: gs.answersSubmitted,
          myWagerSubmitted: (gs.wagersSubmitted || []).includes(myName),
          myAnswerSubmitted: (gs.answersSubmitted || []).includes(myName),
        });
      });
      socket.on('error:notInGame', () => {
        localStorage.removeItem(`jeopardy_session_${gameCode}`);
        navigate('/');
      });
    } else {
      socket.emit('player:join', { gameCode, name: myName });
      socket.on('player:joined', () => {
        localStorage.setItem(`jeopardy_session_${gameCode}`, JSON.stringify({ name: myName }));
        setGame({ phase: 'lobby', players: [], currentClue: null, buzzerState: 'locked', buzzedBy: null });
      });
      socket.on('error:nameTaken', () => setError('Name already taken'));
    }
    socket.on('error:gameNotFound', () => {
      if (isRejoin) localStorage.removeItem(`jeopardy_session_${gameCode}`);
      setError('Game not found');
    });
    socket.on('game:playerJoined', ({ players }) => setGame(g => ({ ...g, players })));
    socket.on('game:started', ({ players, currentPicker, currentRound }) =>
      setGame(g => ({ ...g, phase: 'board', players, currentPicker, currentRound: currentRound || 1, revealedClues: [], currentClue: null, buzzedBy: null, buzzerState: 'locked' })));
    socket.on('game:clueRevealed', clue => setGame(g => ({ ...g, phase: 'clue', currentClue: clue, buzzedBy: null, buzzerState: 'locked', myBuzzedOut: false })));
    socket.on('game:wrongAnswer', ({ players, buzzedPlayers }) => setGame(g => ({ ...g, phase: 'clue', buzzedBy: null, buzzerState: 'open', players, myBuzzedOut: (buzzedPlayers || []).includes(myName) })));
    socket.on('game:buzzersOpen', () => setGame(g => ({ ...g, buzzerState: 'open' })));
    socket.on('game:buzzClaimed', ({ playerName }) => setGame(g => ({ ...g, phase: 'judging', buzzedBy: playerName, buzzerState: 'claimed' })));
    socket.on('game:scored', ({ players, currentPicker, revealedClues, currentRound }) =>
      setGame(g => ({ ...g, phase: 'board', players, currentPicker, revealedClues, currentRound: currentRound || g.currentRound, currentClue: null, buzzedBy: null, buzzerState: 'locked', myBuzzedOut: false })));
    socket.on('game:finished', ({ players }) => {
      localStorage.removeItem(`jeopardy_session_${gameCode}`);
      setGame(g => ({ ...g, phase: 'finished', players }));
    });
    socket.on('game:betweenRounds', ({ players }) =>
      setGame(g => ({ ...g, phase: 'between-rounds', players })));
    socket.on('game:round2Started', ({ currentRound, currentPicker, players }) =>
      setGame(g => ({ ...g, phase: 'board', currentRound, currentPicker, players, revealedClues: [], currentClue: null })));
    socket.on('game:finalWager', ({ category }) =>
      setGame(g => ({ ...g, phase: 'final-wager', fjCategory: category, myWagerSubmitted: false })));
    socket.on('game:finalClue', ({ category, clue }) =>
      setGame(g => ({ ...g, phase: 'final-clue', fjCategory: category, fjClue: clue, myAnswerSubmitted: false })));
    socket.on('game:finalJudging', () =>
      setGame(g => ({ ...g, phase: 'final-judging' })));
    socket.on('game:revealReady', ({ players }) =>
      setGame(g => ({ ...g, phase: 'final-reveal', players, revealedPlayers: [] })));
    socket.on('game:finalReveal', ({ playerName, wager, answer, correct, players }) =>
      setGame(g => ({
        ...g,
        players,
        revealedPlayers: [...(g.revealedPlayers || []), { playerName, wager, answer, correct }],
      })));

    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [gameCode, myName]);

  if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-red)' }}>{error} <button onClick={() => navigate('/')} style={{ color: 'var(--color-label)', background: 'none', border: 'none', cursor: 'pointer' }}>Go back</button></div>;
  if (!game) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)' }}>Joining...</div>;

  const myScore = game.players?.find(p => p.name === myName)?.score ?? 0;
  const isPicker = game.currentPicker === myName;

  return (
    <div style={{ maxWidth: 360, margin: '0 auto', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 4 }}>{myName}</div>
      <div style={{ fontSize: 28, fontWeight: 'bold', color: myScore < 0 ? 'var(--color-red)' : 'var(--color-green)', marginBottom: 16 }}>
        {myScore < 0 ? `-$${Math.abs(myScore)}` : `$${myScore}`}
      </div>

      {game.phase === 'lobby' && (
        <div>
          <div style={{ color: 'var(--color-green)', marginBottom: 12 }}>✓ You're in!</div>
          <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>Waiting for host to start...</div>
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--color-muted)' }}>Also joined:</div>
          {(game.players || []).filter(p => p.name !== myName).map(p => (
            <div key={p.name} style={{ color: 'var(--color-muted)', marginTop: 4 }}>{p.name}</div>
          ))}
        </div>
      )}

      {game.phase === 'board' && (
        <div>
          {isPicker
            ? <div style={{ background: 'var(--color-amber)', color: '#0a0a0a', borderRadius: 8, padding: '8px 16px', fontWeight: 'bold', marginBottom: 16 }}>Your turn to pick a clue!</div>
            : <div style={{ color: 'var(--color-muted)', marginBottom: 16 }}>{game.currentPicker} is picking...</div>}
          <BuzzerButton locked buzzedBy={null} myName={myName} />
        </div>
      )}

      {(game.phase === 'clue' || game.phase === 'judging') && (
        <div>
          {game.currentClue && (
            <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 24, color: 'var(--color-white)' }}>
              {game.currentClue.question}
            </div>
          )}
          <BuzzerButton
            locked={game.buzzerState === 'locked' || game.myBuzzedOut || (game.buzzerState === 'claimed' && game.buzzedBy !== myName)}
            onBuzz={() => socket.emit('player:buzz')}
            buzzedBy={game.buzzedBy}
            myName={myName}
          />
        </div>
      )}

      {game.phase === 'between-rounds' && (
        <div>
          <div style={{ color: 'var(--color-amber)', fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>DOUBLE JEOPARDY</div>
          <div style={{ color: 'var(--color-muted)', marginBottom: 12 }}>Get ready for Round 2!</div>
          <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 8 }}>SCORES</div>
          {[...(game.players || [])].sort((a, b) => b.score - a.score).map(p => (
            <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: p.name === myName ? 'var(--color-amber)' : 'var(--color-muted)' }}>
              <span>{p.name}</span>
              <span style={{ color: p.score < 0 ? 'var(--color-red)' : 'var(--color-green)' }}>{p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}</span>
            </div>
          ))}
        </div>
      )}

      {game.phase === 'final-wager' && (
        <div>
          <div style={{ color: 'var(--color-amber)', fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>FINAL JEOPARDY</div>
          <div style={{ color: 'var(--color-white)', fontSize: 14, marginBottom: 16 }}>{game.fjCategory}</div>
          {game.myWagerSubmitted ? (
            <div style={{ color: 'var(--color-green)', fontSize: 14 }}>Wager locked in! ${parseInt(wagerInput, 10)}</div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 8 }}>
                Enter your wager (max: ${Math.max(myScore, 1000)})
              </div>
              <input
                type="number"
                value={wagerInput}
                onChange={e => setWagerInput(e.target.value)}
                min={0}
                max={Math.max(myScore, 1000)}
                style={{ width: '100%', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: '#fff', fontSize: 18, padding: '10px 12px', boxSizing: 'border-box', marginBottom: 10 }}
              />
              <button
                onClick={() => {
                  const w = parseInt(wagerInput, 10);
                  if (isNaN(w) || w < 0 || w > Math.max(myScore, 1000)) return;
                  socket.emit('player:submitWager', { wager: w });
                  setGame(g => ({ ...g, myWagerSubmitted: true }));
                }}
                style={{ width: '100%', padding: 12, background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                Submit Wager
              </button>
            </div>
          )}
        </div>
      )}

      {game.phase === 'final-clue' && (
        <div>
          <div style={{ color: 'var(--color-label)', fontSize: 12, marginBottom: 8 }}>{game.fjCategory}</div>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 14, lineHeight: 1.6, color: 'var(--color-white)' }}>
            {game.fjClue}
          </div>
          {game.myAnswerSubmitted ? (
            <div style={{ color: 'var(--color-green)', fontSize: 14 }}>Answer locked in!</div>
          ) : (
            <div>
              <textarea
                value={answerInput}
                onChange={e => setAnswerInput(e.target.value)}
                placeholder="What is...?"
                rows={3}
                style={{ width: '100%', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: '#fff', fontSize: 14, padding: '10px 12px', resize: 'none', boxSizing: 'border-box', marginBottom: 10 }}
              />
              <button
                onClick={() => {
                  socket.emit('player:submitAnswer', { answer: answerInput });
                  setGame(g => ({ ...g, myAnswerSubmitted: true }));
                }}
                style={{ width: '100%', padding: 12, background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                Submit Answer
              </button>
            </div>
          )}
        </div>
      )}

      {game.phase === 'final-judging' && (
        <div style={{ color: 'var(--color-muted)', fontSize: 14 }}>Judging in progress...</div>
      )}

      {game.phase === 'final-reveal' && (
        <div>
          <div style={{ color: 'var(--color-amber)', fontSize: 16, fontWeight: 'bold', marginBottom: 16 }}>FINAL JEOPARDY REVEAL</div>
          {(game.revealedPlayers || []).map(({ playerName, wager, answer, correct }) => (
            <div key={playerName} style={{
              background: playerName === myName ? '#1d4ed8' : 'var(--bg-panel)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 8,
              border: playerName === myName ? '2px solid var(--color-label)' : '1px solid var(--border-subtle)'
            }}>
              <div style={{ fontWeight: 'bold', color: 'var(--color-white)' }}>{playerName}</div>
              <div style={{ color: 'var(--color-muted)', fontSize: 12 }}>Wager: ${wager}</div>
              <div style={{ color: 'var(--color-muted)', fontSize: 12 }}>{answer || '(blank)'}</div>
              <div style={{ color: correct ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 'bold' }}>
                {correct ? `+$${wager}` : `-$${wager}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {game.phase === 'finished' && (
        <div>
          <NavBreadcrumb />
          <div style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--color-amber)', marginBottom: 16 }}>Game Over!</div>
          {[...game.players].sort((a, b) => b.score - a.score).map((p, i) => (
            <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bg-panel)' }}>
              <span style={{ color: p.name === myName ? 'var(--color-amber)' : 'var(--color-muted)' }}>{i === 0 ? '🏆 ' : ''}{p.name}</span>
              <span style={{ color: p.score >= 0 ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 'bold' }}>
                {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Mini scoreboard always visible during active play */}
      {game.phase !== 'lobby' && game.phase !== 'finished' && game.phase !== 'between-rounds' && game.phase !== 'final-reveal' && (
        <div style={{ marginTop: 24, fontSize: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          <div style={{ color: 'var(--color-muted)', marginBottom: 6 }}>SCORES</div>
          {[...(game.players || [])].sort((a, b) => b.score - a.score).map(p => (
            <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: p.name === myName ? 'var(--color-amber)' : 'var(--color-muted)' }}>
              <span>{p.name === myName ? '▶ ' : ''}{p.name}</span>
              <span style={{ color: p.score < 0 ? 'var(--color-red)' : 'var(--color-green)' }}>
                {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
