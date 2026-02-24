import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const PALETTE = ["red", "yellow", "green", "blue"];
const MAX_ROWS = 8;
const COLS = 4;

function createEmptyGuesses() {
  return Array.from({ length: MAX_ROWS }, () => Array.from({ length: COLS }, () => null));
}

function createEmptyChecks() {
  return Array.from({ length: MAX_ROWS }, () => 0);
}

function randomCode() {
  return Array.from({ length: COLS }, () => PALETTE[Math.floor(Math.random() * PALETTE.length)]);
}

function formatCode(code) {
  return `[${code.join(", ")}]`;
}

export default function App() {
  const rows = useMemo(() => Array.from({ length: MAX_ROWS }, (_, i) => i), []);
  const cols = useMemo(() => Array.from({ length: COLS }, (_, i) => i), []);

  const [level, setLevel] = useState(1);
  const [started, setStarted] = useState(false);
  const [message, setMessage] = useState("Ready");
  const [secret, setSecret] = useState([]);
  const [guesses, setGuesses] = useState(createEmptyGuesses);
  const [checks, setChecks] = useState(createEmptyChecks);
  const [currentRow, setCurrentRow] = useState(0);
  const [currentCol, setCurrentCol] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [scoreName, setScoreName] = useState("");
  const [scoreSubmitting, setScoreSubmitting] = useState(false);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [scoreMessage, setScoreMessage] = useState("");
  const [scoreRecordId, setScoreRecordId] = useState(null);
  const [scoreRecordLevel, setScoreRecordLevel] = useState(null);
  const [scoreLookupDone, setScoreLookupDone] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingMessage, setRankingMessage] = useState("");
  const [rankingRows, setRankingRows] = useState([]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) {
        return;
      }
      if (error) {
        setAuthMessage(error.message);
      }
      setSession(data.session ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadExistingScore = async () => {
      if (!supabase || !session?.user?.id) {
        setScoreRecordId(null);
        setScoreRecordLevel(null);
        setScoreLookupDone(false);
        return;
      }

      setScoreLookupDone(false);
      const { data, error } = await supabase
        .from("score")
        .select("id,level")
        .eq("userId", session.user.id)
        .limit(1);

      if (error) {
        setScoreMessage(`Failed to check existing score: ${error.message}`);
        setScoreRecordId(null);
        setScoreRecordLevel(null);
        setScoreLookupDone(true);
        return;
      }

      setScoreRecordId(data && data.length > 0 ? data[0].id : null);
      setScoreRecordLevel(data && data.length > 0 ? data[0].level : null);
      setScoreLookupDone(true);
    };

    loadExistingScore();
  }, [session]);

  const startRound = (nextLevel) => {
    setSecret(randomCode());
    setGuesses(createEmptyGuesses());
    setChecks(createEmptyChecks());
    setCurrentRow(0);
    setCurrentCol(0);
    setLevel(nextLevel);
    setStarted(true);
    setGameOver(false);
    setCanNext(false);
    setScoreName("");
    setScoreSubmitting(false);
    setScoreSubmitted(false);
    setScoreMessage("");
  };

  const handleStart = () => {
    startRound(1);
    setMessage("Playing");
  };

  const handleReset = () => {
    setLevel(1);
    setStarted(false);
    setMessage("Ready");
    setSecret([]);
    setGuesses(createEmptyGuesses());
    setChecks(createEmptyChecks());
    setCurrentRow(0);
    setCurrentCol(0);
    setGameOver(false);
    setCanNext(false);
    setScoreName("");
    setScoreSubmitting(false);
    setScoreSubmitted(false);
    setScoreMessage("");
  };

  const handlePickColor = (color) => {
    if (!started || gameOver || canNext) {
      return;
    }

    if (currentCol >= COLS) {
      return;
    }

    setGuesses((prev) => {
      const next = prev.map((row) => [...row]);
      next[currentRow][currentCol] = color;
      return next;
    });
    setCurrentCol((prev) => prev + 1);
  };

  const handleCheck = () => {
    if (!started || gameOver || canNext) {
      return;
    }

    const rowGuess = guesses[currentRow];
    if (rowGuess.some((color) => color === null)) {
      setMessage("Please choose all 4 colors before checking");
      return;
    }

    const correctCount = rowGuess.reduce(
      (total, color, index) => total + (color === secret[index] ? 1 : 0),
      0
    );

    setChecks((prev) => {
      const next = [...prev];
      next[currentRow] = correctCount;
      return next;
    });

    const win = correctCount === COLS;
    if (win) {
      setCanNext(true);
      setMessage(`Winner! Press Next to go to level ${level + 1}`);
      return;
    }

    if (currentRow === MAX_ROWS - 1) {
      setMessage(`You lost. Correct code: ${formatCode(secret)}`);
      setGameOver(true);
      setScoreSubmitted(false);
      setScoreMessage("");
      if (scoreRecordId) {
        updateExistingScore(level);
      }
      return;
    }

    const nextRow = currentRow + 1;
    setCurrentRow(nextRow);
    setCurrentCol(0);
    setMessage("Continue to the next turn");
  };

  const handleNext = () => {
    if (!canNext) {
      return;
    }
    const nextLevel = level + 1;
    startRound(nextLevel);
    setMessage(`Playing - level ${nextLevel}`);
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    setAuthBusy(true);
    setAuthMessage("");

    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthMessage(error.message);
      } else {
        setAuthMessage("Login successful");
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        setAuthMessage(error.message);
      } else {
        setAuthMessage("Registration successful. Check your email for confirmation if required.");
      }
    }

    setAuthBusy(false);
  };

  const handleLogout = async () => {
    if (!supabase || !session?.user?.id) {
      return;
    }

    await saveProgressOnLogout();
    await supabase.auth.signOut();
    handleReset();
    setAuthMessage("");
    setScoreRecordId(null);
    setScoreRecordLevel(null);
    setScoreLookupDone(false);
    setRankingOpen(false);
    setRankingRows([]);
    setRankingMessage("");
  };

  const saveProgressOnLogout = async () => {
    if (!supabase || !session?.user?.id) {
      return;
    }

    const currentLevel = level;

    if (scoreRecordId) {
      const { error } = await supabase
        .from("score")
        .update({ level: currentLevel })
        .eq("id", scoreRecordId);

      if (!error) {
        setScoreRecordLevel(currentLevel);
      }
      return;
    }

    const fallbackName =
      session.user.email?.split("@")[0] ||
      "Player";

    const { data, error } = await supabase
      .from("score")
      .insert({
        level: currentLevel,
        name: fallbackName,
        userId: session.user.id
      })
      .select("id,level")
      .single();

    if (!error && data) {
      setScoreRecordId(data.id);
      setScoreRecordLevel(data.level);
      setScoreLookupDone(true);
    }
  };

  const updateExistingScore = async (currentLevel) => {
    if (!supabase || !scoreRecordId) {
      return;
    }

    if (scoreRecordLevel !== null && currentLevel < scoreRecordLevel) {
      setScoreSubmitted(true);
      setScoreMessage(`No update: current level ${currentLevel} is lower than saved level ${scoreRecordLevel}.`);
      return;
    }

    setScoreSubmitting(true);
    const { error } = await supabase
      .from("score")
      .update({ level: currentLevel })
      .eq("id", scoreRecordId);

    if (error) {
      setScoreMessage(`Failed to update score: ${error.message}`);
      setScoreSubmitting(false);
      return;
    }

    setScoreSubmitted(true);
    setScoreSubmitting(false);
    setScoreMessage("Score updated successfully");
    setScoreRecordLevel(currentLevel);
  };

  const handleSubmitScore = async (event) => {
    event.preventDefault();

    if (!supabase || !session?.user?.id || !gameOver || scoreSubmitted) {
      return;
    }

    const cleanName = scoreName.trim();
    if (!cleanName) {
      setScoreMessage("Please enter a nickname");
      return;
    }

    setScoreSubmitting(true);
    setScoreMessage("");

    const { data, error } = await supabase.from("score").insert({
      level: level,
      name: cleanName,
      userId: session.user.id
    }).select("id,level").single();

    if (error) {
      setScoreMessage(`Failed to save score: ${error.message}`);
      setScoreSubmitting(false);
      return;
    }

    setScoreSubmitted(true);
    setScoreSubmitting(false);
    setScoreMessage("Score saved successfully");
    setScoreRecordId(data.id);
    setScoreRecordLevel(level);
    setScoreLookupDone(true);
    handleReset();
  };

  const handleOpenRanking = async () => {
    if (!supabase) {
      return;
    }

    setRankingOpen(true);
    setRankingLoading(true);
    setRankingMessage("");

    const { data, error } = await supabase
      .from("score")
      .select("name,level,userId")
      .order("level", { ascending: false })
      .limit(10);

    if (error) {
      setRankingMessage(`Failed to load ranking: ${error.message}`);
      setRankingRows([]);
      setRankingLoading(false);
      return;
    }

    setRankingRows(data ?? []);
    if (!data || data.length === 0) {
      setRankingMessage("No ranking data yet");
    }
    setRankingLoading(false);
  };

  if (!isSupabaseConfigured) {
    return (
      <main className="auth-layout">
        <section className="auth-card">
          <h1>Supabase Is Not Configured</h1>
          <p>Add these environment variables before using auth:</p>
          <code>VITE_SUPABASE_URL</code>
          <code>VITE_SUPABASE_ANON_KEY</code>
        </section>
      </main>
    );
  }

  if (authLoading) {
    return (
      <main className="auth-layout">
        <section className="auth-card">
          <h1>Loading...</h1>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="auth-layout">
        <section className="auth-card">
          <h1>{authMode === "login" ? "Login" : "Register"}</h1>

          <div className="auth-mode-switch">
            <button
              type="button"
              className={authMode === "login" ? "mode-btn active" : "mode-btn"}
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === "register" ? "mode-btn active" : "mode-btn"}
              onClick={() => setAuthMode("register")}
            >
              Register
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit} autoComplete="off">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              name="auth_email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              name="auth_password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />

            <button type="submit" disabled={authBusy}>
              {authBusy ? "Processing..." : authMode === "login" ? "Login" : "Register"}
            </button>
          </form>

          {authMessage ? <p className="auth-message">{authMessage}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="layout">
      <section className="top-actions">
        <button type="button" className="ranking-btn" onClick={handleOpenRanking}>Ranking</button>
        <button type="button" className="logout-btn" onClick={handleLogout}>Logout</button>
      </section>

      <section className="part part-1">
        <div className="level-box">
          <span>Level</span>
          <strong>{level}</strong>
        </div>
        <div className="actions">
          <div className="game-actions">
            <button type="button" className="start-btn" onClick={handleStart}>Start</button>
            <button type="button" className="reset-btn" onClick={handleReset}>Reset</button>
            <button type="button" className="next-btn" onClick={handleNext} disabled={!canNext}>Next</button>
          </div>
        </div>
        <p className="status">{message}</p>
        {gameOver && scoreMessage ? <p className="score-inline-message">{scoreMessage}</p> : null}
      </section>

      <section className="part part-2" aria-label="Board with 8 rows and 4 columns">
        {rows.map((row) => (
          <div className={`grid-row${row === currentRow && started && !gameOver && !canNext ? " active-row" : ""}`} key={`row-${row}`}>
            <div className="square-row">
              {cols.map((col) => {
                const color = guesses[row][col];
                return (
                  <div
                    className="cell-square"
                    key={`square-${row}-${col}`}
                    style={{ background: color || "#9ca3af" }}
                  />
                );
              })}
            </div>
            <div className="circle-row-inline">
              {cols.map((col) => (
                <div
                  className="cell-circle"
                  key={`inline-circle-${row}-${col}`}
                  style={{ background: col < checks[row] ? "#22c55e" : "#a3a3a3" }}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="part part-4" aria-label="One row with 4 color buttons">
        <div className="rect-row">
          {PALETTE.map((color) => (
            <button
              type="button"
              key={color}
              className={`cell-rect rect-btn rect-${color}`}
              onClick={() => handlePickColor(color)}
              disabled={!started || gameOver || canNext || currentCol >= COLS}
              aria-label={`Pick ${color}`}
            />
          ))}
        </div>
        <button
          type="button"
          className="check-btn"
          onClick={handleCheck}
          disabled={!started || gameOver || canNext}
        >
          Check
        </button>
      </section>

      {gameOver && scoreLookupDone && !scoreRecordId && !scoreSubmitted ? (
        <div className="popup-overlay" role="dialog" aria-modal="true" aria-label="Save score">
          <form className="popup-card" onSubmit={handleSubmitScore} autoComplete="off">
            <h2>Save Score</h2>
            <p>Enter your nickname to save your result.</p>
            <label htmlFor="score-name">Nickname</label>
            <input
              id="score-name"
              type="text"
              name="score_nickname"
              autoComplete="off"
              value={scoreName}
              onChange={(event) => setScoreName(event.target.value)}
              disabled={scoreSubmitting}
              required
            />
            <button type="submit" className="submit-score-btn" disabled={scoreSubmitting}>
              {scoreSubmitting ? "Saving..." : "Submit"}
            </button>
            {scoreMessage ? <p className="score-message">{scoreMessage}</p> : null}
          </form>
        </div>
      ) : null}

      {rankingOpen ? (
        <div className="popup-overlay" role="dialog" aria-modal="true" aria-label="Ranking">
          <section className="popup-card ranking-card">
            <div className="ranking-header">
              <h2>Top 10 Ranking</h2>
              <button type="button" className="close-popup-btn" onClick={() => setRankingOpen(false)}>
                Close
              </button>
            </div>

            {rankingLoading ? <p>Loading...</p> : null}
            {!rankingLoading && rankingMessage ? <p className="score-message">{rankingMessage}</p> : null}

            {!rankingLoading && rankingRows.length > 0 ? (
              <div className="ranking-list">
                <div className="ranking-row ranking-head">
                  <span>Rank</span>
                  <span>Name</span>
                  <span>Level</span>
                </div>
                {rankingRows.map((item, index) => (
                  <div className={`ranking-row rank-${index + 1}`} key={`${item.userId}-${index}`}>
                    <span className="rank-index">
                      {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1}
                    </span>
                    <span>{item.name || "Unknown"}</span>
                    <span className="rank-level">{item.level}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

