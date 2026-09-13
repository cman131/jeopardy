import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import socket from '../socket';
import GameBoard from '../components/GameBoard';
import ScoreBar from '../components/ScoreBar';

export default function HostPage() {
  const { gameCode } = useParams();
  const [game, setGame] = useState(null);
  const [board, setBoard] = useState(null); // full board with answers
  const [error, setError] = useState(null);
  const [judgments, setJudgments] = useState({});

  useEffect(() => {
    async function init() {
      // Get game meta to find boardId
      const gameRes = await fetch(`/api/games/${gameCode}`);
      if (!gameRes.ok) return setError('Game not found');
      const gameMeta = await gameRes.json();

      // Get full board with answers
      const boardRes = await fetch(`/api/boards/${gameMeta.boardId}`);
      const boardData = await boardRes.json();
      setBoard(boardData);

      socket.connect();
      socket.emit('host:join', { gameCode });
      socket.on('host:joined', state => setGame(state));
      socket.on('host:state', state => setGame(state));
      socket.on('game:playerJoined', ({ players }) => setGame(g => ({ ...g, players })));
      socket.on('game:started', ({ players, currentPicker, currentRound }) =>
        setGame(g => ({ ...g, phase: 'board', players, currentPicker, currentRound: currentRound || 1, revealedClues: [], currentClue: null })));
      socket.on('host:clue', clue => setGame(g => ({ ...g, phase: 'clue', currentClue: clue, buzzedBy: null })));
      socket.on('game:buzzersOpen', () => setGame(g => ({ ...g, buzzerState: 'open' })));
      socket.on('game:buzzClaimed', ({ playerName }) => setGame(g => ({ ...g, phase: 'judging', buzzedBy: playerName })));
      socket.on('game:scored', ({ players, currentPicker, revealedClues, currentRound }) =>
        setGame(g => ({ ...g, phase: 'board', players, currentPicker, revealedClues, currentRound: currentRound || g.currentRound, currentClue: null, buzzedBy: null })));
      socket.on('game:clueSkipped', ({ revealedClues, currentPicker }) =>
        setGame(g => ({ ...g, phase: 'board', revealedClues, currentPicker, currentClue: null })));
      socket.on('game:finished', ({ players }) => setGame(g => ({ ...g, phase: 'finished', players })));
      socket.on('game:betweenRounds', ({ players }) =>
        setGame(g => ({ ...g, phase: 'between-rounds', players })));
      socket.on('game:round2Started', ({ currentRound, categoryNames, currentPicker, players }) =>
        setGame(g => ({ ...g, phase: 'board', currentRound, categoryNames, currentPicker, players, revealedClues: [] })));
      socket.on('game:finalWager', ({ category }) =>
        setGame(g => ({ ...g, phase: 'final-wager', fjCategory: category, wagersSubmitted: [] })));
      socket.on('game:wagerSubmitted', ({ playerName }) =>
        setGame(g => ({ ...g, wagersSubmitted: [...(g.wagersSubmitted || []), playerName] })));
      socket.on('game:finalClue', ({ category, clue }) =>
        setGame(g => ({ ...g, phase: 'final-clue', fjCategory: category, fjClue: clue, answersSubmitted: [] })));
      socket.on('game:answerSubmitted', ({ playerName }) =>
        setGame(g => ({ ...g, answersSubmitted: [...(g.answersSubmitted || []), playerName] })));
      socket.on('game:finalJudgingReady', ({ answers }) =>
        setGame(g => ({ ...g, phase: 'final-judging', fjAnswers: answers })));
      socket.on('game:revealReady', ({ players }) =>
        setGame(g => ({ ...g, phase: 'final-reveal', players, revealedPlayers: [] })));
      socket.on('game:finalReveal', ({ playerName, wager, answer, correct, players }) =>
        setGame(g => ({
          ...g,
          players,
          revealedPlayers: [...(g.revealedPlayers || []), { playerName, wager, answer, correct }],
        })));
    }
    init();
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [gameCode]);

  if (error) return <div style={{ padding: 40, color: '#f87171' }}>{error}</div>;
  if (!game || !board) return <div style={{ padding: 40, color: '#94a3b8' }}>Connecting...</div>;

  const phase = game.phase;

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      {phase === 'lobby' && <HostLobby game={game} gameCode={gameCode} boardName={board.name} />}
      {phase === 'board' && <HostBoard game={game} gameCode={gameCode} board={board} />}
      {(phase === 'clue' || phase === 'judging') && <HostClue game={game} board={board} />}
      {phase === 'finished' && <HostFinished players={game.players} />}
      {phase === 'between-rounds' && <HostBetweenRounds game={game} />}
      {phase === 'final-wager' && <HostFinalWager game={game} />}
      {phase === 'final-clue' && <HostFinalClue game={game} />}
      {phase === 'final-judging' && (
        <HostFinalJudging
          game={game}
          judgments={judgments}
          onJudge={(playerName, correct) => {
            socket.emit('host:judgeFinal', { playerName, correct });
            setJudgments(j => ({ ...j, [playerName]: correct }));
          }}
        />
      )}
      {phase === 'final-reveal' && <HostFinalReveal game={game} />}
    </div>
  );
}

