import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import { createDeck, deleteDeck, getDeck, listDecks, reviewCard } from "../lib/api.js";
import "./study.css";

// Local date as YYYY-MM-DD (the "en-CA" format), same as the backend uses
const today = () => new Date().toLocaleDateString("en-CA");

export default function Flashcards() {
  const [decks, setDecks] = useState([]);
  const [deck, setDeck] = useState(null);        // the open deck, with its cards
  const [studyCards, setStudyCards] = useState(null); // set while studying

  const [params] = useSearchParams();

  const refreshDecks = () => listDecks().then(setDecks).catch(() => {});

  const openDeck = async (id) => {
    setStudyCards(null);
    setDeck(await getDeck(id));
  };

  // A deck can be opened from the URL, e.g. /flashcards?deck=3 after a quiz
  useEffect(() => {
    refreshDecks();
    if (params.get("deck")) openDeck(params.get("deck")).catch(() => {});
  }, []);

  const finishStudy = () => {
    setStudyCards(null);
    openDeck(deck.id);
    refreshDecks();
  };

  return (
    <div className="chat-layout">
      <Sidebar>
        <div className="panel-group">
          <h3>Your decks</h3>
          <button className="drop compact" onClick={() => { setDeck(null); setStudyCards(null); }}>
            <strong>+ New deck</strong>
          </button>
          {decks.length === 0 && <p className="empty">No decks yet.</p>}
          <ul className="side-list">
            {decks.map((d) => (
              <li key={d.id}>
                <button className={deck?.id === d.id ? "active" : ""} onClick={() => openDeck(d.id)}>
                  <span className="name">{d.topic}</span>
                  {d.due > 0 && <span className="badge">{d.due} due</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Sidebar>

      <main className="study-main">
        {studyCards ? (
          <StudySession cards={studyCards} topic={deck.topic} onFinish={finishStudy} />
        ) : deck ? (
          <DeckView
            deck={deck}
            onStudy={setStudyCards}
            onDelete={async () => {
              await deleteDeck(deck.id);
              setDeck(null);
              refreshDecks();
            }}
          />
        ) : (
          <NewDeckForm
            onCreated={(newDeck) => {
              setDeck(newDeck);
              refreshDecks();
            }}
          />
        )}
      </main>
    </div>
  );
}

function NewDeckForm({ onCreated }) {
  // A topic can be passed in the URL, e.g. from "Make flashcards" in chat
  const [params] = useSearchParams();
  const [topic, setTopic] = useState(params.get("topic") || "");
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreated(await createDeck(topic.trim(), count));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="study-form" onSubmit={submit}>
      <h1>New flashcard deck</h1>
      <p className="lead">Cards are written from your own library, with the page each one came from.</p>

      <label>
        Topic
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. consistent hashing" autoFocus />
      </label>

      <label>
        Number of cards
        <div className="choices">
          {[5, 10, 15, 20].map((n) => (
            <button type="button" key={n} className={count === n ? "on" : ""} onClick={() => setCount(n)}>{n}</button>
          ))}
        </div>
      </label>

      {error && <p className="form-error">{error}</p>}
      <button className="primary" disabled={busy || !topic.trim()}>
        {busy ? "Writing cards from your notes…" : "Create deck"}
      </button>
    </form>
  );
}

function DeckView({ deck, onStudy, onDelete }) {
  const dueCards = deck.cards.filter((c) => c.due_date <= today());

  return (
    <div className="deck">
      <header className="deck-head">
        <div>
          <h1>{deck.topic}</h1>
          <p className="lead">{deck.total} cards · {deck.due} due today</p>
        </div>
        <button className="btn btn-ghost" onClick={() => confirm("Delete this deck?") && onDelete()}>Delete</button>
      </header>

      <div className="deck-actions">
        <button className="primary" disabled={dueCards.length === 0} onClick={() => onStudy(dueCards)}>
          {dueCards.length ? `Study ${dueCards.length} due card${dueCards.length > 1 ? "s" : ""}` : "Nothing due today"}
        </button>
        <button className="secondary" onClick={() => onStudy(deck.cards)}>Practise all cards</button>
      </div>

      <p className="hint">
        Cards move up a box each time you know them, and come back after 1, 2, 4, 8 or 16 days.
        Forgetting one sends it back to box 1.
      </p>

      <ul className="card-list">
        {deck.cards.map((card) => (
          <li key={card.id}>
            <span className={`box box-${card.box}`}>Box {card.box}</span>
            <span className="front">{card.front}</span>
            <span className="due">{card.due_date <= today() ? "due" : card.due_date}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StudySession({ cards, topic, onFinish }) {
  const [queue, setQueue] = useState(cards);   // cards still to answer
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const card = queue[0];

  const answer = async (knewIt) => {
    await reviewCard(card.id, knewIt);
    setFlipped(false);
    if (knewIt) setKnown((n) => n + 1);

    // A forgotten card goes to the back of the queue to try again
    setQueue((q) => (knewIt ? q.slice(1) : [...q.slice(1), card]));
  };

  if (!card) {
    return (
      <div className="study-done">
        <h1>Session complete</h1>
        <p className="lead">You went through {cards.length} card{cards.length > 1 ? "s" : ""} on {topic}.</p>
        <button className="primary" onClick={onFinish}>Back to deck</button>
      </div>
    );
  }

  return (
    <div className="study">
      <div className="progress">
        <span>{topic}</span>
        <span>{known} / {cards.length} known</span>
      </div>
      <div className="progress-bar"><i style={{ width: `${(100 * known) / cards.length}%` }} /></div>

      <button className={`flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
        <div className="face front-face">
          <span className="face-label">Question</span>
          <p>{card.front}</p>
          <span className="face-hint">Click to show the answer</span>
        </div>
        <div className="face back-face">
          <span className="face-label">Answer</span>
          <p>{card.back}</p>
          {card.source && <span className="cite">{card.source} · p.{card.page}</span>}
        </div>
      </button>

      <div className={`answer-buttons ${flipped ? "" : "hidden"}`}>
        <button className="again" onClick={() => answer(false)}>Again</button>
        <button className="good" onClick={() => answer(true)}>Got it</button>
      </div>
    </div>
  );
}
