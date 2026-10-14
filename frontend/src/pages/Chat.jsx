import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import LoadingScreen from "../components/LoadingScreen.jsx";
import Message from "../components/Message.jsx";
import SourcePanel from "../components/SourcePanel.jsx";
import { askQuestion, listDocuments } from "../lib/api.js";

// e.g. "\n(Sources: notes.pdf page 3, notes.pdf page 5)"
const sourceNote = (m) =>
  m.sources?.length
    ? `\n(Sources: ${m.sources.map((s) => `${s.source} page ${s.page}`).join(", ")})`
    : "";

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState([]);
  const endRef = useRef(null);

  // The loading screen is shown only when arriving from the landing page,
  // which passes { fromLanding: true } as the link's state
  const location = useLocation();
  const [showLoader, setShowLoader] = useState(Boolean(location.state?.fromLanding));
  const [libraryLoaded, setLibraryLoaded] = useState(false);

  // Show everything already indexed when the page opens.
  // finally(): even if the backend is down, the loader still goes away.
  useEffect(() => {
    listDocuments()
      .then(setSources)
      .catch(() => {})
      .finally(() => setLibraryLoaded(true));
  }, []);

  // Keep the newest text in view while the answer streams in
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, loading]);

  // Changes the last message (the answer currently being streamed)
  const updateAnswer = (change) =>
    setMessages((m) => [...m.slice(0, -1), { ...m[m.length - 1], ...change(m[m.length - 1]) }]);

  const send = async (e) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    // The last few messages (without failed ones) go along as context.
    // Answers from the library get their sources attached, so the LLM can
    // tell which earlier answers came from the student's files.
    const history = messages
      .filter((m) => m.content && !m.error)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content + sourceNote(m) }));

    // Add the question plus an empty answer that fills up as text arrives
    setMessages((m) => [
      ...m,
      { role: "user", content: question },
      { role: "assistant", content: "", sources: [], question },
    ]);
    setInput("");
    setLoading(true);
    try {
      await askQuestion(question, history, {
        // No sources means the answer didn't come from the library
        onSources: (sources) => updateAnswer(() => ({ sources, general: sources.length === 0 })),
        onToken: (text) => updateAnswer((answer) => ({ content: answer.content + text })),
      });
    } catch (err) {
      updateAnswer(() => ({ content: err.message, error: true, sources: [] }));
    } finally {
      setLoading(false);
    }
  };

  // Show the typing dots until the first words of the answer arrive
  const lastMessage = messages[messages.length - 1];
  const waitingForFirstWord = loading && !lastMessage?.content;

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) send(e);
  };

  return (
    <div className="chat-layout">
      {showLoader && <LoadingScreen ready={libraryLoaded} onDone={() => setShowLoader(false)} />}
      <SourcePanel sources={sources} onAdd={(s) => setSources((p) => [...p.filter((x) => x.name !== s.name), s])} />

      <section className="chat">
        <header className="chat-head">
          {messages.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setMessages([])}>New chat</button>
          )}
        </header>

        <div className="messages">
          {messages.length === 0 ? (
            <div className="intro">
              <h1>What are you studying?</h1>
              <p>
                Ask about anything in your library. Answers cite the file and page
                they came from.
              </p>
            </div>
          ) : (
            messages
              .filter((m) => m.role === "user" || m.content)
              .map((m, i) => <Message key={i} {...m} />)
          )}
          {waitingForFirstWord && <div className="msg bot"><div className="typing"><i /><i /><i /></div></div>}
          <div ref={endRef} />
        </div>

        <form className="composer" onSubmit={send}>
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a question…"
          />
          <button className="send" disabled={loading || !input.trim()} aria-label="Send">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        </form>
      </section>
    </div>
  );
}
