import { useEffect, useRef, useState } from "react";

// Full-screen loader shown when entering the app from the landing page.
// It stays until `ready` is true AND a short minimum time has passed (so it
// doesn't just flash), then fades out and calls onDone().
const MIN_VISIBLE_MS = 900;
const FADE_OUT_MS = 450;

export default function LoadingScreen({ ready, onDone }) {
  const [minTimeOver, setMinTimeOver] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Keep the latest onDone without restarting the timers when it changes
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeOver(true), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready || !minTimeOver) return;
    setLeaving(true);
    const timer = setTimeout(() => onDoneRef.current(), FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [ready, minTimeOver]);

  return (
    <div className={`loader ${leaving ? "leaving" : ""}`} role="status" aria-live="polite">
      <div className="loader-brand">StudyPilot</div>
      <div className="loader-bar"><i /></div>
      <p className="loader-text">{leaving ? "Ready" : "Opening your library…"}</p>
    </div>
  );
}
