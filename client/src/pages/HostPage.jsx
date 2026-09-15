import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import socket from '../socket';
import GameBoard from '../components/GameBoard';
import ScoreBar from '../components/ScoreBar';
import ClueMedia from '../components/ClueMedia';
import NavBreadcrumb from '../components/NavBreadcrumb';

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
      socket.on('host:joined', state => {
        setGame(state);
        setJudgments(state.finalJudgments || {});
      });
      socket.on('host:state', state => setGame(state));
      socket.on('game:playerJoined', ({ players }) => setGame(g => ({ ...g, players })));
      socket.on('game:started', ({ players, currentPicker, currentRound }) =>
        setGame(g => ({ ...g, phase: 'board', players, currentPicker, currentRound: currentRound || 1, revealedClues: [], currentClue: null })));
      socket.on('host:clue', clue => setGame(g => ({ ...g, phase: 'clue', currentClue: clue, buzzedBy: null, answerRevealed: false, buzzerState: 'locked', videoPlayed: false })));
      socket.on('game:wrongAnswer', ({ players, buzzedPlayers }) => setGame(g => ({ ...g, phase: 'clue', buzzedBy: null, buzzerState: 'locked', players, buzzedPlayers: buzzedPlayers || [] })));
      socket.on('game:buzzersOpen', () => setGame(g => ({ ...g, buzzerState: 'open' })));
      socket.on('game:buzzClaimed', ({ playerName }) => setGame(g => ({ ...g, phase: 'judging', buzzedBy: playerName })));
      socket.on('game:scored', ({ players, currentPicker, revealedClues, currentRound }) =>
        setGame(g => ({ ...g, phase: 'board', players, currentPicker, revealedClues, currentRound: currentRound || g.currentRound, currentClue: null, buzzedBy: null, answerRevealed: false })));
      socket.on('game:clueSkipped', ({ revealedClues, currentPicker }) =>
        setGame(g => ({ ...g, phase: 'board', revealedClues, currentPicker, currentClue: null, answerRevealed: false })));
      socket.on('game:answerRevealed', () => setGame(g => ({ ...g, answerRevealed: true })));
      socket.on('game:finished', ({ players }) => setGame(g => ({ ...g, phase: 'finished', players })));
      socket.on('game:betweenRounds', ({ players }) =>
        setGame(g => ({ ...g, phase: 'between-rounds', players })));
      socket.on('game:round2Started', ({ currentRound, categoryNames, currentPicker, players }) =>
        setGame(g => ({ ...g, phase: 'board', currentRound, categoryNames, currentPicker, players, revealedClues: [] })));
      socket.on('game:finalWager', ({ category }) =>
        setGame(g => ({ ...g, phase: 'final-wager', fjCategory: category, wagersSubmitted: [] })));
      socket.on('game:wagerSubmitted', ({ playerName }) =>
        setGame(g => ({ ...g, wagersSubmitted: [...(g.wagersSubmitted || []), playerName] })));
      socket.on('game:finalClue', ({ category, clue, type, mediaUrl }) =>
        setGame(g => ({ ...g, phase: 'final-clue', fjCategory: category, fjClue: clue, fjType: type || 'regular', fjMediaUrl: mediaUrl || null, answersSubmitted: [], videoPlayed: false })));
      socket.on('game:answerSubmitted', ({ playerName }) =>
        setGame(g => ({ ...g, answersSubmitted: [...(g.answersSubmitted || []), playerName] })));
      socket.on('game:finalJudgingReady', ({ answers, fjAnswerImage }) =>
        setGame(g => ({ ...g, phase: 'final-judging', fjAnswers: answers, fjAnswerImage: fjAnswerImage || null })));
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

  if (error) return <div style={{ padding: 40, color: 'var(--color-red)' }}>{error}</div>;
  if (!game || !board) return <div style={{ padding: 40, color: 'var(--color-muted)' }}>Connecting...</div>;

  const phase = game.phase;

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ textAlign: 'right', marginBottom: 12 }}>
        <a
          href={`/display/${gameCode}`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 13, color: 'var(--color-label)', textDecoration: 'none', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '6px 12px' }}
        >
          Open TV Display ↗
        </a>
      </div>
      {phase === 'lobby' && <HostLobby game={game} gameCode={gameCode} boardName={board.name} />}
      {phase === 'board' && <HostBoard game={game} gameCode={gameCode} board={board} />}
      {(phase === 'clue' || phase === 'judging') && (
        <HostClue
          game={game}
          board={board}
          onPlayVideo={() => {
            socket.emit('host:playVideo');
            setGame(g => ({ ...g, videoPlayed: true }));
          }}
        />
      )}
      {phase === 'finished' && <HostFinished players={game.players} />}
      {phase === 'between-rounds' && <HostBetweenRounds game={game} />}
      {phase === 'final-wager' && <HostFinalWager game={game} />}
      {phase === 'final-clue' && <HostFinalClue
        game={game}
        onPlayVideo={() => {
          socket.emit('host:playVideo');
          setGame(g => ({ ...g, videoPlayed: true }));
        }}
      />}
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
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--color-muted)', letterSpacing: 3, marginBottom: 6 }}>GAME CODE</div>
        <div style={{ fontSize: 40, fontWeight: 'bold', color: 'var(--color-amber)', letterSpacing: 8 }}>{gameCode}</div>
        <div style={{ fontSize: 12, color: 'var(--color-label)', marginTop: 6 }}>Board: {boardName}</div>
      </div>
      <div style={{ marginBottom: 16 }}>
        {(game.players || []).map(p => (
          <div key={p.name} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-white)' }}>{p.name}</span>
            <span style={{ fontSize: 11, color: 'var(--color-green)' }}>● connected</span>
          </div>
        ))}
      </div>
      <button
        disabled={(game.players || []).length < 2}
        onClick={() => socket.emit('host:startGame', { gameCode })}
        style={{ width: '100%', padding: 16, background: (game.players || []).length >= 2 ? '#16a34a' : 'var(--bg-panel)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: (game.players || []).length >= 2 ? 'pointer' : 'not-allowed' }}
      >
        ▶ Start Game {(game.players || []).length < 2 ? '(need 2+ players)' : ''}
      </button>
    </div>
  );
}

