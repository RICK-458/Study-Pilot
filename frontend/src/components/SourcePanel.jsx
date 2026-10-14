import { useRef, useState } from "react";
import Sidebar from "./Sidebar.jsx";
import { uploadDocument, addYoutube } from "../lib/api.js";

const fileLabel = (name) => (name.toLowerCase().endsWith(".pdf") ? "PDF" : "IMG");

export default function SourcePanel({ sources, onAdd }) {
  const fileRef = useRef(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      const res = await fn();
      onAdd({ kind: res.kind, name: res.name });
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) run(() => uploadDocument(file));
  };

  const onYoutube = async (e) => {
    e.preventDefault();
    const value = url.trim();
    if (!value) return;
    if (await run(() => addYoutube(value))) setUrl("");
  };

  return (
    <Sidebar>

      <div className="panel-group">
        <h3>Add material</h3>
        <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.bmp,.tif,.tiff,.webp" onChange={onFile} />
        <button className="drop" disabled={busy} onClick={() => fileRef.current.click()}>
          <strong>Upload a PDF or image</strong>
          <span>Notes, papers, scans, photos of slides</span>
        </button>

        <form onSubmit={onYoutube} className="yt">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="youtube.com/watch?v=…"
            disabled={busy}
          />
          <button className="btn btn-dark" disabled={busy || !url.trim()}>Add</button>
        </form>
        {busy && <p className="empty">Indexing… scanned pages can take a minute.</p>}
        {error && <p className="panel-error">{error}</p>}
      </div>

      <div className="panel-group">
        <h3>Library</h3>
        {sources.length === 0 ? (
          <p className="empty">No documents indexed yet.</p>
        ) : (
          <ul className="source-list">
            {sources.map((s, i) => (
              <li key={i}>
                <span className={`kind ${s.kind}`}>{s.kind === "youtube" ? "YT" : fileLabel(s.name)}</span>
                <span className="name">{s.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sidebar>
  );
}
