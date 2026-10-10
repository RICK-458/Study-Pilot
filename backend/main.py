from rag.pipeline import RAGPipeline


def main():
    # 1. Initialize the RAG pipeline
    try:
        rag = RAGPipeline()

    except Exception as exc:
        print(f"Startup failed: {exc}")
        return

    # 2. Keep accepting questions
    while True:
        question = input(
            "\nAsk StudyPilot (type 'exit' to quit): "
        ).strip()

        # 3. Exit when requested
        if question.lower() in {"exit", "quit"}:
            print("StudyPilot stopped.")
            break

        if not question:
            continue

        # 4. Get the answer and retrieved sources
        try:
            answer, sources = rag.ask(
                question,
                top_k=4
            )

            # 5. Display the answer
            print("\n===== ANSWER =====")
            print(answer)

            # 6. Display source documents and pages
            print("\n===== RETRIEVED SOURCES =====")

            for chunk in sources:
                print(
                    f"- {chunk['source']}, "
                    f"page {chunk['page']} "
                    f"(L2 distance: {chunk['distance']:.4f})"
                )

        except Exception as exc:
            print(f"Request failed: {exc}")


if __name__ == "__main__":
    main()