function HostBoard({ game, gameCode, board }) {
  const currentRound = game.currentRound || 1;
  const categoryNames = board[`round${currentRound}`].categories.map(c => c.name);
  return (
    <div>
      <div style={{ background: 'var(--color-amber)', color: '#0a0a0a', borderRadius: 8, padding: '8px 14px', textAlign: 'center', fontWeight: 'bold', marginBottom: 12 }}>
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

function HostClue({ game, board, onPlayVideo }) {
  const { currentClue, phase, buzzedBy, players, buzzerState, answerRevealed } = game;
  const currentRound = game.currentRound || 1;
  const currentCategories = board[`round${currentRound}`].categories;
  const clueData = currentClue && currentCategories[currentClue.categoryIndex]?.clues[currentClue.clueIndex];
  const clueValue = currentClue ? (currentClue.clueIndex + 1) * (currentRound === 1 ? 200 : 400) : 0;

  return (
    <div>
      {buzzedBy && (
        <div style={{ background: 'var(--color-amber)', borderRadius: 8, padding: '10px 14px', textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 'bold', fontSize: 16, color: '#0a0a0a' }}>{buzzedBy}</div>
          <div style={{ fontSize: 11, color: '#78350f', letterSpacing: 1 }}>IS ANSWERING</div>
        </div>
      )}
      {clueData && (
        <>
          <div style={{ fontSize: 11, color: 'var(--color-label)', letterSpacing: 2, marginBottom: 6 }}>
            {currentCategories[currentClue.categoryIndex].name} · ${clueValue}
          </div>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: 1, marginBottom: 4 }}>CLUE</div>
            <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--color-white)' }}>{clueData.question}</div>
            <ClueMedia type={clueData.type} mediaUrl={clueData.mediaUrl} compact />
          </div>
          <div style={{ background: '#0a1f0f', border: '1px solid #16a34a', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--color-green)', letterSpacing: 1, marginBottom: 4 }}>ANSWER</div>
            <div style={{ fontSize: 17, fontWeight: 'bold', color: 'var(--color-green)' }}>{clueData.answer}</div>
            {clueData.answerImage && (
              <img src={clueData.answerImage} alt="answer" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, marginTop: 8, display: 'block' }} />
            )}
          </div>
        </>
      )}
      {phase === 'clue' && !buzzedBy && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {['video', 'audio'].includes(clueData?.type) && (
            <button
              onClick={onPlayVideo}
              disabled={game.videoPlayed}
              style={{ flex: '1 1 100%', padding: 12, background: game.videoPlayed ? 'var(--bg-surface)' : '#7c3aed', color: game.videoPlayed ? 'var(--color-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 'bold', cursor: game.videoPlayed ? 'not-allowed' : 'pointer' }}>
              {clueData.type === 'audio'
                ? game.videoPlayed ? '✓ Audio Playing on Display' : '🔊 Play Audio on Display'
                : game.videoPlayed ? '✓ Video Playing on Display' : '▶ Play Video on Display'}
            </button>
          )}
          {buzzerState !== 'open' && (
            <button onClick={() => socket.emit('host:unlock')}
              style={{ flex: 1, padding: 14, background: 'var(--bg-panel)', border: '2px solid var(--color-green)', color: 'var(--color-green)', borderRadius: 8, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
              🔓 Unlock Buzzers
            </button>
          )}
          <button onClick={() => socket.emit('host:skipClue')}
            style={{ padding: '14px 18px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--color-muted)', borderRadius: 8, cursor: 'pointer' }}>
            Skip
          </button>
        </div>
      )}
      {phase === 'judging' && clueData && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => socket.emit('host:revealAnswer')}
            disabled={answerRevealed}
            style={{ width: '100%', padding: '10px 0', background: answerRevealed ? 'var(--bg-surface)' : '#7c3aed', color: answerRevealed ? 'var(--color-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 'bold', cursor: answerRevealed ? 'not-allowed' : 'pointer', marginBottom: 4 }}>
            {answerRevealed ? '✓ Answer Revealed' : 'Reveal Answer on Display'}
          </button>
          <button onClick={() => socket.emit('host:judge', { result: 'correct' })}
            style={{ flex: 1, padding: 16, background: '#14532d', border: '2px solid #16a34a', color: 'var(--color-green)', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', lineHeight: 1.3 }}>
            ✓ Correct<br /><span style={{ fontSize: 11, fontWeight: 'normal' }}>+${clueValue}</span>
          </button>
          <button onClick={() => socket.emit('host:judge', { result: 'incorrect' })}
            style={{ flex: 1, padding: 16, background: '#450a0a', border: '2px solid #b91c1c', color: 'var(--color-red)', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', lineHeight: 1.3 }}>
            ✗ Incorrect<br /><span style={{ fontSize: 11, fontWeight: 'normal' }}>-${clueValue}</span>
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
      <NavBreadcrumb />
      <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--color-amber)', marginBottom: 24 }}>Game Over!</div>
      {sorted.map((p, i) => (
        <div key={p.name} style={{ background: 'var(--bg-panel)', borderRadius: 8, padding: '12px 24px', margin: '8px auto', maxWidth: 320, display: 'flex', justifyContent: 'space-between' }}>
          <span>{i === 0 ? '🏆 ' : ''}{p.name}</span>
          <span style={{ fontWeight: 'bold', color: p.score >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
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
      <div style={{ fontSize: 32, fontWeight: 'bold', color: 'var(--color-amber)', marginBottom: 8, letterSpacing: 2 }}>DOUBLE JEOPARDY</div>
      <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 24 }}>Round 1 complete</div>
      {sorted.map((p, i) => (
        <div key={p.name} style={{ background: 'var(--bg-panel)', borderRadius: 8, padding: '10px 20px', margin: '6px auto', maxWidth: 300, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--color-white)' }}>{i === 0 ? '👑 ' : ''}{p.name}</span>
          <span style={{ fontWeight: 'bold', color: p.score >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
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
      <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--color-amber)', marginBottom: 8 }}>FINAL JEOPARDY</div>
      <div style={{ fontSize: 18, color: 'var(--color-white)', marginBottom: 4 }}>{game.fjCategory}</div>
      <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 24 }}>Place your wagers!</div>
      <div style={{ fontSize: 14, color: 'var(--color-muted)', marginBottom: 16 }}>{submitted.length}/{total} submitted</div>
      {(game.players || []).map(p => (
        <div key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-panel)', borderRadius: 20, padding: '6px 14px', margin: 4 }}>
          <span style={{ color: submitted.includes(p.name) ? 'var(--color-green)' : 'var(--color-muted)' }}>
            {submitted.includes(p.name) ? '✓' : '⏳'}
          </span>
          <span style={{ color: 'var(--color-white)', fontSize: 13 }}>{p.name}</span>
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

function HostFinalClue({ game, onPlayVideo }) {
  const submitted = game.answersSubmitted || [];
  const total = (game.players || []).length;
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 11, color: 'var(--color-label)', marginBottom: 6 }}>{game.fjCategory}</div>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--color-white)' }}>{game.fjClue}</div>
        <ClueMedia type={game.fjType} mediaUrl={game.fjMediaUrl} compact />
      </div>
      {['video', 'audio'].includes(game.fjType) && (
        <button
          onClick={onPlayVideo}
          disabled={game.videoPlayed}
          style={{ width: '100%', padding: 12, background: game.videoPlayed ? 'var(--bg-surface)' : '#7c3aed', color: game.videoPlayed ? 'var(--color-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 'bold', cursor: game.videoPlayed ? 'not-allowed' : 'pointer', marginBottom: 8 }}>
          {game.fjType === 'audio'
            ? game.videoPlayed ? '✓ Audio Playing on Display' : '🔊 Play Audio on Display'
            : game.videoPlayed ? '✓ Video Playing on Display' : '▶ Play Video on Display'}
        </button>
      )}
      <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>Answers: {submitted.length}/{total}</div>
      {(game.players || []).map(p => (
        <div key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-panel)', borderRadius: 20, padding: '6px 14px', margin: 4 }}>
          <span style={{ color: submitted.includes(p.name) ? 'var(--color-green)' : 'var(--color-muted)' }}>
            {submitted.includes(p.name) ? '✓' : '⏳'}
          </span>
          <span style={{ color: 'var(--color-white)', fontSize: 13 }}>{p.name}</span>
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
      <div style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--color-amber)', marginBottom: 20 }}>Judge Final Answers</div>
      {game.fjAnswerImage && (
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 6 }}>ANSWER IMAGE</div>
          <img src={game.fjAnswerImage} alt="FJ answer" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8 }} />
        </div>
      )}
      {answers.map(({ playerName, answer }) => (
        <div key={playerName} style={{ background: 'var(--bg-panel)', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontWeight: 'bold', color: 'var(--color-white)', marginBottom: 6 }}>{playerName}</div>
          <div style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 10, fontStyle: 'italic' }}>{answer || '(blank)'}</div>
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
            <div style={{ color: judgments[playerName] ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 'bold' }}>
              {judgments[playerName] ? '✓ Correct' : '✗ Incorrect'}
            </div>
          )}
        </div>
      ))}
      {allJudged && <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 8 }}>All judged — waiting for server...</div>}
    </div>
  );
}

function HostFinalReveal({ game }) {
  const revealed = game.revealedPlayers || [];
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--color-amber)', marginBottom: 20 }}>Final Jeopardy Reveal</div>
      {revealed.map(({ playerName, wager, answer, correct }) => (
        <div key={playerName} style={{ background: 'var(--bg-panel)', borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}>
          <div style={{ fontWeight: 'bold', color: 'var(--color-white)', marginBottom: 4 }}>{playerName}</div>
          <div style={{ color: 'var(--color-muted)', fontSize: 12 }}>Wager: ${wager}</div>
          <div style={{ color: 'var(--color-muted)', fontSize: 12 }}>Answer: {answer || '(blank)'}</div>
          <div style={{ color: correct ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 'bold', marginTop: 4 }}>{correct ? `+$${wager}` : `-$${wager}`}</div>
        </div>
      ))}
      <button
        onClick={() => socket.emit('host:revealNext')}
        style={{ marginTop: 16, padding: '12px 32px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
        Reveal Next ({revealed.length + 1} of {(game.players || []).length}) →
      </button>
    </div>
  );
}
