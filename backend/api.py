import json
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from db import init_db
from llm import stream_answer
from llm.gemini import CloudLLMError
from rag.indexer import DocumentIndexer
from rag.loader import SUPPORTED_EXTENSIONS
from rag.pipeline import NO_MATERIAL_MESSAGE, RAGPipeline
from rag.youtube import load_youtube_transcript
from study import flashcards, quiz


# Uploaded files are saved here before being indexed
DOCUMENTS_DIR = Path(__file__).resolve().parent / "data" / "documents"
DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="StudyPilot API")

# Load the database and embedding model once, when the server starts
indexer = DocumentIndexer()
rag = RAGPipeline(indexer)

# Create the SQLite tables for flashcards and quizzes if they don't exist yet
init_db()


# ---------- Request bodies ----------

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    question: str
    top_k: int = 4
    history: list[ChatMessage] = []     # earlier messages, for follow-ups


class YoutubeRequest(BaseModel):
    url: str


class DeckRequest(BaseModel):
    topic: str
    count: int = Field(10, ge=3, le=20)


class ReviewRequest(BaseModel):
    knew_it: bool


class QuizRequest(BaseModel):
    topic: str
    count: int = Field(5, ge=3, le=15)
    type: Literal["mcq", "short", "mixed"] = "mixed"


class SubmitRequest(BaseModel):
    answers: dict[str, str]      # {question_id: answer}


# ---------- Endpoints ----------
# Endpoints use "def" (not "async def") on purpose: indexing, OCR and the
# LLM call are slow, and FastAPI runs plain "def" endpoints in a separate
# thread so one slow request doesn't freeze the whole server.

def to_line(data):
    # One JSON object per line ("NDJSON"), so the browser can read each
    # message as soon as it arrives
    return json.dumps(data) + "\n"


@app.post("/api/chat")
def chat(request: ChatRequest):
    # 1. Find the relevant chunks first (fast, no LLM involved)
    try:
        sources = rag.retrieve(request.question, top_k=request.top_k)

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # 2. Stream the answer while the LLM writes it. The stream looks like:
    #    {"type": "sources", "sources": [...]}     ([] = general answer)
    #    {"type": "token", "text": "Consistent"}
    #    {"type": "token", "text": " hashing is"}
    #    ...
    #    {"type": "done"}
    history = [message.model_dump() for message in request.history]

    def generate():
        # No relevant passages -> sources is [] and the LLM answers generally
        yield to_line({"type": "sources", "sources": sources})

        try:
            for text in stream_answer(request.question, sources, history):
                yield to_line({"type": "token", "text": text})

        # The response has already started (status 200), so errors can no
        # longer become an HTTP error code. Send them as a message instead.
        except Exception as exc:
            print(f"Chat failed: {exc}")
            yield to_line({
                "type": "error",
                "message": "Could not generate an answer. Is Ollama running?"
            })
            return

        yield to_line({"type": "done"})

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.post("/api/upload")
def upload(file: UploadFile):
    # Path(...).name drops any folder parts, e.g. "../../evil.pdf" -> "evil.pdf"
    filename = Path(file.filename or "").name
    extension = Path(filename).suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    # 1. Save the file to data/documents
    save_path = DOCUMENTS_DIR / filename
    save_path.write_bytes(file.file.read())

    # 2. Extract, chunk, embed and store it
    try:
        result = indexer.index_document(save_path)

    except Exception as exc:
        save_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc))

    return {"name": result["source"], "kind": "file", "chunks": result["chunks"]}


@app.post("/api/youtube")
def add_youtube(request: YoutubeRequest):
    try:
        source, pages = load_youtube_transcript(request.url)
        result = indexer.index_pages(pages, source)

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"name": result["source"], "kind": "youtube", "chunks": result["chunks"]}


@app.get("/api/documents")
def list_documents():
    # Lets the frontend show the library again after a page refresh
    return [
        {
            "name": source,
            "kind": "youtube" if source.endswith("(YouTube)") else "file"
        }
        for source in indexer.list_sources()
    ]


# ---------- Study material for flashcards and quizzes ----------

def find_material(topic):
    # Retrieves more passages than chat does, so there's enough material
    # for several cards or questions
    if not topic.strip():
        raise HTTPException(status_code=400, detail="Please enter a topic.")

    if indexer.collection.count() == 0:
        raise HTTPException(status_code=400, detail=NO_MATERIAL_MESSAGE)

    chunks = rag.retrieve(topic, top_k=8)

    if not chunks:
        raise HTTPException(
            status_code=400,
            detail=f"Nothing in your library is about \"{topic.strip()}\". Try a topic from your notes.",
        )

    return chunks


def not_found_or_bad_request(exc):
    status = 404 if "not found" in str(exc) else 400
    return HTTPException(status_code=status, detail=str(exc))


# ---------- Flashcards ----------

@app.post("/api/decks")
def create_deck(request: DeckRequest):
    chunks = find_material(request.topic)

    try:
        cards = flashcards.generate_cards(request.topic, request.count, chunks)
    except CloudLLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if not cards:
        raise HTTPException(
            status_code=400,
            detail=f"Couldn't find enough about \"{request.topic}\" in your library.",
        )

    return flashcards.save_deck(request.topic.strip(), cards)


@app.get("/api/decks")
def list_decks():
    return flashcards.list_decks()


@app.get("/api/decks/{deck_id}")
def get_deck(deck_id: int):
    try:
        return flashcards.get_deck(deck_id)
    except ValueError as exc:
        raise not_found_or_bad_request(exc)


@app.delete("/api/decks/{deck_id}")
def delete_deck(deck_id: int):
    flashcards.delete_deck(deck_id)
    return {"deleted": deck_id}


@app.post("/api/cards/{card_id}/review")
def review_card(card_id: int, request: ReviewRequest):
    try:
        return flashcards.review_card(card_id, request.knew_it)
    except ValueError as exc:
        raise not_found_or_bad_request(exc)


# ---------- Quizzes ----------

@app.post("/api/quizzes")
def create_quiz(request: QuizRequest):
    chunks = find_material(request.topic)

    try:
        questions = quiz.generate_questions(
            request.topic, request.count, request.type, chunks
        )
    except CloudLLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if not questions:
        raise HTTPException(
            status_code=400,
            detail=f"Couldn't find enough about \"{request.topic}\" in your library.",
        )

    return quiz.save_quiz(request.topic.strip(), questions)


@app.get("/api/quizzes")
def list_quizzes():
    return quiz.list_quizzes()


@app.get("/api/quizzes/{quiz_id}")
def get_quiz(quiz_id: int):
    try:
        return quiz.get_quiz(quiz_id)
    except ValueError as exc:
        raise not_found_or_bad_request(exc)


@app.delete("/api/quizzes/{quiz_id}")
def delete_quiz(quiz_id: int):
    quiz.delete_quiz(quiz_id)
    return {"deleted": quiz_id}


@app.post("/api/quizzes/{quiz_id}/submit")
def submit_quiz(quiz_id: int, request: SubmitRequest):
    try:
        return quiz.submit_quiz(quiz_id, request.answers)
    except ValueError as exc:
        raise not_found_or_bad_request(exc)
    except CloudLLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/quizzes/{quiz_id}/flashcards")
def missed_questions_to_deck(quiz_id: int):
    # Turns the questions answered wrong into a new flashcard deck
    try:
        topic, cards = quiz.missed_question_cards(quiz_id)
    except ValueError as exc:
        raise not_found_or_bad_request(exc)

    if not cards:
        raise HTTPException(status_code=400, detail="No missed questions. Nice work!")

    return flashcards.save_deck(f"Missed: {topic}", cards)
