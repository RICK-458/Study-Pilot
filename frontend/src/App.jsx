import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import Chat from "./pages/Chat.jsx";
import Flashcards from "./pages/Flashcards.jsx";
import Quiz from "./pages/Quiz.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/flashcards" element={<Flashcards />} />
      <Route path="/quiz" element={<Quiz />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
