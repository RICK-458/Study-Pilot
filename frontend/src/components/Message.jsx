import { useState } from "react";
import { Link } from "react-router-dom";

// Matches either a citation like "[DBMS.pdf, page 42]" (see backend/llm/llm.py)
// or markdown bold like "**important**", which the LLM often uses.
const PATTERN = /\[([^\[\]]+?),\s*page\s*(\d+)\]|\*\*(.+?)\*\*/gi;

function renderWithCitations(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(PATTERN)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[3]) {
      parts.push(<strong key={match.index}>{match[3]}</strong>);
    } else {
      parts.push(
        <span key={match.index} className="cite">
          {match[1]} · p.{match[2]}
        </span>
      );
    }
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

export default function Message({ role, content, sources = [], error, question, general }) {
  const [open, setOpen] = useState(false);

  if (role === "user") {
    return <div className="msg user"><div className="bubble">{content}</div></div>;
  }

  return (
    <div className={`msg bot ${error ? "error" : ""}`}>
      <div className="text">{error ? content : renderWithCitations(content)}</div>
      {general && <p className="general-note">General answer · not from your library</p>}
      {sources.length > 0 && (
        <div className="passages">
          <button className="link" onClick={() => setOpen(!open)}>
            {open ? "Hide" : "View"} {sources.length} retrieved passage{sources.length > 1 ? "s" : ""}
          </button>
          {question && (
            <Link className="link" to={`/flashcards?topic=${encodeURIComponent(question)}`}>
              Make flashcards
            </Link>
          )}
          {open && (
            <ul>
              {sources.map((s, i) => (
                <li key={i}>
                  <code>{s.source}{s.page != null && ` · p.${s.page}`}</code>
                  {s.text && <p>{s.text.slice(0, 260)}{s.text.length > 260 ? "…" : ""}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
