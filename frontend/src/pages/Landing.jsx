import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import "./landing.css";

const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const pipeline = [
  { step: "Read", detail: "PyMuPDF pulls text page by page" },
  { step: "Chunk", detail: "800 characters, 120 overlap" },
  { step: "Embed", detail: "all-MiniLM-L6-v2" },
  { step: "Retrieve", detail: "Top 4 passages from ChromaDB" },
  { step: "Answer", detail: "Qwen2.5 1.5B, running locally on Ollama" },
];

// Passed with links into the app so the chat page shows its loading screen
const FROM_LANDING = { fromLanding: true };

// Adds the class "in" to every element with a data-reveal attribute when it
// scrolls into view. The CSS animation for "in" does the rest.
function useRevealOnScroll(rootRef) {
  useEffect(() => {
    const elements = rootRef.current.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);   // animate only once
          }
        });
      },
      { threshold: 0.15 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rootRef]);
}

export default function Landing() {
  const rootRef = useRef(null);
  useRevealOnScroll(rootRef);

  return (
    <div className="lp" ref={rootRef}>
      <header className="lp-nav">
        <Link to="/" className="lp-brand">StudyPilot</Link>
        <nav className="lp-links">
          <a href="#inputs">What it reads</a>
          <a href="#pipeline">Under the hood</a>
        </nav>
        <Link to="/chat" state={FROM_LANDING} className="lp-pill">Open app</Link>
      </header>

      {/* --d is the delay before each part animates in on page load */}
      <main className="lp-hero">
        <h1>
          <span className="line"><span style={{ "--d": "80ms" }}>Ask your notes.</span></span>
          <span className="line"><span style={{ "--d": "200ms" }}>Get the page it came from.</span></span>
        </h1>
        <p className="enter" style={{ "--d": "380ms" }}>
          StudyPilot reads your PDFs and lecture videos, then answers questions
          using only that material — and tells you exactly where to look.
        </p>
        <Link to="/chat" state={FROM_LANDING} className="lp-cta enter" style={{ "--d": "480ms" }}>
          <span className="circle"><Arrow /></span>
          Start studying
        </Link>

        <figure className="demo enter" style={{ "--d": "620ms" }} aria-label="Example answer">
          <div className="demo-q">How does consistent hashing reduce key movement when a node is added?</div>
          <div className="demo-a">
            <div className="demo-typing" aria-hidden="true"><i /><i /><i /></div>
            <p>
              Keys and nodes are placed on the same hash ring, and each key belongs to the
              next node clockwise. Adding a node only takes over the keys between it and its
              predecessor, so roughly <b>1/n</b> of keys move instead of nearly all of them
              <span className="cite">consistent_hashing.pdf · p.3</span>
            </p>
            <p>
              Virtual nodes spread each server across the ring to keep that load even
              <span className="cite">consistent_hashing.pdf · p.5</span>
            </p>
          </div>
        </figure>
      </main>

      {/* --i staggers the scroll reveal: each item starts a little after the previous one */}
      <section id="inputs" className="lp-section">
        <h2 data-reveal>What it reads</h2>
        <div className="lp-cards">
          <article className="lp-card pink" data-reveal style={{ "--i": 1 }}>
            <div className="mini page">
              <span className="pg">p. 12</span>
              <i /><i /><i className="hl" /><i /><i className="short" />
            </div>
            <span className="tag">PDF</span>
            <h3>Lecture notes, papers, textbooks</h3>
            <p>Text is extracted page by page, so every answer keeps its page number.</p>
          </article>

          <article className="lp-card blue" data-reveal style={{ "--i": 2 }}>
            <div className="mini transcript">
              <div><code>04:12</code><i /></div>
              <div className="hl"><code>04:31</code><i /></div>
              <div><code>04:58</code><i className="short" /></div>
            </div>
            <span className="tag">YouTube</span>
            <h3>Recorded lectures</h3>
            <p>Paste a link and ask about what was said, without rewatching the hour.</p>
          </article>

          <article className="lp-card salmon" data-reveal style={{ "--i": 3 }}>
            <div className="mini files">
              <div><code>DBMS_unit3.pdf</code><span>2.1 MB</span></div>
              <div><code>OS_notes.pdf</code><span>840 KB</span></div>
              <div><code>networks_ch5.pdf</code><span>1.4 MB</span></div>
            </div>
            <span className="tag">Library</span>
            <h3>A whole semester at once</h3>
            <p>Questions search across everything you've added, not one file at a time.</p>
          </article>
        </div>
      </section>

      <section id="pipeline" className="lp-section">
        <h2 data-reveal>Under the hood</h2>
        <div className="lp-line" data-reveal />
        <ol className="lp-pipeline">
          {pipeline.map((p, i) => (
            <li key={p.step} data-reveal style={{ "--i": i + 1 }}>
              <code>{String(i + 1).padStart(2, "0")}</code>
              <strong>{p.step}</strong>
              <span>{p.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="lp-footer">
        <span>StudyPilot — RAG study assistant</span>
        <Link to="/chat" state={FROM_LANDING}>Open app →</Link>
      </footer>
    </div>
  );
}
