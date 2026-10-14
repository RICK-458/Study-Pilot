from datetime import date, datetime


def format_excerpts(chunks):
    # Turns retrieved chunks into numbered passages with their source label
    return "\n\n".join(
        f"Passage {number} [{chunk['source']}, page {chunk['page']}]\n{chunk['text']}"
        for number, chunk in enumerate(chunks, start=1)
    )


def check_source(item, chunks):
    # Keeps the source only if it really is one of the retrieved passages,
    # so the LLM can't invent a file name or page number
    real_sources = {(chunk["source"], chunk["page"]) for chunk in chunks}

    if (item.get("source"), item.get("page")) in real_sources:
        return item["source"], item["page"]

    return None, None


def today():
    return date.today().isoformat()


def now():
    return datetime.now().isoformat(timespec="seconds")
