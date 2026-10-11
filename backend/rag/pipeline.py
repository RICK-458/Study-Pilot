from pathlib import Path

import chromadb
from sentence_transformers import SentenceTransformer

from llm import generate_answer


# Find the backend directory
BASE_DIR = Path(__file__).resolve().parents[1]


class RAGPipeline:

    def __init__(self):
        # 1. Connect to the persistent ChromaDB database
        self.client = chromadb.PersistentClient(
            path=str(BASE_DIR / "chroma_db")
        )

        # 2. Access the collection created by test_chroma.py
        self.collection = self.client.get_collection(
            name="studypilot_documents"
        )

        if self.collection.count() == 0:
            raise ValueError(
                "ChromaDB is empty. Run test_chroma.py first."
            )

        # 3. Load the same embedding model used during indexing
        self.embedding_model = SentenceTransformer(
            "all-MiniLM-L6-v2"
        )

        print(
            f"ChromaDB loaded: "
            f"{self.collection.count()} chunks available"
        )

    def ask(self, question, top_k=4):

        if not question.strip():
            raise ValueError("Question cannot be empty.")

        # 4. Convert the question into an embedding
        query_embedding = self.embedding_model.encode(
            [question],
            convert_to_numpy=True
        )

        # 5. Search ChromaDB for relevant chunks
        results = self.collection.query(
            query_embeddings=query_embedding.tolist(),
            n_results=min(top_k, self.collection.count()),
            include=[
                "documents",
                "metadatas",
                "distances"
            ]
        )

        retrieved_chunks = []

        # 6. Reconstruct the source information
        for text, metadata, distance in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0]
        ):
            chunk = {
                "text": text,
                "source": metadata["source"],
                "page": metadata["page"],
                "chunk_id": metadata["chunk_id"],
                "distance": float(distance)
            }

            retrieved_chunks.append(chunk)

        if not retrieved_chunks:
            return (
                "No relevant study material was retrieved.",
                []
            )

        # 7. Send retrieved context to the LLM
        answer = generate_answer(
            question,
            retrieved_chunks
        )

        return answer, retrieved_chunks