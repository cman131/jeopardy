import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import socket from '../socket';
import GameBoard from '../components/GameBoard';
import ScoreBar from '../components/ScoreBar';
import ClueMedia from '../components/ClueMedia';
import QRCode from 'react-qr-code';

export default function DisplayPage() {
  const { gameCode } = useParams();
  const [game, setGame] = useState(null);
  const [hostConnected, setHostConnected] = useState(true);
  const [revealCats, setRevealCats] = useState(null);
  const [revealStep, setRevealStep] = useState(0);

  useEffect(() => {
    socket.connect();
    socket.emit('display:join', { gameCode });

    socket.on('display:joined', state => setGame({ ...state, board: { categoryNames: state.categoryNames } }));
    socket.on('game:playerJoined', ({ players }) => setGame(g => ({ ...g, players })));
    socket.on('game:started', ({ board, players, currentPicker, currentRound }) => {
      setGame({ phase: 'board', board, players, currentPicker, currentRound: currentRound || 1, revealedClues: [], currentClue: null, buzzedBy: null });
      setRevealCats(board.categoryNames);
      setRevealStep(0);
    });
    socket.on('game:clueRevealed', clue =>
      setGame(g => ({ ...g, phase: 'clue', currentClue: clue, buzzedBy: null, buzzerState: 'locked', answerRevealed: false, revealedAnswer: null, revealedAnswerImage: null, videoPlaying: false })));
    socket.on('game:wrongAnswer', ({ players }) =>
      setGame(g => ({ ...g, phase: 'clue', buzzedBy: null, buzzerState: 'open', players })));
    socket.on('game:videoPlay', () => setGame(g => ({ ...g, videoPlaying: true })));
    socket.on('game:buzzersOpen', () => setGame(g => ({ ...g, buzzerState: 'open' })));
    socket.on('game:buzzClaimed', ({ playerName }) => setGame(g => ({ ...g, phase: 'judging', buzzedBy: playerName, buzzerState: 'claimed' })));
    socket.on('game:boardReady', ({ players }) => setGame(g => ({ ...g, players })));
    socket.on('game:scored', ({ players, currentPicker, revealedClues, currentRound }) =>
      setGame(g => ({ ...g, phase: 'board', players, currentPicker, revealedClues, currentRound: currentRound || g.currentRound, currentClue: null, buzzedBy: null, answerRevealed: false, revealedAnswer: null, revealedAnswerImage: null })));
    socket.on('game:answerRevealed', ({ answer, answerImage }) =>
      setGame(g => ({ ...g, answerRevealed: true, revealedAnswer: answer, revealedAnswerImage: answerImage })));
    socket.on('game:finished', ({ players }) => setGame(g => ({ ...g, phase: 'finished', players })));
    socket.on('error:gameNotFound', () => setGame('notfound'));
    socket.on('host:disconnected', () => setHostConnected(false));
    socket.on('host:reconnected', () => setHostConnected(true));

    socket.on('game:betweenRounds', ({ players }) =>
      setGame(g => ({ ...g, phase: 'between-rounds', players })));
    socket.on('game:round2Started', ({ currentRound, categoryNames, currentPicker, players }) => {
      setGame(g => ({ ...g, phase: 'board', currentRound, board: { ...g.board, categoryNames }, currentPicker, players, revealedClues: [] }));
      setRevealCats(categoryNames);
      setRevealStep(0);
    });
    socket.on('game:categoryRevealed', () => setRevealStep(s => s + 1));
    socket.on('game:finalWager', ({ category }) =>
      setGame(g => ({ ...g, phase: 'final-wager', fjCategory: category, wagersSubmitted: [] })));
    socket.on('game:wagerSubmitted', ({ playerName }) =>
      setGame(g => ({ ...g, wagersSubmitted: [...(g.wagersSubmitted || []), playerName] })));
    socket.on('game:finalClue', ({ category, clue, type, mediaUrl }) =>
      setGame(g => ({ ...g, phase: 'final-clue', fjCategory: category, fjClue: clue, fjType: type || 'regular', fjMediaUrl: mediaUrl || null, answersSubmitted: [], videoPlaying: false })));
    socket.on('game:answerSubmitted', ({ playerName }) =>
      setGame(g => ({ ...g, answersSubmitted: [...(g.answersSubmitted || []), playerName] })));
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
  }, [gameCode]);

  if (!game) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)' }}>Connecting...</div>;
  if (game === 'notfound') return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-red)' }}>Game not found: {gameCode}</div>;

  if (game.phase === 'lobby') return <LobbyDisplay game={game} gameCode={gameCode} />;
  if (game.phase === 'finished') return <FinishedDisplay players={game.players} />;

  return (
    <div style={{ padding: 16, minHeight: '100vh', background: 'var(--bg-deep)' }}>
      {!hostConnected && (
        <div style={{ background: '#dc2626', color: '#fff', textAlign: 'center', padding: 8, marginBottom: 12, borderRadius: 6 }}>
          Host disconnected — waiting to reconnect...
        </div>
      )}
      {game.phase === 'board' && revealCats && revealStep <= revealCats.length && (
        <CategoryRevealDisplay categories={revealCats} step={revealStep} round={game.currentRound || 1} />
      )}
      {game.phase === 'board' && !(revealCats && revealStep <= revealCats.length) && (
        <>
          <GameBoard categoryNames={game.board?.categoryNames || []} revealedClues={game.revealedClues} activeClue={game.currentClue} round={game.currentRound || 1} />
          <ScoreBar players={game.players} currentPicker={game.currentPicker} />
        </>
      )}
      {(game.phase === 'clue' || game.phase === 'judging') && (
        <ClueDisplay game={game} />
      )}
      {game.phase === 'between-rounds' && <DisplayBetweenRounds game={game} />}
      {game.phase === 'final-wager' && <DisplayFinalWager game={game} />}
      {game.phase === 'final-clue' && <DisplayFinalClue game={game} />}
      {game.phase === 'final-judging' && <DisplayFinalJudging />}
      {game.phase === 'final-reveal' && <DisplayFinalReveal game={game} />}
    </div>
  );
}

