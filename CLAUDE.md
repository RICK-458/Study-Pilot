# StudyPilot

Personal study assistant built as an internship project: **RAG + LLM (+ optional fine-tuning)**.
Users add PDFs, images (OCR) and YouTube links, then chat with their material, make
flashcards, and take quizzes. Answers cite the source file and page.

**The developer has to explain this code, and describes themselves as intermediate level.
Keep code simple and readable:** plain functions, short numbered comments
(`# 1. ...`), no clever abstractions. Match the existing style.

## Running it

```
# Ollama must be running with the chat model (qwen2.5:1.5b)
cd backend
venv\Scripts\activate
uvicorn api:app --reload --port 8000

cd frontend
npm run dev        # http://localhost:5173 (Vite proxies /api -> :8000)
```

- **Always use `backend/venv`.** System Python 3.11 is missing packages (EasyOCR) and
  the venv now has everything. venv packages and pip temp files must stay on **D:**,
  because C: has only about 2 GB free.
- Re-index `data/documents` from the command line: `python -m rag.indexer`.
  For specific files: `python -m rag.indexer file.pdf`.
- `main.py` is a terminal (CLI) chat that uses the non-streaming `rag.ask()`.
- `backend/.env` (git-ignored) holds `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`
  and `GEMINI_API_KEY`. Its lines use `KEY = value` with spaces, which python-dotenv
  handles but a plain `grep '^KEY='` misses.

A beginner-friendly walkthrough of every file and function is in `docs/CODEBASE_GUIDE.md`.
Update it when you add, rename or remove files, functions or routes.

## Architecture

### Backend (`backend/`, FastAPI)

| File | Role |
|---|---|
| `api.py` | All HTTP endpoints. Creates `DocumentIndexer` + `RAGPipeline` once at startup, calls `init_db()` |
| `rag/loader.py` | `load_document(path)`: PDF text per page (PyMuPDF), OCR for pages with <50 chars, images via OCR |
| `rag/ocr.py` | EasyOCR, loaded lazily on first use. GPU if available. PDF pages rendered at 200 DPI |
| `rag/chunker.py` | 800-char chunks, 120 overlap |
| `rag/indexer.py` | `DocumentIndexer`: `index_document(path)`, `index_pages(pages, source)`, `list_sources()`. Holds shared constants (Chroma path, collection `studypilot_documents`, cosine, `all-MiniLM-L6-v2`) |
| `rag/youtube.py` | Transcript via `youtube-transcript-api` 1.x, title via oEmbed. 5-minute sections act as "pages". Source name = `"<title> (YouTube)"` |
| `rag/pipeline.py` | `RAGPipeline(indexer)`: `retrieve(question, top_k)` (search only; drops passages with cosine distance > `RELEVANCE_THRESHOLD` = 0.65) and `ask()` (full answer, used by the CLI) |
| `llm/llm.py` | Local LLM through Ollama's OpenAI-compatible API: `build_messages`, `generate_answer`, `stream_answer`. Two prompts: `STUDY_PROMPT` (relevant passages found, must cite) and `GENERAL_PROMPT` (no relevant passages: small talk or general knowledge). Includes the last `HISTORY_LIMIT` = 6 messages |
| `llm/gemini.py` | `generate_json(prompt, schema, name)`: Gemini structured output, `CloudLLMError` with messages safe to show users |
| `db.py` | SQLite (`studypilot.db`, git-ignored): tables `decks`, `cards`, `quizzes`, `questions`. `get_db()` context manager |
| `study/flashcards.py` | Card generation prompt + Leitner logic + deck database operations |
| `study/quiz.py` | Question generation (multiple-choice options shuffled), grading (multiple choice in Python; all short answers in ONE Gemini call), missed questions -> cards |
| `study/common.py` | `format_excerpts`, `check_source` (drops LLM-invented sources), `today`/`now` |

### Endpoints

- `POST /api/chat {question, history:[{role,content}]}`: **streams NDJSON**: `{"type":"sources"}`, then many `{"type":"token","text"}`, then `{"type":"done"}`. Mid-stream failures are sent as `{"type":"error"}` because status 200 has already gone out.
- `POST /api/upload` (multipart), `POST /api/youtube`, `GET /api/documents`
- `POST/GET /api/decks`, `GET/DELETE /api/decks/{id}`, `POST /api/cards/{id}/review {knew_it}`
- `POST/GET /api/quizzes`, `GET/DELETE /api/quizzes/{id}`, `POST /api/quizzes/{id}/submit {answers:{id:answer}}`, `POST /api/quizzes/{id}/flashcards`

Endpoints use plain `def` on purpose, so FastAPI runs them in a threadpool and slow
OCR or LLM work doesn't block other requests. Upload and chat run in parallel; this was tested.

### Frontend (`frontend/`, React + Vite, plain CSS)

- Routes: `/` landing page, `/chat`, `/flashcards` (`?topic=` prefills the form, `?deck=` opens a deck), `/quiz`
- `lib/api.js`: every API call. `askQuestion()` reads the NDJSON stream with `getReader()` and buffers partial lines.
- `components/Sidebar.jsx`: logo + Chat/Flashcards/Quiz tabs, shared by all app pages. `SourcePanel.jsx` is the chat sidebar content.
- `components/Message.jsx`: turns `[file.pdf, page N]` into pink citation chips and `**bold**` into bold. Has the "Make flashcards" link.
- Design: black background, pastel pink/blue/salmon, Geist + Geist Mono fonts. The landing page was redesigned to avoid generic "AI-made" looks: real pipeline details and an example answer instead of filler copy.

