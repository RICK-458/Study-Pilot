from pathlib import Path

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

from rag.loader import extract_pages_from_pdf
from rag.chunker import create_chunks
from llm import generate_answer


class RAGPipeline:

    def __init__(
        self,
        document_dir="data/documents",
        embedding_model_name="all-MiniLM-L6-v2"
    ):
        self.document_dir = Path(document_dir)

        # 1. Find all PDFs in the documents folder
        self.pdf_paths = sorted(
            self.document_dir.glob("*.pdf")
        )

        if not self.pdf_paths:
            raise FileNotFoundError(
                f"No PDF files found in {self.document_dir.resolve()}"
            )

        # 2. Extract pages from every PDF
        all_pages = []

        for pdf_path in self.pdf_paths:
            print(f"Reading: {pdf_path.name}")

            pages = extract_pages_from_pdf(pdf_path)
            all_pages.extend(pages)

        if not all_pages:
            raise ValueError(
                "No extractable text found in the PDFs."
            )

        # 3. Split pages into chunks
        self.chunks = create_chunks(all_pages)

        if not self.chunks:
            raise ValueError("No text chunks were created.")

        print(f"\nPDFs loaded: {len(self.pdf_paths)}")
        print(f"Chunks created: {len(self.chunks)}")

        # 4. Load the embedding model
        print("\nLoading embedding model...")

        self.embedding_model = SentenceTransformer(
            embedding_model_name
        )

        # 5. Convert each chunk into a vector
        texts = [
            chunk["text"]
            for chunk in self.chunks
        ]

        embeddings = self.embedding_model.encode(
            texts,
            convert_to_numpy=True,
            show_progress_bar=True
        )

        embeddings = np.ascontiguousarray(
            embeddings,
            dtype=np.float32
        )

        # 6. Create the FAISS vector index
        dimension = embeddings.shape[1]

        self.index = faiss.IndexFlatL2(dimension)

        # 7. Store all vectors
        self.index.add(embeddings)

        print(f"Vectors stored in FAISS: {self.index.ntotal}")
        print("\nStudyPilot is ready.")

    def ask(self, question, top_k=4):

        if not question.strip():
            raise ValueError("Question cannot be empty.")

        # 8. Convert the question into an embedding
        query_embedding = self.embedding_model.encode(
            [question],
            convert_to_numpy=True
        )

        query_embedding = np.ascontiguousarray(
            query_embedding,
            dtype=np.float32
        )

        # 9. Find the nearest chunk vectors
        number_to_retrieve = min(top_k, len(self.chunks))

        distances, indices = self.index.search(
            query_embedding,
            number_to_retrieve
        )

        # 10. Map the returned indices to original chunks
        retrieved_chunks = []

        for distance, chunk_index in zip(
            distances[0], indices[0]
        ):
            if chunk_index < 0:
                continue

            chunk = self.chunks[int(chunk_index)].copy()

            chunk["distance"] = float(distance)

            retrieved_chunks.append(chunk)

        if not retrieved_chunks:
            return (
                "I couldn't retrieve any relevant study material.",
                []
            )

        # 11. Send the question and retrieved text to the LLM
        answer = generate_answer(
            question,
            retrieved_chunks
        )

        return answer, retrieved_chunks