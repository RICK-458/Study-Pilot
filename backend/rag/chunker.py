def create_chunks(pages, chunk_size=800, overlap=120):
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")

    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be between 0 and chunk_size")

    chunks = []

    for page in pages:
        text = page["text"]
        start = 0
        chunk_number = 0

        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunk_text = text[start:end].strip()

            if chunk_text:
                chunks.append({
                    "chunk_id": (
                        f"{page['source']}"
                        f"::p{page['page']}"
                        f"::c{chunk_number}"
                    ),
                    "source": page["source"],
                    "page": page["page"],
                    "text": chunk_text
                })

                chunk_number += 1

            if end >= len(text):
                break

            start = end - overlap

    return chunks