## Models and why

- **Chat: local `qwen2.5:1.5b` on Ollama.** It fits entirely on the RTX 2050 (4 GB VRAM), giving 3-10s answers. `qwen3:4b` needed 3.5 GB, ran 33% on CPU, and took about 48s. The small model often leaves out `[file, page]` citations; the "retrieved passages" list still shows sources.
  - Turning off Qwen3 "thinking" did NOT help with the real RAG prompt (only on tiny prompts). `reasoning_effort="none"` even leaked reasoning into the answer. Don't retry this.
- **Flashcards and quiz: Gemini `gemini-3.5-flash-lite`** (free tier; override with `GEMINI_MODEL`). The user did not want two local models running. Cloud is also more reliable for questions and grading. The free tier may use the data Google receives; chat stays local.
- **PyTorch is the CUDA build** (`torch==2.14.1+cu130`, `torchvision==0.29.1+cu130`, installed with `--index-url https://download.pytorch.org/whl/cu130`). `requirements.txt` does NOT pin torch, so a fresh install gets the CPU build.
- **Fine-tuning is not confirmed.** `training/dataset.jsonl` holds short-answer grading examples (`score`, `correct_concepts`, `missing_concepts`, `feedback`, `next_action`). Quiz grading already uses this exact format, so a fine-tuned grader could replace Gemini in `study/quiz.py` later.

## Gotchas (all found and fixed. Don't undo them)

- **Chat has two modes.** Questions about the documents scored 0.13-0.61 cosine distance and general ones ("how are you", "capital of France") scored 0.69-0.86, hence the 0.65 cutoff. With no passage under the cutoff, `sources` is `[]`, the general prompt is used, and the UI shows "General answer · not from your library". Re-measure if you change the embedding model.
- **History sent with each question carries source notes.** The frontend appends `(Sources: file page N)` to earlier library-based answers, so "is this from my PDF?" follow-ups work. Keep `GENERAL_PROMPT` short: the 1.5B model ignored a longer rule list (0/3 vs 3/3 correct).
- **Study-prompt excerpts are labelled only `[file, page N]`, not "Passage 1".** Numbered labels made the model write "Passage 2 says…". The citation reminder sits at the END of the user prompt (the small model follows that better) and uses a REAL label as its example; a made-up `[DBMS.pdf, page 42]` example got copied as a fake citation. Result: 0 "Passage N" mentions, citations in about 5 of 12 answers (a 1.5B model limit).
- **A blank chat page saying "api.js does not provide an export"** is a stale Vite dev-server cache after files were rewritten mid-edit. Re-saving the file (or restarting `npm run dev`) and refreshing the page fixes it.

- **Gemini must use IPv4.** On this network, IPv6 to Google corrupts larger requests (`SSL: SSLV3_ALERT_BAD_RECORD_MAC`) and is about 10x slower. `llm/gemini.py` passes `DefaultHttpxClient(transport=httpx2.HTTPTransport(local_address="0.0.0.0"))`. openai 3.x is built on **httpx2**, not httpx.
- **EasyOCR `verbose=False`**: its download progress bar crashes on non-UTF-8 Windows consoles.
- **OCR calls `torch.cuda.empty_cache()`** after each run: otherwise about 3 GB of VRAM stays reserved and starves Ollama.
- **The frontend's "today" uses the local date** (`toLocaleDateString("en-CA")`), matching the backend. `toISOString()` is UTC and would be off by a day in India before 5:30 AM.
- **Quiz answers are only sent to the browser after submit** (`get_quiz` hides them).
- **`index_pages` deletes a source's old chunks before adding new ones**, so re-indexing replaces instead of duplicating.

## Repo notes

- `backend/test_chroma.py` and `testrag.py` are throwaway experiments. Don't use or edit them as the indexing path.
- Git-ignored: `backend/chroma_db/`, `backend/data/documents/*` (except `consistent_hashing_test.pdf`), `backend/studypilot.db`, `.env`, venvs.
- Ollama models live on C: (about 5 GB). The user chose not to move them.

## Internship report (`report/`)

- `report/studypilot_report.tex` is the internship report (LaTeX). It uses `report/figures/` for screenshots and the certificate, and is modelled on the reference report `internship_report_new_overleaf.pdf` in the same folder. `studypilot_report_overleaf.zip` is the bundle for uploading to Overleaf.
- There is no TeX installation on C:. It compiles locally with Tectonic at `D:\tex-tools\tectonic.exe`, with its cache on D: (`TECTONIC_CACHE_DIR=D:\tex-tools\cache`): `tectonic.exe -X compile studypilot_report.tex`.
- Edit the `.tex` with the Edit tool, not bash heredocs: the Bash tool collapsed `\\` into `\` and broke the TikZ line breaks.
- The numbers in the report (timings, distances, test cases) were measured in this project. Keep them in sync if the app changes.

## Open items

- `concurrency_test.pdf` (a leftover from a concurrency test) is still indexed and shows up as a card or question source. There is **no delete-document feature yet**. Offered: a delete button in the library plus `DELETE /api/documents/{name}`.
- `faiss-cpu` is still in `requirements.txt` even though ChromaDB replaced it.
- Much of the work is uncommitted (see `git status`): OCR, indexer, YouTube, API, streaming, flashcards, quiz, frontend.
- Possible next steps: tighten the chat prompt so the 1.5B model cites more reliably, delete documents, fine-tune the grader if time allows.
