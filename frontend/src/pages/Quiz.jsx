import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import { createQuiz, deleteQuiz, getQuiz, listQuizzes, missedToDeck, submitQuiz } from "../lib/api.js";
import "./study.css";

const TYPES = [
  { value: "mixed", label: "Mixed" },
  { value: "mcq", label: "Multiple choice" },
  { value: "short", label: "Short answer" },
];

export default function Quiz() {
  const [history, setHistory] = useState([]);
  const [quiz, setQuiz] = useState(null);   // the open quiz

  const refreshHistory = () => listQuizzes().then(setHistory).catch(() => {});
  useEffect(() => { refreshHistory(); }, []);

  const openQuiz = async (id) => setQuiz(await getQuiz(id));

  return (
    <div className="chat-layout">
      <Sidebar>
        <div className="panel-group">
          <h3>Your quizzes</h3>
          <button className="drop compact" onClick={() => setQuiz(null)}>
            <strong>+ New quiz</strong>
          </button>
          {history.length === 0 && <p className="empty">No quizzes yet.</p>}
          <ul className="side-list">
            {history.map((q) => (
              <li key={q.id}>
                <button className={quiz?.id === q.id ? "active" : ""} onClick={() => openQuiz(q.id)}>
                  <span className="name">{q.topic}</span>
                  <span className={`badge ${q.score == null ? "" : q.score >= 60 ? "pass" : "fail"}`}>
                    {q.score == null ? "unfinished" : `${q.score}%`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Sidebar>

      <main className="study-main">
        {!quiz ? (
          <NewQuizForm onCreated={(q) => { setQuiz(q); refreshHistory(); }} />
        ) : quiz.submitted ? (
          <Results
            quiz={quiz}
            onDelete={async () => {
              await deleteQuiz(quiz.id);
              setQuiz(null);
              refreshHistory();
            }}
          />
        ) : (
          <TakeQuiz quiz={quiz} onSubmitted={(q) => { setQuiz(q); refreshHistory(); }} />
        )}
      </main>
    </div>
  );
}

function NewQuizForm({ onCreated }) {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [type, setType] = useState("mixed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreated(await createQuiz(topic.trim(), count, type));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="study-form" onSubmit={submit}>
      <h1>New quiz</h1>
      <p className="lead">Questions come from your own library. Short answers are graded with feedback.</p>

      <label>
        Topic
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. database sharding" autoFocus />
      </label>

      <label>
        Number of questions
        <div className="choices">
          {[5, 10, 15].map((n) => (
            <button type="button" key={n} className={count === n ? "on" : ""} onClick={() => setCount(n)}>{n}</button>
          ))}
        </div>
      </label>

      <label>
        Question type
        <div className="choices">
          {TYPES.map((t) => (
            <button type="button" key={t.value} className={type === t.value ? "on" : ""} onClick={() => setType(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      </label>

      {error && <p className="form-error">{error}</p>}
      <button className="primary" disabled={busy || !topic.trim()}>
        {busy ? "Writing questions from your notes…" : "Start quiz"}
      </button>
    </form>
  );
}

function TakeQuiz({ quiz, onSubmitted }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});   // { questionId: answer }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const question = quiz.questions[index];
  const isLast = index === quiz.questions.length - 1;
  const setAnswer = (value) => setAnswers({ ...answers, [question.id]: value });

  const submit = async () => {
    const unanswered = quiz.questions.filter((q) => !String(answers[q.id] ?? "").trim()).length;
    if (unanswered && !confirm(`${unanswered} question(s) unanswered. Submit anyway?`)) return;

    setBusy(true);
    setError("");
    try {
      onSubmitted(await submitQuiz(quiz.id, answers));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="study">
      <div className="progress">
        <span>{quiz.topic}</span>
        <span>Question {index + 1} of {quiz.questions.length}</span>
      </div>
      <div className="progress-bar"><i style={{ width: `${(100 * (index + 1)) / quiz.questions.length}%` }} /></div>

      <div className="question">
        <span className="face-label">{question.type === "mcq" ? "Multiple choice" : "Short answer"}</span>
        <h2>{question.question}</h2>

        {question.type === "mcq" ? (
          <div className="options">
            {question.options.map((option, i) => (
              <button
                key={i}
                className={answers[question.id] === String(i) ? "chosen" : ""}
                onClick={() => setAnswer(String(i))}
              >
                <span className="letter">{"ABCD"[i]}</span>
                {option}
              </button>
            ))}
          </div>
        ) : (
          <textarea
            rows={5}
            value={answers[question.id] || ""}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Write your answer in a few sentences…"
          />
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="quiz-nav">
        <button className="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</button>
        {isLast ? (
          <button className="primary" disabled={busy} onClick={submit}>{busy ? "Grading…" : "Submit quiz"}</button>
        ) : (
          <button className="primary" onClick={() => setIndex(index + 1)}>Next</button>
        )}
      </div>
    </div>
  );
}

function Results({ quiz, onDelete }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const missed = quiz.questions.filter((q) => q.points < 0.6).length;

  const makeDeck = async () => {
    try {
      const deck = await missedToDeck(quiz.id);
      navigate(`/flashcards?deck=${deck.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="results">
      <header className="deck-head">
        <div>
          <h1>{quiz.topic}</h1>
          <p className="lead">{quiz.questions.length - missed} of {quiz.questions.length} answered well</p>
        </div>
        <div className={`score ${quiz.score >= 60 ? "pass" : "fail"}`}>{quiz.score}%</div>
      </header>

      <div className="deck-actions">
        {missed > 0 && (
          <button className="primary" onClick={makeDeck}>
            Turn {missed} missed question{missed > 1 ? "s" : ""} into flashcards
          </button>
        )}
        <button className="secondary" onClick={() => confirm("Delete this quiz?") && onDelete()}>Delete quiz</button>
      </div>
      {error && <p className="form-error">{error}</p>}

      <ol className="review">
        {quiz.questions.map((q) => (
          <li key={q.id} className={q.points >= 0.6 ? "right" : "wrong"}>
            <h3>{q.question}</h3>
            {q.type === "mcq" ? <McqReview q={q} /> : <ShortReview q={q} />}
            {q.explanation && <p className="explanation">{q.explanation}</p>}
            {q.source && <span className="cite">{q.source} · p.{q.page}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function McqReview({ q }) {
  return (
    <div className="options review-options">
      {q.options.map((option, i) => {
        const isCorrect = i === q.correct_option;
        const isChosen = q.user_answer === String(i);
        return (
          <div key={i} className={isCorrect ? "correct" : isChosen ? "incorrect" : ""}>
            <span className="letter">{"ABCD"[i]}</span>
            {option}
            {isChosen && <em>{isCorrect ? " ✓ your answer" : " ✗ your answer"}</em>}
          </div>
        );
      })}
    </div>
  );
}

function ShortReview({ q }) {
  const grade = q.grading;
  return (
    <div className="short-review">
      <p><b>Your answer:</b> {q.user_answer || <i>No answer</i>}</p>
      {grade && (
        <>
          <p className="grade">Score: {grade.score} / 5</p>
          <p>{grade.feedback}</p>
          {grade.correct_concepts.length > 0 && (
            <p className="concepts good">✓ {grade.correct_concepts.join(" · ")}</p>
          )}
          {grade.missing_concepts.length > 0 && (
            <p className="concepts bad">✗ {grade.missing_concepts.join(" · ")}</p>
          )}
          <p className="next"><b>Next:</b> {grade.next_action}</p>
        </>
      )}
      <p><b>Model answer:</b> {q.reference_answer}</p>
    </div>
  );
}
