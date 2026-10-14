import sys
from pathlib import Path

import chromadb
from sentence_transformers import SentenceTransformer

from rag.chunker import create_chunks
from rag.loader import load_document, SUPPORTED_EXTENSIONS


# Find the backend directory
BASE_DIR = Path(__file__).resolve().parents[1]

# Shared with rag/pipeline.py so indexing and search always match
CHROMA_PATH = BASE_DIR / "chroma_db"
COLLECTION_NAME = "studypilot_documents"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"


class DocumentIndexer:

    def __init__(self, db_path=CHROMA_PATH, embedding_model=None):
        # 1. Connect to the persistent ChromaDB database
        self.client = chromadb.PersistentClient(path=str(db_path))

        # 2. Create the collection on first run, reuse it afterwards
        self.collection = self.client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"}
        )

        # 3. Reuse an already loaded model if one is passed in
        self.embedding_model = embedding_model or SentenceTransformer(
            EMBEDDING_MODEL
        )

    def index_document(self, path):
        path = Path(path)

        # 4. Extract text (OCR is used automatically for scanned pages)
        pages = load_document(path)

        return self.index_pages(pages, path.name)

    def index_pages(self, pages, source):
        # pages: [{"source", "page", "text"}], from a file or a YouTube transcript
        chunks = create_chunks(pages)

        if not chunks:
            raise ValueError(f"No text could be extracted from {source}")

        # 5. Remove old chunks of this source so re-indexing leaves no stale text
        self.collection.delete(where={"source": source})

        # 6. Convert every chunk into an embedding
        texts = [chunk["text"] for chunk in chunks]

        embeddings = self.embedding_model.encode(
            texts,
            convert_to_numpy=True,
            show_progress_bar=False
        )

        # 7. Store vectors, text, and metadata
        self.collection.add(
            ids=[chunk["chunk_id"] for chunk in chunks],
            embeddings=embeddings.tolist(),
            documents=texts,
            metadatas=[
                {
                    "source": chunk["source"],
                    "page": chunk["page"],
                    "chunk_id": chunk["chunk_id"]
                }
                for chunk in chunks
            ]
        )

        return {
            "source": source,
            "pages": len(pages),
            "chunks": len(chunks)
        }

    def list_sources(self):
        # Every chunk stores its source name, so collect the unique ones
        metadatas = self.collection.get(include=["metadatas"])["metadatas"]

        return sorted({metadata["source"] for metadata in metadatas})

    def index_directory(self, directory):
        results = []

        for path in sorted(Path(directory).iterdir()):
            if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue

            print(f"Indexing {path.name}")
            results.append(self.index_document(path))

        return results


if __name__ == "__main__":
    # Usage (from backend/):
    #   python -m rag.indexer                 -> index data/documents
    #   python -m rag.indexer file1.pdf ...   -> index specific files
    indexer = DocumentIndexer()
    targets = sys.argv[1:]

    if targets:
        results = [indexer.index_document(target) for target in targets]
    else:
        results = indexer.index_directory(BASE_DIR / "data" / "documents")

    for result in results:
        print(
            f"- {result['source']}: "
            f"{result['pages']} pages, {result['chunks']} chunks"
        )

    print(f"Total chunks in ChromaDB: {indexer.collection.count()}")
