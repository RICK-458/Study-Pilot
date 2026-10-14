import re
import llm.llm as L
from rag.pipeline import RAGPipeline
rag = RAGPipeline()

RULE = "\n7. Never mention passage or excerpt numbers (like \"Passage 2\").\n   Refer to sources only with their [file, page N] labels.\n"
original_prompt = L.STUDY_PROMPT
original_build = L.build_messages

def build_unnumbered(question, chunks, history=None):
    # same as build_messages, but each chunk is labelled only "[file, page N]"
    messages = original_build(question, chunks, history)
    context = "\n\n".join(f"[{c['source']}, page {c['page']}]\n{c['text']}" for c in chunks)
    messages[-1]["content"] = f"\nSTUDENT QUESTION:\n{question}\n\nRETRIEVED STUDY EXCERPTS:\n{context}\n"
    return messages

variants = {
    "A. current":            (original_prompt, original_build),
    "B. + rule":             (original_prompt.rstrip() + RULE, original_build),
    "C. + rule, no numbers": (original_prompt.rstrip() + RULE, build_unnumbered),
}
questions = ["explain flynn's taxonomy", "what are virtual nodes?", "how does database sharding work",
             "what is instruction level parallelism", "cache levels in multicore processors"]
chunks = {q: rag.retrieve(q) for q in questions}

for name, (prompt, builder) in variants.items():
    L.STUDY_PROMPT, L.build_messages = prompt, builder
    leaks = cites = runs = 0
    for q in questions:
        for _ in range(2):
            a = "".join(L.stream_answer(q, chunks[q]))
            leaks += len(re.findall(r"\b(passage|excerpt)s?\s*\d", a, re.I))
            cites += len(re.findall(r"\[[^\[\]]+?,\s*page\s*\d+\]", a, re.I))
            runs += 1
    print(f"{name:24} 'Passage N' mentions: {leaks:2}   proper citations: {cites:2}   ({runs} answers)")
