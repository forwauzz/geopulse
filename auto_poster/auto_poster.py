#!/usr/bin/env python3
"""
Auto Poster — Reddit + Twitter/X
Generates content in Uzziel's voice and posts to target communities.
Runs Mon / Wed / Fri automatically via Cowork scheduled task.

Setup:
  1. Copy config_template.json → config.json
  2. Fill in your API credentials
  3. pip install anthropic praw tweepy
"""

import json
import os
import random
import sys
from datetime import datetime
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "config.json"
LOG_PATH = Path(__file__).parent / "post_log.txt"

# ─── Voice + context for content generation ───────────────────────────────────

VOICE_SYSTEM = """You are writing as Uzziel Tamon.

Who he is:
- CEO of ALIE (an AI product for healthcare and clinical workflows)
- CPO of Aurion / Vision
- Clinical Operations Consultant at Teché Health Services
- Founder-operator working at the intersection of healthcare, AI, product strategy, and workflow automation

His voice:
- Direct, practical, conversational
- Founder-honest — shares real insights, not hype
- Low-fluff, high-signal
- Human — not corporate, not consultant-speak, not AI-generated sounding
- Action-forward — thinks in motion, leads with the point

What he cares about:
- Building ALIE properly as a serious healthcare AI product
- GEO (Generative Engine Optimization) — how AI is reshaping content discovery
- Practical automation that actually works
- The real cost of building as a solo founder-operator
- Useful, durable systems over surface-level activity"""

SUBREDDIT_CONTEXT = {
    "startups": "r/startups — a community of founders, early employees, and startup operators. They value raw, honest takes. No hype. No pitch decks. Just real founder experience.",
    "SEO": "r/SEO — practitioners who care about what works. GEO (Generative Engine Optimization) is a major angle here — how AI-powered search (ChatGPT, Perplexity, Claude) is changing discovery.",
    "ChatGPT": "r/ChatGPT — curious, smart AI enthusiasts who follow real-world AI applications closely. Can go deeper on tools and workflows.",
    "artificial": "r/artificial — AI professionals and enthusiasts. Thoughtful takes on AI in production, not just theory.",
    "DigitalMarketing": "r/DigitalMarketing — practitioners focused on what drives results. GEO and AI-driven SEO are very relevant here.",
    "Entrepreneur": "r/Entrepreneur — builders and operators at various stages. Founder mindset, real decisions, real tradeoffs.",
}

# ─── Content generation ────────────────────────────────────────────────────────

def generate_reddit_post(client, subreddit_name):
    import anthropic

    context = SUBREDDIT_CONTEXT.get(subreddit_name, f"r/{subreddit_name} — a relevant community for this content.")
    today = datetime.now().strftime("%A, %B %d")

    prompt = f"""Today is {today}.

Target community: {context}

Write a Reddit post (title + body) in my voice. Pick whichever angle feels most authentic:
- Building ALIE — a real look at what it takes to build healthcare AI
- GEO (Generative Engine Optimization) — how AI search is changing the game for content creators and marketers
- A genuine founder insight about juggling product, consulting, and building
- Something I've learned recently about automation, AI workflows, or clinical tech
- An honest take on what actually works vs. what sounds good

Rules:
- Sound like a real person, not a brand
- Lead with the point
- No motivational fluff
- Keep the body readable — 2-4 short paragraphs is ideal
- The title should make someone want to read it, but not clickbait

Return ONLY valid JSON — no markdown, no code block wrapper:
{{"title": "...", "body": "..."}}"""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=VOICE_SYSTEM,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = response.content[0].text.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(raw)


