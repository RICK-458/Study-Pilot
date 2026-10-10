from sentence_transformers import SentenceTransformer
model  = SentenceTransformer("all-MiniLM-L6-v2")
from sklearn.metrics.pairwise import cosine_similarity

sentences = [
    "A database index improves the speed of data retrieval.",
    "B trees are commonly used in database indexing.",
    "Python is a programming language."
]

query = "How can i retrieve database records faster"


embeddings = model.encode(sentences)
query_embedding = model.encode([query])

similarities = cosine_similarity(query_embedding,embeddings)[0]

for sentence, score in zip(sentences,similarities):
    print(f"{score:.4f} ->{sentence}")

