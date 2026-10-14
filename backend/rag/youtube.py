from urllib.parse import urlparse, parse_qs

import requests
from youtube_transcript_api import YouTubeTranscriptApi


# Transcript text is grouped into 5-minute sections, which act like "pages"
SECTION_SECONDS = 300


def get_video_id(url):
    parsed = urlparse(url.strip())

    # https://youtu.be/VIDEO_ID
    if parsed.hostname == "youtu.be":
        return parsed.path.lstrip("/")

    if parsed.hostname and "youtube.com" in parsed.hostname:
        # https://www.youtube.com/watch?v=VIDEO_ID
        if parsed.path == "/watch":
            return parse_qs(parsed.query).get("v", [None])[0]

        # https://www.youtube.com/shorts/VIDEO_ID or /embed/VIDEO_ID
        if parsed.path.startswith(("/shorts/", "/embed/")):
            return parsed.path.split("/")[2]

    raise ValueError("That doesn't look like a YouTube link.")


def get_video_title(url):
    # YouTube's oEmbed endpoint returns the title without needing an API key
    try:
        response = requests.get(
            "https://www.youtube.com/oembed",
            params={"url": url, "format": "json"},
            timeout=10
        )
        return response.json()["title"]

    except Exception:
        return None


def load_youtube_transcript(url):
    video_id = get_video_id(url)

    try:
        transcript = YouTubeTranscriptApi().fetch(video_id)

    except Exception as exc:
        raise ValueError(
            "Could not get a transcript. The video may have captions turned off."
        ) from exc

    title = get_video_title(url) or video_id
    source = f"{title} (YouTube)"

    # Group the transcript lines into sections by their start time
    sections = {}

    for line in transcript:
        section_number = int(line.start // SECTION_SECONDS) + 1
        sections.setdefault(section_number, []).append(line.text)

    pages = [
        {
            "source": source,
            "page": number,
            "text": " ".join(lines)
        }
        for number, lines in sorted(sections.items())
    ]

    return source, pages