def generate_tweet(client):
    import anthropic

    today = datetime.now().strftime("%A, %B %d")

    prompt = f"""Today is {today}.

Write a tweet (or short thread) in my voice. Topics to draw from:
- Building at the intersection of AI + healthcare
- GEO (Generative Engine Optimization) — AI is changing how content gets found
- An honest founder take on building, shipping, or operating
- Something real about ALIE or what we're solving in clinical workflows
- A practical automation insight that most people overlook

Rules:
- Sharp and human — not AI-generated sounding
- No hashtag spam (0-1 hashtag max, only if it really fits)
- Under 280 chars for a single tweet
- If it works better as a thread, max 3 tweets

Return ONLY valid JSON — no markdown, no code block wrapper:
Single tweet: {{"tweet": "..."}}
Thread: {{"tweet": ["tweet 1", "tweet 2", "tweet 3"]}}"""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        system=VOICE_SYSTEM,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = response.content[0].text.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(raw)


# ─── Platform posting ──────────────────────────────────────────────────────────

def post_to_reddit(config, subreddit_name, title, body):
    import praw

    reddit = praw.Reddit(
        client_id=config["reddit"]["client_id"],
        client_secret=config["reddit"]["client_secret"],
        username=config["reddit"]["username"],
        password=config["reddit"]["password"],
        user_agent=config["reddit"]["user_agent"],
    )

    sub = reddit.subreddit(subreddit_name)
    post = sub.submit(title=title, selftext=body)
    return f"https://reddit.com{post.permalink}"


def post_to_twitter(config, tweet_content):
    import tweepy

    client = tweepy.Client(
        consumer_key=config["twitter"]["api_key"],
        consumer_secret=config["twitter"]["api_secret"],
        access_token=config["twitter"]["access_token"],
        access_token_secret=config["twitter"]["access_token_secret"],
    )

    tweets = tweet_content if isinstance(tweet_content, list) else [tweet_content]

    previous_id = None
    first_id = None

    for text in tweets:
        if previous_id:
            resp = client.create_tweet(text=text, in_reply_to_tweet_id=previous_id)
        else:
            resp = client.create_tweet(text=text)
        previous_id = resp.data["id"]
        if not first_id:
            first_id = previous_id

    return f"https://twitter.com/i/web/status/{first_id}"


# ─── Main run ──────────────────────────────────────────────────────────────────

def load_config():
    if not CONFIG_PATH.exists():
        print(f"ERROR: config.json not found at {CONFIG_PATH}")
        print("Copy config_template.json → config.json and fill in your credentials.")
        sys.exit(1)
    with open(CONFIG_PATH) as f:
        return json.load(f)


def log(lines, msg):
    print(msg)
    lines.append(msg)


def run():
    import anthropic

    config = load_config()
    client = anthropic.Anthropic(api_key=config["anthropic_api_key"])

    log_lines = [f"=== Auto Poster — {datetime.now().strftime('%Y-%m-%d %H:%M')} ==="]

    # Pick subreddits for this run (rotate 2 per run to avoid spam)
    targets = config.get("reddit_targets", ["startups", "SEO"])
    subreddits_this_run = random.sample(targets, min(2, len(targets)))

    # ── Reddit
    for subreddit_name in subreddits_this_run:
        try:
            log(log_lines, f"\n→ Generating for r/{subreddit_name}...")
            content = generate_reddit_post(client, subreddit_name)
            log(log_lines, f"  Title: {content['title']}")
            url = post_to_reddit(config, subreddit_name, content["title"], content["body"])
            log(log_lines, f"  ✅ Posted: {url}")
        except Exception as e:
            log(log_lines, f"  ❌ r/{subreddit_name} failed: {e}")

    # ── Twitter/X
    try:
        log(log_lines, "\n→ Generating Twitter/X content...")
        tweet_data = generate_tweet(client)
        url = post_to_twitter(config, tweet_data["tweet"])
        log(log_lines, f"  ✅ Posted: {url}")
    except Exception as e:
        log(log_lines, f"  ❌ Twitter/X failed: {e}")

    # ── Write log
    with open(LOG_PATH, "a") as f:
        f.write("\n".join(log_lines) + "\n\n")

    print("\n".join(log_lines))


if __name__ == "__main__":
    run()