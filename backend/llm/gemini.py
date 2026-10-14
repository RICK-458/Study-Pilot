import json
import os

import httpx2
from dotenv import load_dotenv
from openai import OpenAI, APIConnectionError, APIError, DefaultHttpxClient, RateLimitError

load_dotenv()


# Gemini offers an OpenAI-compatible API, so the same "openai" package works
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


class CloudLLMError(Exception):
    # Raised with a message that is safe to show to the user
    pass


def generate_json(prompt, schema, schema_name):
    # Sends one prompt to Gemini and returns its reply as a Python dict.
    # "schema" is a JSON Schema: Gemini is forced to reply in exactly that shape.
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise CloudLLMError(
            "Flashcards and quizzes need a Gemini API key. "
            "Add GEMINI_API_KEY to backend/.env and restart the server."
        )

    # Force IPv4: on this network, IPv6 connections to Google corrupt larger
    # requests (SSL "bad record mac" errors) and are ~10x slower.
    # local_address="0.0.0.0" means "connect from an IPv4 address".
    # (openai 3.x is built on the httpx2 package, so its transport is used here.)
    client = OpenAI(
        base_url=GEMINI_BASE_URL,
        api_key=api_key,
        max_retries=3,
        timeout=90,
        http_client=DefaultHttpxClient(
            transport=httpx2.HTTPTransport(local_address="0.0.0.0")
        ),
    )

    try:
        response = client.chat.completions.create(
            model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
            messages=[{"role": "user", "content": prompt}],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": schema_name, "schema": schema},
            },
        )

    except RateLimitError:
        raise CloudLLMError(
            "Gemini's free usage limit is reached. Wait a minute, "
            "or try again tomorrow if the daily limit is used up."
        )

    except APIConnectionError:
        raise CloudLLMError(
            "Couldn't reach Gemini. Check your internet connection."
        )

    except APIError as exc:
        print(f"Gemini request failed: {exc}")
        raise CloudLLMError(
            "The Gemini request failed. Check that GEMINI_API_KEY is correct."
        )

    return json.loads(response.choices[0].message.content)
