// Endpoints served by backend/api.py (FastAPI):
//
//   POST /api/chat      { question, top_k? }  -> stream of JSON lines (see askQuestion below)
//   POST /api/upload    multipart "file"      -> { name, kind, chunks }
//   POST /api/youtube   { url }               -> { name, kind, chunks }
//   GET  /api/documents                       -> [{ name, kind }]
//   /api/decks, /api/cards, /api/quizzes      -> flashcards and quizzes (see below)
//
// Vite proxies /api -> http://localhost:8000 in dev. Override with VITE_API_URL.
const BASE = import.meta.env.VITE_API_URL ?? "/api";

// Sends a request and turns network/HTTP failures into readable errors.
async function send(path, options) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new Error("Can't reach the StudyPilot server. Is the backend running?");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.detail || body.error || "";
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res;
}

const request = async (path, options) => (await send(path, options)).json();

// Streams an answer. The server sends one JSON object per line:
//   {"type": "sources", "sources": [...]}   -> onSources(sources)   ([] = general answer)
//   {"type": "token", "text": "..."}        -> onToken(text), many times
//   {"type": "error", "message": "..."}     -> thrown as an Error
//   {"type": "done"}
// history: earlier messages [{role, content}], so follow-up questions make sense
export async function askQuestion(question, history, { onSources, onToken }, topK = 4) {
  const res = await send("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history, top_k: topK }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // A network chunk can end in the middle of a line, so keep the
    // unfinished last line in the buffer until the rest arrives.
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);

      if (message.type === "sources") onSources(message.sources);
      if (message.type === "token") onToken(message.text);
      if (message.type === "error") throw new Error(message.message);
    }
  }
}

export const uploadDocument = (file) => {
  const form = new FormData();
  form.append("file", file);
  return request("/upload", { method: "POST", body: form });
};

export const listDocuments = () => request("/documents");

export const addYoutube = (url) => postJson("/youtube", { url });

// ---------- Flashcards ----------

export const createDeck = (topic, count) => postJson("/decks", { topic, count });
export const listDecks = () => request("/decks");
export const getDeck = (id) => request(`/decks/${id}`);
export const deleteDeck = (id) => request(`/decks/${id}`, { method: "DELETE" });
export const reviewCard = (id, knewIt) => postJson(`/cards/${id}/review`, { knew_it: knewIt });

// ---------- Quizzes ----------

export const createQuiz = (topic, count, type) => postJson("/quizzes", { topic, count, type });
export const listQuizzes = () => request("/quizzes");
export const getQuiz = (id) => request(`/quizzes/${id}`);
export const deleteQuiz = (id) => request(`/quizzes/${id}`, { method: "DELETE" });
export const submitQuiz = (id, answers) => postJson(`/quizzes/${id}/submit`, { answers });
export const missedToDeck = (id) => postJson(`/quizzes/${id}/flashcards`, {});

function postJson(path, body) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
