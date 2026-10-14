# StudyPilot: A Guide to the Codebase

This guide explains how StudyPilot's code is organised, what every file and function does,
and how a request travels through the system. It is meant for learning the code, so it starts
with the big picture and real examples before the file-by-file reference.

**Suggested way to read it:** Sections 1–3 first (15 minutes), then follow one or two of the
walk-throughs in Section 4 with the code open next to you. Use Sections 5–7 as a reference
when you need to look something up.

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [Folder map](#2-folder-map)
3. [How to run it](#3-how-to-run-it)
4. [Walk-throughs: following real actions through the code](#4-walk-throughs-following-real-actions-through-the-code)
5. [Backend reference (file by file)](#5-backend-reference-file-by-file)
6. [Frontend reference (file by file)](#6-frontend-reference-file-by-file)
7. [Where the data lives](#7-where-the-data-lives)
8. [Glossary](#8-glossary)
9. [Why it is built this way](#9-why-it-is-built-this-way)
10. [Reading order and questions you may be asked](#10-reading-order-and-questions-you-may-be-asked)

---

## 1. The big picture

StudyPilot has two halves that talk over HTTP:

```
 Browser (React)                         Backend (Python, FastAPI)
 ───────────────                         ─────────────────────────
 Chat page        ──┐                    api.py  (all HTTP routes)
 Flashcards page  ──┼── /api/... JSON ──►   │
 Quiz page        ──┘                       ├── rag/      read files, chunk, embed, search
                                            ├── llm/      talk to the language models
                                            ├── study/    flashcards and quizzes
                                            └── db.py     SQLite database

                                         Stored on disk:
                                            data/documents/   the uploaded files
                                            chroma_db/        text chunks + embeddings
                                            studypilot.db     decks, cards, quizzes

                                         Language models:
                                            Ollama (local GPU)  -> chat answers
                                            Gemini (cloud)      -> flashcards, quizzes, grading
```

The four things a user can do, and the code that handles each:

| Feature | What the user does | Main backend code | Main frontend code |
|---|---|---|---|
| **Library** | Uploads a PDF/image or pastes a YouTube link | `rag/loader.py`, `rag/ocr.py`, `rag/youtube.py`, `rag/indexer.py` | `components/SourcePanel.jsx` |
| **Chat** | Asks questions, gets cited answers | `rag/pipeline.py`, `llm/llm.py` | `pages/Chat.jsx`, `components/Message.jsx` |
| **Flashcards** | Makes decks, revises with spaced repetition | `study/flashcards.py`, `llm/gemini.py` | `pages/Flashcards.jsx` |
| **Quiz** | Takes a quiz, gets marks and feedback | `study/quiz.py`, `llm/gemini.py` | `pages/Quiz.jsx` |

The central idea is **RAG (Retrieval-Augmented Generation)**: before asking a language model
anything, the code first *searches the student's own notes* for the most relevant pieces and
puts them into the prompt. The model then answers from those pieces instead of from memory.

---

## 2. Folder map

```
StudyPilot/
├── backend/
│   ├── api.py               ★ START HERE. Every HTTP route the frontend can call.
│   ├── db.py                SQLite tables + the get_db() helper.
│   ├── main.py              Terminal version of the chat (no browser needed).
│   ├── requirements.txt     Python packages.
│   ├── .env                 Settings and API keys (never committed).
│   │
│   ├── rag/                 Everything about the study library and searching it
│   │   ├── loader.py        Reads a PDF or image into "pages" of text (uses OCR when needed).
│   │   ├── ocr.py           Reads text from images with EasyOCR.
│   │   ├── youtube.py       Downloads a YouTube transcript and turns it into "pages".
│   │   ├── chunker.py       Cuts pages into small overlapping chunks.
│   │   ├── indexer.py       Chunks → embeddings → ChromaDB. Also a command-line tool.
│   │   └── pipeline.py      Searches ChromaDB for a question (retrieval).
│   │
│   ├── llm/                 Talking to language models
│   │   ├── llm.py           Local model (Ollama): prompts, normal + streaming answers.
│   │   └── gemini.py        Cloud model (Gemini): returns JSON in a fixed shape.
│   │
│   ├── study/               Revision features
│   │   ├── common.py        Small helpers shared by flashcards and quiz.
│   │   ├── flashcards.py    Making decks + the Leitner spaced-repetition logic.
│   │   └── quiz.py          Making quizzes, grading them, missed questions → cards.
│   │
│   ├── data/documents/      Uploaded files are saved here.
│   ├── chroma_db/           The vector database (created automatically).
│   └── studypilot.db        The SQLite database (created automatically).
│
├── frontend/
│   ├── vite.config.js       Dev server; forwards /api/... to the backend on port 8000.
│   └── src/
│       ├── main.jsx         Starts React.
│       ├── App.jsx          Which URL shows which page.
│       ├── index.css        Shared styles (colours, chat page).
│       ├── lib/api.js       ★ Every call to the backend lives here.
│       ├── pages/
│       │   ├── Landing.jsx  Home page (static).
│       │   ├── Chat.jsx     The chat page.
│       │   ├── Flashcards.jsx   Decks, deck view, study session.
│       │   ├── Quiz.jsx     New quiz, taking a quiz, results.
│       │   ├── landing.css  Styles for the home page.
│       │   └── study.css    Styles for flashcards and quiz pages.
│       └── components/
│           ├── Sidebar.jsx      Logo + Chat/Flashcards/Quiz tabs (shared).
│           ├── SourcePanel.jsx  Chat sidebar: upload, YouTube box, library list.
│           ├── Message.jsx      One chat bubble; turns citations into chips.
│           └── LoadingScreen.jsx  Full-screen loader shown when entering the app.
│
├── training/dataset.jsonl   Examples for a future fine-tuned short-answer grader.
├── report/                  The internship report (LaTeX).
├── docs/                    This guide.
└── CLAUDE.md                Notes for AI coding assistants about this project.
```

Not part of the app: `backend/test_chroma.py` and `backend/testrag.py` are old experiments.

---

## 3. How to run it

```bash
# 1. Ollama must be running with the chat model (it usually starts with Windows)
ollama list                       # should show qwen2.5:1.5b

# 2. Backend
cd backend
venv\Scripts\activate
uvicorn api:app --reload --port 8000
#   --reload restarts the server whenever you save a .py file
#   http://localhost:8000/docs shows every route and lets you try them

# 3. Frontend (second terminal)
cd frontend
npm run dev                       # open http://localhost:5173
```

Other useful commands (run inside `backend/` with the venv active):

```bash
python main.py                    # chat in the terminal
python -m rag.indexer             # (re)index everything in data/documents
python -m rag.indexer notes.pdf   # index one file
```

Settings in `backend/.env`:

| Variable | Meaning |
|---|---|
| `LLM_BASE_URL` | Where Ollama is (`http://localhost:11434/v1`) |
| `LLM_API_KEY` | Any text for Ollama (it doesn't check it) |
| `LLM_MODEL` | Chat model, e.g. `qwen2.5:1.5b` |
| `GEMINI_API_KEY` | Free key from Google AI Studio, for flashcards and quizzes |
| `GEMINI_MODEL` | Optional; defaults to `gemini-3.5-flash-lite` |

---

## 4. Walk-throughs: following real actions through the code

The best way to learn the code is to follow one action from the button click to the database
and back. Open the files mentioned and read along.

### 4.1 Uploading a PDF

```
User picks a file
  → SourcePanel.jsx  onFile()  → run(() => uploadDocument(file))
  → api.js           uploadDocument()  sends POST /api/upload (multipart form)
  → api.py           upload()
        1. checks the extension is allowed (SUPPORTED_EXTENSIONS)
        2. saves the file to data/documents/
        3. indexer.index_document(path)
  → indexer.py       index_document()  → load_document(path) → index_pages(pages, name)
  → loader.py        load_document()  picks the reader by extension:
        .pdf  → extract_pages_from_pdf()  (PyMuPDF; OCR for pages with < 50 characters)
        image → extract_pages_from_image()  (OCR)
  → indexer.py       index_pages()
        1. create_chunks(pages)          (chunker.py: 800 chars, 120 overlap)
        2. delete old chunks of this file (so re-uploading doesn't duplicate)
        3. embedding_model.encode(texts) (all-MiniLM-L6-v2 → 384 numbers per chunk)
        4. collection.add(...)           (store in ChromaDB with source + page)
  ← returns {"name", "kind": "file", "chunks"}
  → SourcePanel.jsx  onAdd() adds the file to the "Library" list
```

**The key data shape** is a "page": `{"source": "notes.pdf", "page": 3, "text": "..."}`.
PDFs, images and YouTube videos are all turned into a list of these. After that, everything
uses the same code, which is why `index_pages()` works for all three.

### 4.2 Asking a question in the chat (streaming)

```
User types a question and presses Enter
  → Chat.jsx   send()
        1. builds `history` from the last 6 messages (with "(Sources: ...)" notes)
        2. adds the question + an EMPTY answer bubble to `messages`
        3. calls askQuestion(question, history, { onSources, onToken })
  → api.js     askQuestion()  sends POST /api/chat and reads the reply line by line
  → api.py     chat()
        1. sources = rag.retrieve(question)          ← search, no LLM yet
        2. returns StreamingResponse(generate())
  → pipeline.py  retrieve()
        1. embeds the question
        2. asks ChromaDB for the 4 closest chunks
        3. DROPS chunks with distance > 0.65 (RELEVANCE_THRESHOLD)
        → returns the relevant chunks, or [] if nothing is relevant
  → api.py     generate()  (runs while the answer is being written)
        yields {"type": "sources", ...}                once
        yields {"type": "token", "text": "..."}        many times
        yields {"type": "done"}                        at the end
  → llm.py     stream_answer() → build_messages()
        sources found → STUDY_PROMPT + excerpts labelled "[file, page N]"
        no sources    → GENERAL_PROMPT (normal chat, no excerpts)
  ← each piece of text arrives in the browser
  → api.js     calls onToken(text) for every "token" line
  → Chat.jsx   updateAnswer() appends the text to the last message → React re-renders
  → Message.jsx  renderWithCitations() turns "[file, page N]" into pink chips
```

**Things to notice:**
- The **search happens before streaming starts**, so the browser gets the sources first.
- **Memory is in the browser.** The server keeps nothing between questions. Every request
  carries the recent conversation (`history`).
- **Errors during streaming** can't change the HTTP status (it's already `200`), so they're
  sent as a `{"type": "error"}` line, and `askQuestion()` turns that into a thrown `Error`.

### 4.3 Making a flashcard deck and revising

```
Make a deck
  → Flashcards.jsx  NewDeckForm.submit()  → createDeck(topic, count)
  → api.py          create_deck()
        1. chunks = find_material(topic)                 (retrieve, 8 chunks)
        2. cards  = flashcards.generate_cards(topic, count, chunks)
        3. return flashcards.save_deck(topic, cards)
  → flashcards.py   generate_cards()
        builds a prompt with the excerpts, calls generate_json(prompt, CARDS_SCHEMA)
        keeps only complete cards; check_source() removes made-up sources
  → gemini.py       generate_json()   Gemini replies in exactly the CARDS_SCHEMA shape
  → flashcards.py   save_deck()  inserts the deck + cards (box 1, due today) into SQLite

Revise
  → Flashcards.jsx  DeckView → "Study N due cards" → StudySession
  → user flips a card and clicks "Again" or "Got it"
  → StudySession.answer(knewIt) → reviewCard(card.id, knewIt)
  → api.py          review_card() → flashcards.review_card()
        Got it → box + 1 (max 5);  Again → box 1
        due_date = today + DAYS_UNTIL_NEXT_REVIEW[box]   (1, 2, 4, 8 or 16 days)
  → "Again" cards are also put at the back of the session queue in the browser
```

### 4.4 Taking a quiz

```
Make a quiz
  → Quiz.jsx      NewQuizForm.submit() → createQuiz(topic, count, type)
  → api.py        create_quiz() → find_material() → quiz.generate_questions() → quiz.save_quiz()
  → quiz.py       generate_questions()
        Gemini writes questions (QUESTIONS_SCHEMA)
        Python checks: MCQ has 4 options and a valid answer; shuffles the options
  → quiz.py       get_quiz()  returns questions WITHOUT answers (not submitted yet)

Submit
  → Quiz.jsx      TakeQuiz.submit() → submitQuiz(id, answers)
  → api.py        submit_quiz() → quiz.submit_quiz()
        MCQ:   compared in Python (answer == correct_option) → 1 or 0 points
        Short: ALL short answers go to grade_short_answers() in ONE Gemini call
               → score 0–5 each → points = score / 5
        quiz score = 100 × total points ÷ number of questions
  → quiz.py       get_quiz()  now includes answers, explanations and grading
  → Quiz.jsx      Results shows everything

Missed → flashcards
  → Results.makeDeck() → missedToDeck(id)
  → api.py        missed_questions_to_deck() → quiz.missed_question_cards() → flashcards.save_deck()
        a question is "missed" if it earned < 60% of its points; no LLM call needed
```

---

## 5. Backend reference (file by file)

Each file lists its job, its important constants, and every function: what it does and who
calls it.

### `api.py`: the HTTP layer

**Job:** receives HTTP requests, checks their data, calls the right module, and returns JSON.
It contains no real logic of its own. At startup it creates **one** `DocumentIndexer` and
**one** `RAGPipeline` (loading the embedding model once), and calls `init_db()`.

**Request bodies** (Pydantic models; FastAPI checks incoming JSON against them automatically
and returns error 422 if it doesn't match):

| Model | Fields |
|---|---|
| `ChatMessage` | `role` ("user" or "assistant"), `content` |
| `ChatRequest` | `question`, `top_k` (default 4), `history` (list of `ChatMessage`) |
| `YoutubeRequest` | `url` |
| `DeckRequest` | `topic`, `count` (3–20, default 10) |
| `ReviewRequest` | `knew_it` (true/false) |
| `QuizRequest` | `topic`, `count` (3–15, default 5), `type` ("mcq", "short" or "mixed") |
| `SubmitRequest` | `answers`: `{question_id: answer}` |

**Routes:**

| Route | Function | What it does |
|---|---|---|
| `POST /api/chat` | `chat()` | Retrieves chunks, then streams the answer as NDJSON lines |
| `POST /api/upload` | `upload()` | Saves an uploaded file and indexes it |
| `POST /api/youtube` | `add_youtube()` | Fetches a transcript and indexes it |
| `GET /api/documents` | `list_documents()` | Lists everything in the library |
| `POST /api/decks` | `create_deck()` | Generates and saves a flashcard deck |
| `GET /api/decks` | `list_decks()` | All decks with total and due counts |
| `GET /api/decks/{id}` | `get_deck()` | One deck with its cards |
| `DELETE /api/decks/{id}` | `delete_deck()` | Deletes a deck (and its cards) |
| `POST /api/cards/{id}/review` | `review_card()` | Records "Again" / "Got it" |
| `POST /api/quizzes` | `create_quiz()` | Generates and saves a quiz |
| `GET /api/quizzes` | `list_quizzes()` | Quiz history |
| `GET /api/quizzes/{id}` | `get_quiz()` | One quiz (answers hidden until submitted) |
| `DELETE /api/quizzes/{id}` | `delete_quiz()` | Deletes a quiz |
| `POST /api/quizzes/{id}/submit` | `submit_quiz()` | Grades the quiz |
| `POST /api/quizzes/{id}/flashcards` | `missed_questions_to_deck()` | Missed questions → new deck |

**Helpers:**

| Function | What it does |
|---|---|
| `to_line(data)` | Turns a dict into one JSON line + `"\n"` (for streaming) |
| `generate()` (inside `chat`) | A generator that `yield`s the stream lines |
| `find_material(topic)` | Retrieves 8 chunks for a deck or quiz; errors if the library is empty or nothing matches |
| `not_found_or_bad_request(exc)` | Turns a `ValueError` into HTTP 404 ("not found") or 400 |

**Error handling pattern:** module code raises `ValueError` for user mistakes and
`CloudLLMError` for Gemini problems; `api.py` converts them into `HTTPException`s with a
readable `detail` message, which the frontend shows to the user.

### `db.py`: the SQLite database

| Name | What it is |
|---|---|
| `DB_PATH` | Location of `studypilot.db` |
| `SCHEMA` | `CREATE TABLE IF NOT EXISTS` statements for `decks`, `cards`, `quizzes`, `questions` |
| `get_db()` | Context manager: `with get_db() as db:` opens a connection, **commits** at the end of the block and **always closes** it. Rows behave like dicts (`row["topic"]`). Turns on foreign keys so deleting a deck deletes its cards. |
| `init_db()` | Creates the tables if they don't exist (called once at startup) |

### `main.py`: terminal chat

`main()` creates a `RAGPipeline` and loops: read a question → `rag.ask()` → print the answer
and its sources. Useful for testing the RAG part without the browser. (Its output says
"L2 distance", but the collection actually uses **cosine** distance; that's only a label.)

### `rag/loader.py`: reading files into pages

| Name | What it does |
|---|---|
| `IMAGE_EXTENSIONS`, `SUPPORTED_EXTENSIONS` | Which file types are accepted |
| `MIN_TEXT_CHARS = 50` | A PDF page with less text than this is treated as scanned |
| `extract_pages_from_pdf(path, use_ocr=True)` | Reads each page with PyMuPDF; uses OCR (`ocr_pdf_page`) when a page has almost no text |
| `extract_pages_from_image(path)` | OCRs an image; the whole image counts as page 1 |
| `load_document(path)` | Chooses one of the two above from the file extension |

### `rag/ocr.py`: reading text from images

| Function | What it does |
|---|---|
| `get_reader()` | Loads the EasyOCR model **once** (the first time it's needed) and reuses it. Uses the GPU if PyTorch has CUDA. `verbose=False` avoids a crash on Windows. |
| `ocr_image(image)` | Reads text from a file path / bytes / numpy image; frees GPU memory afterwards (`torch.cuda.empty_cache()`) |
| `ocr_pdf_page(page, dpi=200)` | Renders a PDF page to an image and OCRs it |

### `rag/youtube.py`: YouTube lectures

| Name | What it does |
|---|---|
| `SECTION_SECONDS = 300` | Transcript is grouped into 5-minute "pages" |
| `get_video_id(url)` | Gets the id from `youtube.com/watch?v=…`, `youtu.be/…`, `/shorts/…`, `/embed/…` links |
| `get_video_title(url)` | Gets the title from YouTube's oEmbed address (no API key needed) |
| `load_youtube_transcript(url)` | Downloads the transcript and returns `(source_name, pages)`; source name is `"<title> (YouTube)"` |

### `rag/chunker.py`: splitting text

`create_chunks(pages, chunk_size=800, overlap=120)` cuts each page into pieces of up to 800
characters. Each new chunk starts 120 characters before the previous one ended, so a sentence
cut at an edge still appears whole in one chunk. Each chunk gets an id like
`notes.pdf::p3::c0` (file, page, chunk number).

### `rag/indexer.py`: storing chunks in ChromaDB

**Constants shared with `pipeline.py`** (so indexing and searching always match):
`CHROMA_PATH`, `COLLECTION_NAME = "studypilot_documents"`, `EMBEDDING_MODEL = "all-MiniLM-L6-v2"`.

**Class `DocumentIndexer`:**

| Method | What it does |
|---|---|
| `__init__(db_path, embedding_model=None)` | Opens ChromaDB, creates the collection (cosine distance) if needed, loads the embedding model |
| `index_document(path)` | `load_document()` then `index_pages()`; for files |
| `index_pages(pages, source)` | Chunk → delete old chunks of `source` → embed → store. Used for files **and** YouTube |
| `list_sources()` | Unique source names in the library |
| `index_directory(directory)` | Indexes every supported file in a folder |

Running `python -m rag.indexer` uses the `if __name__ == "__main__":` block at the bottom.

### `rag/pipeline.py`: searching (retrieval)

| Name | What it does |
|---|---|
| `NO_MATERIAL_MESSAGE` | Message shown when the library is empty |
| `RELEVANCE_THRESHOLD = 0.65` | Chunks further away than this are ignored (measured: note questions 0.13–0.61, general questions 0.69–0.86) |
| `RAGPipeline(indexer=None)` | Reuses the indexer's collection and embedding model |
| `retrieve(question, top_k=4)` | Embeds the question, gets the closest chunks, **drops irrelevant ones**, returns a list of `{text, source, page, chunk_id, distance}` (or `[]`) |
| `ask(question, top_k=4)` | `retrieve()` + `generate_answer()` in one call; used by `main.py` |

### `llm/llm.py`: the local chat model (Ollama)

| Name | What it does |
|---|---|
| `STUDY_PROMPT` | System prompt when relevant chunks were found: answer from the excerpts, cite `[file, page N]` |
| `GENERAL_PROMPT` | System prompt when nothing relevant was found: normal chat; kept short because the small model follows short rules better |
| `HISTORY_LIMIT = 6` | How many earlier messages are included |
| `get_client()` | An `OpenAI` client pointed at Ollama (`LLM_BASE_URL`) |
| `build_messages(question, chunks, history)` | Builds the message list: system prompt → history → question (+ excerpts and a citation reminder with a **real** example label) |
| `generate_answer(...)` | Whole answer at once (used by `main.py`) |
| `stream_answer(...)` | `stream=True`; a generator that `yield`s each piece of text as it arrives |

`llm/__init__.py` re-exports `generate_answer` and `stream_answer`, so other files can write
`from llm import stream_answer`.

### `llm/gemini.py`: the cloud model (Gemini)

| Name | What it does |
|---|---|
| `GEMINI_BASE_URL` | Gemini's OpenAI-compatible address |
| `CloudLLMError` | Exception with a message that is safe to show to the user |
| `generate_json(prompt, schema, schema_name)` | Sends one prompt with `response_format=json_schema`, so Gemini **must** reply in that exact shape; returns a Python dict. Forces **IPv4** (IPv6 to Google is broken on this network), retries 3 times, and turns rate-limit / connection / key errors into readable `CloudLLMError`s |

### `study/common.py`: shared helpers

| Function | What it does |
|---|---|
| `format_excerpts(chunks)` | Chunks → numbered text block with `[file, page N]` labels for Gemini prompts |
| `check_source(item, chunks)` | Keeps an item's source/page only if it really is one of the chunks sent; otherwise `(None, None)`. Stops made-up citations. |
| `today()` / `now()` | Today's date `YYYY-MM-DD` / current time as text |

### `study/flashcards.py`: decks and spaced repetition

| Name | What it does |
|---|---|
| `DAYS_UNTIL_NEXT_REVIEW` | `{1: 1, 2: 2, 3: 4, 4: 8, 5: 16}`: box → days |
| `review_card(card_id, knew_it)` | Moves the card up a box (or back to 1) and sets its next due date |
| `CARDS_SCHEMA` | The JSON shape Gemini must return: `{"cards": [{front, back, source, page}]}` |
| `generate_cards(topic, count, chunks)` | Prompt → Gemini → keep complete cards, check sources |
| `save_deck(topic, cards)` | Inserts the deck and its cards (box 1, due today) |
| `list_decks()` | All decks with `total` and `due` counts (one SQL query with `LEFT JOIN … GROUP BY`) |
| `get_deck(deck_id)` | One deck with all its cards |
| `delete_deck(deck_id)` | Deletes the deck; its cards go too (`ON DELETE CASCADE`) |

### `study/quiz.py`: quizzes and grading

| Name | What it does |
|---|---|
| `QUESTIONS_SCHEMA` | JSON shape for questions: type, question, options, correct_option, reference_answer, explanation, source, page |
| `QUESTION_TYPES` | Prompt wording for "mcq", "short" and "mixed" |
| `generate_questions(topic, count, type, chunks)` | Gemini writes questions; Python checks MCQs (exactly 4 options, valid answer), **shuffles options**, drops wrong types |
| `save_quiz(topic, questions)` | Inserts the quiz and its questions (options stored as JSON text) |
| `get_quiz(quiz_id)` | Returns the quiz; **answers, explanations and grades only after submission** |
| `list_quizzes()` | Quiz history with question counts |
| `delete_quiz(quiz_id)` | Deletes a quiz and its questions |
| `GRADES_SCHEMA` | Grading shape, same as `training/dataset.jsonl`: score, correct_concepts, missing_concepts, feedback, next_action |
| `grade_short_answers(items)` | Grades **all** short answers in **one** Gemini call (saves the free daily limit); returns `{question_id: grade}` |
| `submit_quiz(quiz_id, answers)` | Grades MCQs in Python, short answers with Gemini, saves answers/points/score; refuses a second submission |
| `missed_question_cards(quiz_id)` | Turns questions with < 60% points into flashcards (question → answer + explanation) |

---

## 6. Frontend reference (file by file)

**React in one paragraph:** a component is a function that returns HTML-like JSX. `useState`
holds data that can change; when you call its setter, React re-draws the component.
`useEffect(fn, [])` runs `fn` once when the component first appears (used here to load data).

### `vite.config.js`
Runs the dev server on port 5173 and **proxies** `/api/...` to `http://localhost:8000`, so
the browser only ever talks to one address (no CORS setup needed).

### `main.jsx` and `App.jsx`
`main.jsx` starts React inside `<BrowserRouter>`. `App.jsx` maps URLs to pages:
`/` → `Landing`, `/chat` → `Chat`, `/flashcards` → `Flashcards`, `/quiz` → `Quiz`; anything
else redirects to `/`.

### `lib/api.js`: every backend call

| Function | What it does |
|---|---|
| `send(path, options)` | `fetch` + turns network/HTTP errors into readable `Error`s (uses the backend's `detail`) |
| `request(path, options)` | `send` + parse JSON |
| `postJson(path, body)` | POST with a JSON body |
| `askQuestion(question, history, {onSources, onToken})` | Streams a chat answer: reads the response with `getReader()`, keeps an unfinished line in a buffer, parses each complete line and calls the matching callback; throws on an `error` line |
| `uploadDocument`, `addYoutube`, `listDocuments` | Library |
| `createDeck`, `listDecks`, `getDeck`, `deleteDeck`, `reviewCard` | Flashcards |
| `createQuiz`, `listQuizzes`, `getQuiz`, `deleteQuiz`, `submitQuiz`, `missedToDeck` | Quiz |

### `pages/Chat.jsx`

| Name | What it does |
|---|---|
| state `messages` | List of `{role, content, sources, question, general, error}` |
| state `sources` | The library list shown in the sidebar (loaded once with `listDocuments`) |
| `sourceNote(m)` | Adds `(Sources: file page N, …)` to earlier answers in the history |
| `updateAnswer(change)` | Changes the **last** message (the answer being streamed) |
| `send(e)` | Builds history → adds question + empty answer → `askQuestion` with callbacks |
| `onKeyDown(e)` | Enter sends; Shift+Enter makes a new line |
| `waitingForFirstWord` | Shows the typing dots until the first words arrive |

### `components/Message.jsx`

| Name | What it does |
|---|---|
| `PATTERN` | Regex matching `[file, page N]` **or** `**bold**` |
| `renderWithCitations(text)` | Splits the text into plain parts, `<strong>` parts and pink citation chips |
| `Message(...)` | User bubble, or assistant answer with: "General answer" label, "View N retrieved passages" toggle, "Make flashcards" link (`/flashcards?topic=…`) |

### `components/SourcePanel.jsx` and `components/Sidebar.jsx`
`Sidebar` is the shared left panel (logo + tabs) that every app page wraps its own content in.
Its `switchTab()` makes tab changes smooth: instead of switching instantly, it adds the class
`page-leaving` to `<body>` (CSS fades the current page out), waits 180 ms, then navigates. The
new page fades in by itself through the `page-in` animation in `index.css`, and Sidebar's
`useEffect` removes `page-leaving` again. Clicking the current tab, or having "reduce motion"
turned on, skips the delay.
`SourcePanel` is the chat page's sidebar content: `run(fn)` handles the busy state and errors
for any upload, `onFile` uploads a file, `onYoutube` adds a link, `fileLabel(name)` shows
"PDF" or "IMG".

### `components/LoadingScreen.jsx`
Shown only when the user enters the app from the landing page: the landing page's links pass
`state={{ fromLanding: true }}`, and `Chat.jsx` reads it with `useLocation()`. The loader
stays until the library has loaded (`ready`) **and** at least 900 ms have passed (so it
doesn't just flash), then fades out for 450 ms and calls `onDone()`. If the backend is down,
`Chat.jsx` still marks the library as loaded (`.finally()`), so the loader never gets stuck.
Switching tabs back to Chat doesn't show it, because those links carry no state.

### `pages/Flashcards.jsx`

| Component / function | What it does |
|---|---|
| `today()` | Local date as `YYYY-MM-DD` (same format as the backend; **not** UTC) |
| `Flashcards` | Page shell: deck list in the sidebar; shows one of the three views below. Opens `?deck=ID` from the URL |
| `NewDeckForm` | Topic + number of cards; reads `?topic=` from the URL (from chat's "Make flashcards") |
| `DeckView` | Deck info, "Study due cards" / "Practise all cards", list of cards with box numbers |
| `StudySession` | `queue` of cards; flip the card; `answer(knewIt)` calls `reviewCard`, and "Again" moves the card to the back of the queue |

### `pages/Quiz.jsx`

| Component | What it does |
|---|---|
| `Quiz` | Page shell: history in the sidebar; shows form, quiz or results |
| `NewQuizForm` | Topic, number of questions, type |
| `TakeQuiz` | One question at a time; `answers` state; `submit()` warns about unanswered questions |
| `Results` | Score, review of every question, "Turn missed questions into flashcards" |
| `McqReview` / `ShortReview` | How one question is shown in the results |

### `pages/Landing.jsx`
Static home page; no backend calls. `pipeline` is the list shown under "Under the hood".

---

## 7. Where the data lives

### SQLite (`backend/studypilot.db`)

```
decks      id, topic, created_at
  └─ cards       id, deck_id → decks.id, front, back, source, page,
                 box (1–5), due_date (YYYY-MM-DD)

quizzes    id, topic, created_at, submitted_at (NULL until submitted), score (0–100)
  └─ questions   id, quiz_id → quizzes.id, type ("mcq"/"short"), question,
                 options (JSON text), correct_option, reference_answer, explanation,
                 source, page, user_answer, points (0–1), grading (JSON text)
```

You can look inside with any SQLite viewer (for example the "SQLite Viewer" VS Code extension).

### ChromaDB (`backend/chroma_db/`)

One collection, `studypilot_documents`. Each item is one chunk:

| Field | Example |
|---|---|
| id | `class19.pdf::p4::c1` |
| document (the text) | `"A multi-core processor has..."` |
| embedding | 384 numbers |
| metadata | `{"source": "class19.pdf", "page": 4, "chunk_id": "class19.pdf::p4::c1"}` |

### Files
Uploaded files are copied to `backend/data/documents/`. They're only needed to rebuild the
index (`python -m rag.indexer`); search uses ChromaDB.

---

## 8. Glossary

| Term | Meaning in this project |
|---|---|
| **LLM** | Large Language Model: Qwen2.5 1.5B (local) or Gemini (cloud) |
| **Token** | A small piece of a word; models read and write tokens. Streaming sends text a few tokens at a time |
| **Embedding** | A list of numbers (384 here) that represents the meaning of a text |
| **Chunk** | A piece of up to 800 characters of a page, stored with its embedding |
| **Cosine distance** | How different two embeddings are: 0 = same meaning, bigger = less related |
| **RAG** | Retrieve relevant chunks first, then let the LLM answer from them |
| **System prompt** | The fixed instructions sent before the user's message |
| **Stateless** | The model remembers nothing between calls; history must be sent each time |
| **Streaming / NDJSON** | Sending the answer in pieces, one JSON object per line, while it's being written |
| **JSON schema** | A description of the exact JSON shape; Gemini is forced to follow it |
| **OCR** | Reading text from an image (EasyOCR) |
| **Leitner system** | Flashcards move between 5 boxes; higher boxes come back less often |
| **Pydantic model** | A class describing the expected request data; FastAPI validates against it |
| **Thread pool** | Plain `def` routes run in separate threads, so slow work doesn't block other requests |
| **Proxy (Vite)** | The dev server forwards `/api` requests to the backend |

---

## 9. Why it is built this way

| Decision | Reason |
|---|---|
| Plain `def` routes, not `async def` | OCR, embeddings and LLM calls are slow and blocking. FastAPI runs `def` routes in a thread pool, so an upload doesn't freeze the chat. |
| Embedding model loaded once at startup | Loading takes seconds; `RAGPipeline` reuses the indexer's model and collection. |
| Same constants for indexing and search | If they used different models or collections, search would silently return nonsense. |
| Relevance cut-off 0.65 | Measured, not guessed. Without it, "how are you" was answered with database sharding notes. |
| Two prompts (study / general) | One prompt can't both "answer only from the notes" and "chat normally". |
| Memory kept in the browser | Keeps the server simple and stateless; the cost is that refreshing clears the chat. |
| Sources attached to history | Lets the model answer "was that from my PDF?" correctly. |
| Excerpts labelled `[file, page N]`, not "Passage 1" | Numbered labels leaked into answers as "Passage 2 says…". |
| Local model for chat, Gemini for study tools | Chat stays private and free; Gemini is more reliable for JSON and grading, and only one model runs on the 4 GB GPU. |
| JSON schema for Gemini | Forces a fixed shape so code can check it, instead of parsing free text. |
| `check_source()` | The model must not invent page numbers. |
| MCQs graded in Python | Instant and always correct; no reason to ask a model. |
| All short answers graded in one call | Saves the free daily request limit. |
| Answers hidden until submit | Otherwise they'd be visible in the browser's developer tools. |
| IPv4 for Gemini | IPv6 to Google corrupts large requests on this network (SSL "bad record mac"). |
| `torch.cuda.empty_cache()` after OCR | Otherwise PyTorch keeps ~3 GB of GPU memory and Ollama has no room. |
| Local date, not UTC, for "due today" | In India, UTC is a day behind before 5:30 AM. |

---

## 10. Reading order and questions you may be asked

### Suggested reading order

1. `backend/rag/chunker.py`: short and self-contained.
2. `backend/rag/loader.py` → `rag/indexer.py`: how notes get into the library.
3. `backend/rag/pipeline.py` → `llm/llm.py`: search + answer (the core RAG idea).
4. `backend/api.py`: only the `chat()` and `upload()` routes at first.
5. `frontend/src/lib/api.js` → `pages/Chat.jsx` → `components/Message.jsx`.
6. `backend/study/flashcards.py` → `pages/Flashcards.jsx`.
7. `backend/study/quiz.py` → `pages/Quiz.jsx`.
8. `backend/llm/gemini.py` and `db.py`.

**Try it yourself:** open `http://localhost:8000/docs`, run `POST /api/chat` with a question,
and compare the output with Walk-through 4.2. Or change `RELEVANCE_THRESHOLD` to 0.3 and see
how many questions switch to "General answer".

### Questions you may be asked (with short answers)

**What is RAG and why did you use it instead of fine-tuning?**
RAG searches the student's notes and gives the relevant parts to the model at question time.
Fine-tuning changes the model's behaviour but is a poor way to add new, changing knowledge;
a student's notes change all the time, and RAG needs no retraining.

**How does the search find relevant text?**
Every chunk is stored with an embedding. The question is embedded the same way, and ChromaDB
returns the chunks with the smallest cosine distance. Chunks above 0.65 are ignored.

**How does the chat remember the conversation?**
It doesn't, on the server. The browser sends the last 6 messages with every question, and
`build_messages()` puts them between the system prompt and the new question.

**How does streaming work?**
The backend returns a `StreamingResponse` from a generator that `yield`s one JSON line per
piece of text. The frontend reads the response body with a reader, splits it into lines and
appends each piece to the answer.

**How do you stop the model from making up sources?**
Chat excerpts carry real `[file, page N]` labels; for flashcards and quizzes,
`check_source()` drops any source that wasn't one of the chunks sent.

**How does OCR decide when to run?**
If a PDF page has fewer than 50 characters of selectable text, it's treated as scanned and
OCR'd. Image files are always OCR'd.

**How is a quiz graded?**
MCQs by comparing indexes in Python. Short answers by Gemini, all in one request, returning a
0–5 score with correct and missing points. Points are averaged into a percentage.

**How does spaced repetition work?**
Leitner boxes 1–5. "Got it" moves a card up a box, "Again" sends it to box 1. The next review
is 1, 2, 4, 8 or 16 days later depending on the box.

**Why plain `def` instead of `async def`?**
The heavy work is blocking (not async-aware). FastAPI runs `def` routes in a thread pool, so
they run in parallel; an `async def` with blocking code would freeze the whole server.

**What would you improve next?**
Query rewriting for follow-up questions, deleting documents, a login, a bigger local model for
more reliable citations, and fine-tuning a small grader with QLoRA on `training/dataset.jsonl`.