function HostLobby({ game, gameCode, boardName }) {
  return (
    <div>
      <div style={{ background: '#0f172a', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#64748b', letterSpacing: 3, marginBottom: 6 }}>GAME CODE</div>
        <div style={{ fontSize: 40, fontWeight: 'bold', color: '#fbbf24', letterSpacing: 8 }}>{gameCode}</div>
        <div style={{ fontSize: 12, color: '#a5b4fc', marginTop: 6 }}>Board: {boardName}</div>
      </div>
      <div style={{ marginBottom: 16 }}>
        {(game.players || []).map(p => (
          <div key={p.name} style={{ background: '#1e293b', borderRadius: 6, padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{p.name}</span>
            <span style={{ fontSize: 11, color: '#4ade80' }}>● connected</span>
          </div>
        ))}
      </div>
      <button
        disabled={(game.players || []).length < 2}
        onClick={() => socket.emit('host:startGame', { gameCode })}
        style={{ width: '100%', padding: 16, background: (game.players || []).length >= 2 ? '#16a34a' : '#1e293b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: (game.players || []).length >= 2 ? 'pointer' : 'not-allowed' }}
      >
        ▶ Start Game {(game.players || []).length < 2 ? '(need 2+ players)' : ''}
      </button>
    </div>
  );
}

function HostBoard({ game, gameCode, board }) {
  const categoryNames = board.categories.map(c => c.name);
  return (
    <div>
      <div style={{ background: '#fbbf24', color: '#0a0a0a', borderRadius: 8, padding: '8px 14px', textAlign: 'center', fontWeight: 'bold', marginBottom: 12 }}>
        🎯 {game.currentPicker} is selecting the next clue
      </div>
      <GameBoard categoryNames={categoryNames} revealedClues={game.revealedClues || []} onSelect={(ci, qi) => socket.emit('host:selectClue', { categoryIndex: ci, clueIndex: qi })} round={game.currentRound || 1} />
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
        <ScoreBar players={game.players || []} currentPicker={game.currentPicker} />
        <button onClick={() => { if (window.confirm('End game?')) socket.emit('host:endGame'); }}
          style={{ marginLeft: 'auto', padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}>
          End Game
        </button>
      </div>
    </div>
  );
}

function HostClue({ game, board }) {
  const { currentClue, phase, buzzedBy, players } = game;
  const clueData = currentClue && board.categories[currentClue.categoryIndex]?.clues[currentClue.clueIndex];

  return (
    <div>
      {buzzedBy && (
        <div style={{ background: '#f59e0b', borderRadius: 8, padding: '10px 14px', textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 'bold', fontSize: 16, color: '#0a0a0a' }}>{buzzedBy} is answering</div>
        </div>
      )}
      {clueData && (
        <>
          <div style={{ fontSize: 11, color: '#a5b4fc', letterSpacing: 2, marginBottom: 6 }}>
            {board.categories[currentClue.categoryIndex].name} · ${clueData.value}
          </div>
          <div style={{ background: '#0f172a', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>CLUE</div>
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>{clueData.question}</div>
          </div>
          <div style={{ background: '#14532d', border: '1px solid #16a34a', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#86efac', marginBottom: 4 }}>ANSWER</div>
            <div style={{ fontSize: 17, fontWeight: 'bold', color: '#4ade80' }}>{clueData.answer}</div>
          </div>
        </>
      )}
      {phase === 'clue' && !buzzedBy && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => socket.emit('host:unlock')}
            style={{ flex: 1, padding: 14, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
            🔓 Unlock Buzzers
          </button>
          <button onClick={() => socket.emit('host:skipClue')}
            style={{ padding: '14px 18px', background: '#374151', color: '#94a3b8', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Skip
          </button>
        </div>
      )}
      {phase === 'judging' && clueData && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => socket.emit('host:judge', { result: 'correct' })}
            style={{ flex: 1, padding: 16, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>
            ✓ Correct<br /><span style={{ fontSize: 11, fontWeight: 'normal' }}>+${clueData.value}</span>
          </button>
          <button onClick={() => socket.emit('host:judge', { result: 'incorrect' })}
            style={{ flex: 1, padding: 16, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>
            ✗ Incorrect<br /><span style={{ fontSize: 11, fontWeight: 'normal' }}>-${clueData.value}</span>
          </button>
        </div>
      )}
      <ScoreBar players={players || []} />
    </div>
  );
}

function HostFinished({ players }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ fontSize: 28, fontWeight: 'bold', color: '#fbbf24', marginBottom: 24 }}>Game Over!</div>
      {sorted.map((p, i) => (
        <div key={p.name} style={{ background: '#1e293b', borderRadius: 8, padding: '12px 24px', margin: '8px auto', maxWidth: 320, display: 'flex', justifyContent: 'space-between' }}>
          <span>{i === 0 ? '🏆 ' : ''}{p.name}</span>
          <span style={{ fontWeight: 'bold', color: p.score >= 0 ? '#4ade80' : '#f87171' }}>
            {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function HostBetweenRounds({ game }) {
  const sorted = [...(game.players || [])].sort((a, b) => b.score - a.score);
  return (
    <div style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ fontSize: 32, fontWeight: 'bold', color: '#fbbf24', marginBottom: 8, letterSpacing: 2 }}>DOUBLE JEOPARDY</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Round 1 complete</div>
      {sorted.map((p, i) => (
        <div key={p.name} style={{ background: '#1e293b', borderRadius: 8, padding: '10px 20px', margin: '6px auto', maxWidth: 300, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#e2e8f0' }}>{i === 0 ? '👑 ' : ''}{p.name}</span>
          <span style={{ fontWeight: 'bold', color: p.score >= 0 ? '#4ade80' : '#f87171' }}>
            {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
          </span>
        </div>
      ))}
      <button
        onClick={() => socket.emit('host:startRound2')}
        style={{ marginTop: 24, padding: '14px 40px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>
        Start Round 2 →
      </button>
    </div>
  );
}

function HostFinalWager({ game }) {
  const submitted = game.wagersSubmitted || [];
  const total = (game.players || []).length;
  return (
    <div style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ fontSize: 28, fontWeight: 'bold', color: '#fbbf24', marginBottom: 8 }}>FINAL JEOPARDY</div>
      <div style={{ fontSize: 18, color: '#e2e8f0', marginBottom: 4 }}>{game.fjCategory}</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Place your wagers!</div>
      <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 16 }}>{submitted.length}/{total} submitted</div>
      {(game.players || []).map(p => (
        <div key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1e293b', borderRadius: 20, padding: '6px 14px', margin: 4 }}>
          <span style={{ color: submitted.includes(p.name) ? '#4ade80' : '#94a3b8' }}>
            {submitted.includes(p.name) ? '✓' : '⏳'}
          </span>
          <span style={{ color: '#e2e8f0', fontSize: 13 }}>{p.name}</span>
        </div>
      ))}
      <div style={{ marginTop: 24 }}>
        <button
          onClick={() => socket.emit('host:closeWagers')}
          style={{ padding: '10px 24px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          Close Wagers (force)
        </button>
      </div>
    </div>
  );
}

function HostFinalClue({ game }) {
  const submitted = game.answersSubmitted || [];
  const total = (game.players || []).length;
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 11, color: '#a5b4fc', marginBottom: 6 }}>{game.fjCategory}</div>
      <div style={{ background: '#0f172a', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: '#e2e8f0' }}>{game.fjClue}</div>
      </div>
      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>Answers: {submitted.length}/{total}</div>
      {(game.players || []).map(p => (
        <div key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1e293b', borderRadius: 20, padding: '6px 14px', margin: 4 }}>
          <span style={{ color: submitted.includes(p.name) ? '#4ade80' : '#94a3b8' }}>
            {submitted.includes(p.name) ? '✓' : '⏳'}
          </span>
          <span style={{ color: '#e2e8f0', fontSize: 13 }}>{p.name}</span>
        </div>
      ))}
      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => socket.emit('host:closeAnswers')}
          style={{ padding: '10px 24px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          Close Answers (force)
        </button>
      </div>
    </div>
  );
}

function HostFinalJudging({ game, judgments, onJudge }) {
  const answers = game.fjAnswers || [];
  const allJudged = answers.length > 0 && answers.every(a => judgments[a.playerName] !== undefined);
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24', marginBottom: 20 }}>Judge Final Answers</div>
      {answers.map(({ playerName, answer }) => (
        <div key={playerName} style={{ background: '#1e293b', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontWeight: 'bold', color: '#e2e8f0', marginBottom: 6 }}>{playerName}</div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 10, fontStyle: 'italic' }}>{answer || '(blank)'}</div>
          {judgments[playerName] === undefined ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onJudge(playerName, true)}
                style={{ flex: 1, padding: 10, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                ✓ Correct
              </button>
              <button onClick={() => onJudge(playerName, false)}
                style={{ flex: 1, padding: 10, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                ✗ Incorrect
              </button>
            </div>
          ) : (
            <div style={{ color: judgments[playerName] ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
              {judgments[playerName] ? '✓ Correct' : '✗ Incorrect'}
            </div>
          )}
        </div>
      ))}
      {allJudged && <div style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>All judged — waiting for server...</div>}
    </div>
  );
}

function HostFinalReveal({ game }) {
  const revealed = game.revealedPlayers || [];
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fbbf24', marginBottom: 20 }}>Final Jeopardy Reveal</div>
      {revealed.map(({ playerName, wager, answer, correct }) => (
        <div key={playerName} style={{ background: '#1e293b', borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}>
          <div style={{ fontWeight: 'bold', color: '#e2e8f0', marginBottom: 4 }}>{playerName}</div>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>Wager: ${wager}</div>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>Answer: {answer || '(blank)'}</div>
          <div style={{ color: correct ? '#4ade80' : '#f87171', fontWeight: 'bold', marginTop: 4 }}>{correct ? `+$${wager}` : `-$${wager}`}</div>
        </div>
      ))}
      <button
        onClick={() => socket.emit('host:revealNext')}
        style={{ marginTop: 16, padding: '12px 32px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
        Reveal Next →
      </button>
    </div>
  );
}