function LobbyDisplay({ game, gameCode }) {
  const joinUrl = `${window.location.origin}/play/${gameCode}`;
  const displayUrl = `${window.location.host}/play/${gameCode}`;

  return (
    <div style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ fontSize: 48, fontWeight: 'bold', color: 'var(--color-amber)', letterSpacing: 6, marginBottom: 8 }}>JEOPARDY!</div>
      <div style={{ fontSize: 14, color: 'var(--color-muted)', marginBottom: 32 }}>Join at this device's address</div>
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', justifyContent: 'center' }}>
        <div style={{ background: 'var(--bg-panel)', border: '3px solid var(--border-accent)', borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ background: '#fff', padding: 12, borderRadius: 8, display: 'inline-block' }}>
            <QRCode value={joinUrl} size={160} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', letterSpacing: 2, marginTop: 12 }}>SCAN TO JOIN</div>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>{displayUrl}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ background: 'var(--bg-panel)', border: '3px solid var(--border-accent)', borderRadius: 16, padding: '24px 48px' }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', letterSpacing: 3, marginBottom: 8 }}>GAME CODE</div>
            <div style={{ fontSize: 56, fontWeight: 'bold', color: 'var(--color-amber)', letterSpacing: 12 }}>{gameCode}</div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>PLAYERS JOINED</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {(game.players || []).map(p => (
              <div key={p.name} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 20px', fontSize: 16, fontWeight: 'bold', color: 'var(--color-white)' }}>{p.name}</div>
            ))}
            {(!game.players || game.players.length === 0) && <div style={{ color: 'var(--color-muted)' }}>Waiting for players...</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClueDisplay({ game }) {
  const { currentClue, phase, buzzedBy, buzzerState, answerRevealed, revealedAnswer, revealedAnswerImage, videoPlaying } = game;
  const categoryName = game.board?.categoryNames?.[currentClue?.categoryIndex] ?? '';
  const isBuzzedIn = phase === 'judging' && buzzedBy;

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
      border: isBuzzedIn ? '3px solid var(--border-accent)' : '3px solid transparent',
    }}>
      {isBuzzedIn ? (
        <>
          {categoryName && currentClue && (
            <div style={{ fontSize: 11, color: 'var(--color-label)', letterSpacing: 3, marginBottom: 20 }}>
              {categoryName} · ${currentClue.value}
            </div>
          )}
          <div style={{ fontSize: 72, fontWeight: 900, color: 'var(--color-amber)', letterSpacing: 4, lineHeight: 1 }}>
            {buzzedBy.toUpperCase()}
          </div>
          <div style={{ fontSize: 12, color: '#92400e', letterSpacing: 3, marginTop: 10 }}>BUZZED IN</div>
          {currentClue && (
            <div style={{ marginTop: 28, fontSize: 15, color: 'var(--color-muted)', fontStyle: 'italic', maxWidth: 640 }}>
              {currentClue.question}
            </div>
          )}
        </>
      ) : (
        <>
          {currentClue && (
            <>
              <div style={{
                fontSize: 11,
                color: 'var(--color-label)',
                letterSpacing: 3,
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: 12,
                marginBottom: 24,
                width: '100%',
                maxWidth: 720,
              }}>
                {categoryName}
              </div>
              <div style={{ fontSize: 32, fontWeight: 'bold', lineHeight: 1.5, maxWidth: 720, marginBottom: 20, color: 'var(--color-white)' }}>
                {currentClue.question}
              </div>
              <ClueMedia type={currentClue.type} mediaUrl={currentClue.mediaUrl} mediaReady={['video', 'audio'].includes(currentClue.type) ? videoPlaying : true} />
              {answerRevealed && (
                <div style={{ marginTop: 24, padding: '16px 24px', background: 'var(--bg-surface)', borderRadius: 10, display: 'inline-block' }}>
                  <div style={{ fontSize: 22, color: 'var(--color-green)', fontWeight: 'bold', marginBottom: revealedAnswerImage ? 12 : 0 }}>
                    {revealedAnswer}
                  </div>
                  {revealedAnswerImage && (
                    <img src={revealedAnswerImage} alt="answer" style={{ maxWidth: 480, maxHeight: 320, borderRadius: 8, display: 'block', margin: '0 auto' }} />
                  )}
                </div>
              )}
              <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '4px 16px', marginTop: 20 }}>
                <span style={{ fontSize: 11, color: 'var(--color-label)', letterSpacing: 1 }}>${currentClue.value}</span>
              </div>
            </>
          )}
          {phase === 'clue' && (
            <div style={{ marginTop: 24, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--bg-panel)', border: `1px solid ${buzzerState === 'open' ? 'var(--color-green)' : 'var(--border-subtle)'}`, borderRadius: 20, padding: '6px 16px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: buzzerState === 'open' ? 'var(--color-green)' : 'var(--color-red)' }} />
              <span style={{ fontSize: 13, color: buzzerState === 'open' ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 'bold', letterSpacing: 1 }}>
                {buzzerState === 'open' ? 'BUZZERS OPEN' : 'BUZZERS LOCKED'}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FinishedDisplay({ players }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ fontSize: 36, fontWeight: 'bold', color: 'var(--color-amber)', marginBottom: 32 }}>GAME OVER</div>
      {sorted.map((p, i) => (
        <div key={p.name} style={{ background: i === 0 ? 'var(--bg-panel)' : 'var(--bg-surface)', border: i === 0 ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)', borderRadius: 8, padding: '12px 32px', margin: '8px auto', maxWidth: 300, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 18, color: 'var(--color-white)' }}>{i === 0 ? '🏆 ' : ''}{p.name}</span>
          <span style={{ fontSize: 18, fontWeight: 'bold', color: p.score >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
            {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function DisplayBetweenRounds({ game }) {
  const sorted = [...(game.players || [])].sort((a, b) => b.score - a.score);
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 56, fontWeight: 'bold', color: 'var(--color-amber)', letterSpacing: 4, marginBottom: 40 }}>DOUBLE JEOPARDY</div>
      {sorted.map((p, i) => (
        <div key={p.name} style={{ fontSize: 24, display: 'flex', justifyContent: 'center', gap: 40, padding: '10px 0' }}>
          <span style={{ color: i === 0 ? 'var(--color-amber)' : 'var(--color-white)' }}>{i === 0 ? '👑 ' : ''}{p.name}</span>
          <span style={{ fontWeight: 'bold', color: p.score >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
            {p.score < 0 ? `-$${Math.abs(p.score)}` : `$${p.score}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function DisplayFinalWager({ game }) {
  const submitted = game.wagersSubmitted || [];
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 40, fontWeight: 'bold', color: 'var(--color-amber)', marginBottom: 16, letterSpacing: 4 }}>FINAL JEOPARDY</div>
      <div style={{ width: 48, height: 1, background: 'var(--border-subtle)', margin: '0 auto 16px' }} />
      <div style={{ fontSize: 28, color: 'var(--color-white)', marginBottom: 8 }}>{game.fjCategory}</div>
      <div style={{ fontSize: 18, color: 'var(--color-muted)', marginBottom: 32 }}>Place your wagers!</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        {(game.players || []).map(p => (
          <div key={p.name} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: submitted.includes(p.name) ? 'var(--color-green)' : 'var(--color-muted)', fontSize: 18 }}>
              {submitted.includes(p.name) ? '✓' : '⏳'}
            </span>
            <span style={{ color: submitted.includes(p.name) ? 'var(--color-white)' : 'var(--color-muted)', fontSize: 16 }}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DisplayFinalClue({ game }) {
  const submitted = game.answersSubmitted || [];
  return (
    <div style={{ padding: 60, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ fontSize: 22, color: 'var(--color-label)', marginBottom: 16, textAlign: 'center', letterSpacing: 2 }}>{game.fjCategory}</div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 32, marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 24, lineHeight: 1.6, color: 'var(--color-white)' }}>{game.fjClue}</div>
        <ClueMedia type={game.fjType} mediaUrl={game.fjMediaUrl} mediaReady={['video', 'audio'].includes(game.fjType) ? game.videoPlaying : true} />
      </div>
      <div style={{ textAlign: 'center', color: 'var(--color-muted)', marginBottom: 20, fontSize: 16 }}>Write your answers!</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        {(game.players || []).map(p => (
          <div key={p.name} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: submitted.includes(p.name) ? 'var(--color-green)' : 'var(--color-muted)', fontSize: 18 }}>
              {submitted.includes(p.name) ? '✓' : '⏳'}
            </span>
            <span style={{ color: submitted.includes(p.name) ? 'var(--color-white)' : 'var(--color-muted)', fontSize: 16 }}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DisplayFinalJudging() {
  return (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <div style={{ fontSize: 32, color: 'var(--color-muted)' }}>Judging in progress...</div>
    </div>
  );
}

function DisplayFinalReveal({ game }) {
  const revealed = game.revealedPlayers || [];
  return (
    <div style={{ padding: 40, maxWidth: 700, margin: '0 auto' }}>
      <div style={{ fontSize: 32, fontWeight: 'bold', color: 'var(--color-amber)', textAlign: 'center', marginBottom: 32, letterSpacing: 4 }}>FINAL JEOPARDY</div>
      {revealed.map(({ playerName, wager, answer, correct }) => {
        const player = (game.players || []).find(p => p.name === playerName);
        return (
          <RevealCard key={playerName} playerName={playerName} wager={wager} answer={answer} correct={correct} finalScore={player?.score} />
        );
      })}
    </div>
  );
}

function RevealCard({ playerName, wager, answer, correct, finalScore }) {
  const [showWager, setShowWager] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showTotal, setShowTotal] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowWager(true), 400);
    const t2 = setTimeout(() => setShowAnswer(true), 1400);
    const t3 = setTimeout(() => setShowResult(true), 2400);
    const t4 = setTimeout(() => setShowTotal(true), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 24px', marginBottom: 16 }}>
      <div style={{ fontWeight: 'bold', fontSize: 20, color: 'var(--color-white)', marginBottom: 8 }}>{playerName}</div>
      {showWager && <div style={{ color: 'var(--color-label)', fontSize: 16, marginBottom: 4 }}>Wager: ${wager}</div>}
      {showAnswer && <div style={{ color: 'var(--color-white)', fontSize: 16, marginBottom: 4, fontStyle: 'italic' }}>{answer || '(blank)'}</div>}
      {showResult && (
        <div style={{ color: correct ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 'bold', fontSize: 20 }}>
          {correct ? `+$${wager}` : `-$${wager}`}
        </div>
      )}
      {showTotal && finalScore !== undefined && (
        <div style={{ color: 'var(--color-amber)', fontSize: 16, marginTop: 4 }}>
          Total: {finalScore < 0 ? `-$${Math.abs(finalScore)}` : `$${finalScore}`}
        </div>
      )}
    </div>
  );
}

function CategoryRevealDisplay({ categories, step, round }) {
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
