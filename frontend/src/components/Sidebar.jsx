import { useEffect } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

const TABS = [
  { to: "/chat", label: "Chat" },
  { to: "/flashcards", label: "Flashcards" },
  { to: "/quiz", label: "Quiz" },
];

// How long the current page takes to fade out before the next one opens
const LEAVE_MS = 180;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Left panel shared by every app page: logo, page tabs, then page-specific content
export default function Sidebar({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  // The new page has opened: stop the fade-out (see switchTab below)
  useEffect(() => {
    document.body.classList.remove("page-leaving");
  }, []);

  // Instead of switching instantly, fade the current page out first.
  // The class on <body> triggers the fade-out CSS; the next page fades in on its own.
  const switchTab = (event, to) => {
    if (to === location.pathname || prefersReducedMotion()) return;
    event.preventDefault();
    document.body.classList.add("page-leaving");
    setTimeout(() => navigate(to), LEAVE_MS);
  };

  return (
    <aside className="panel">
      <Link to="/" className="brand">StudyPilot</Link>

      <nav className="tabs">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} onClick={(e) => switchTab(e, tab.to)}>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {children}
    </aside>
  );
}
