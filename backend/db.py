import sqlite3
from contextlib import contextmanager
from pathlib import Path


# A single database file next to the code (git-ignored)
DB_PATH = Path(__file__).resolve().parent / "studypilot.db"


SCHEMA = """
CREATE TABLE IF NOT EXISTS decks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    topic       TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id   INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    front     TEXT NOT NULL,
    back      TEXT NOT NULL,
    source    TEXT,
    page      INTEGER,
    box       INTEGER NOT NULL DEFAULT 1,   -- Leitner box, 1 to 5
    due_date  TEXT NOT NULL                 -- YYYY-MM-DD
);

CREATE TABLE IF NOT EXISTS quizzes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    topic         TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    submitted_at  TEXT,                     -- NULL until the quiz is submitted
    score         INTEGER                   -- percentage, 0 to 100
);

CREATE TABLE IF NOT EXISTS questions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id           INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    type              TEXT NOT NULL,        -- "mcq" or "short"
    question          TEXT NOT NULL,
    options           TEXT,                 -- JSON list, only for "mcq"
    correct_option    INTEGER,              -- index into options, only for "mcq"
    reference_answer  TEXT,                 -- model answer, only for "short"
    explanation       TEXT,
    source            TEXT,
    page              INTEGER,
    user_answer       TEXT,                 -- filled in on submit
    points            REAL,                 -- 0 to 1, filled in on submit
    grading           TEXT                  -- JSON feedback for "short"
);
"""


@contextmanager
def get_db():
    # Usage:  with get_db() as db:  db.execute(...)
    # Saves the changes when the block ends, and always closes the connection.
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row     # rows behave like dicts
    connection.execute("PRAGMA foreign_keys = ON")

    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db():
    with get_db() as db:
        db.executescript(SCHEMA)
