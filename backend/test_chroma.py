from pathlib import Path
import chromadb

from sentence_transformers import SentenceTransformer
from rag.loader import extract_pages_from_pdf
from rag.chunker import create_chunks


document_dir = Path("data/documents")
pdf_paths = sorted(document_dir.glob("*.pdf"))

if not pdf_paths:
    raise FileNotFoundError("no pdf's found in data/documents")

all_pages = []
for pdf_path in pdf_paths:
    print(f"Reading {pdf_path.name}")
    all_pages.extend(extract_pages_from_pdf(pdf_path))

chunks = create_chunks(all_pages)

if not chunks:
    raise ValueError("No text chunks were created")

print(f"Total chunks: {len(chunks)}")

model = SentenceTransformer("all-MiniLM-L6-v2")
texts = [chunk["text"] for chunk in chunks]

embeddings = model.encode(
    texts,
    convert_to_numpy=True,
    show_progress_bar=True
)

# 5. Create a persistent ChromaDB client
client = chromadb.PersistentClient(
    path="./chroma_db"
)


# 6. Create or access a collection
collection = client.get_or_create_collection(
    name="studypilot_documents",
    metadata={"hnsw:space": "cosine"}
)


# 7. Store vectors, text, and metadata
collection.upsert(
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

print("Stored vectors:", collection.count())


# 8. Search the collection
question = "What is a consistent hashing?"

query_embedding = model.encode([question])

results = collection.query(
    query_embeddings=query_embedding.tolist(),
    n_results=min(4, collection.count()),
    include=["documents", "metadatas", "distances"]
)


# 9. Display the retrieved chunks
print("\n===== SEARCH RESULTS =====")

for document, metadata, distance in zip(
    results["documents"][0],
    results["metadatas"][0],
    results["distances"][0]
):
    print(f"\nSource: {metadata['source']}")
    print(f"Page: {metadata['page']}")
    print(f"Cosine distance: {distance:.4f}")
    print(f"Text: {document[:300]}")