from llm import generate_answer
from rag.indexer import DocumentIndexer


NO_MATERIAL_MESSAGE = (
    "Your library is empty. Upload a PDF or add a YouTube link first."
)

# Passages further away than this (cosine distance) are treated as unrelated.
# Measured on our library: questions about the documents scored 0.13-0.61,
# general questions ("how are you", "capital of France") scored 0.69-0.86.
RELEVANCE_THRESHOLD = 0.65


class RAGPipeline:

    def __init__(self, indexer=None):
        # 1. Reuse the indexer's ChromaDB collection and embedding model,
        #    so searching and indexing always use the same database and model
        indexer = indexer or DocumentIndexer()

        self.collection = indexer.collection
        self.embedding_model = indexer.embedding_model

        print(
            f"ChromaDB loaded: "
            f"{self.collection.count()} chunks available"
        )

    def retrieve(self, question, top_k=4):
        # Finds the chunks related to the question (no LLM involved).
        # Returns [] when nothing in the library is relevant.

        if not question.strip():
            raise ValueError("Question cannot be empty.")

        # 2. Nothing has been indexed yet
        if self.collection.count() == 0:
            return []

        # 3. Convert the question into an embedding
        query_embedding = self.embedding_model.encode(
            [question],
            convert_to_numpy=True
        )

        # 4. Search ChromaDB for relevant chunks
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

        # 5. Reconstruct the source information
        for text, metadata, distance in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0]
        ):
            # 6. Skip passages that aren't really about the question
            if distance > RELEVANCE_THRESHOLD:
                continue

            chunk = {
                "text": text,
                "source": metadata["source"],
                "page": metadata["page"],
                "chunk_id": metadata["chunk_id"],
                "distance": float(distance)
            }

            retrieved_chunks.append(chunk)

        return retrieved_chunks

    def ask(self, question, top_k=4):
        # Returns the full answer at once (used by the main.py CLI).
        # With no relevant passages, the LLM answers as a general assistant.
        retrieved_chunks = self.retrieve(question, top_k)

        # 7. Send the question (and any relevant passages) to the LLM
        answer = generate_answer(
            question,
            retrieved_chunks
        )

        return answer, retrieved_chunks
