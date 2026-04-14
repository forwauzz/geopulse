"""
Multi-Agent Chat — Local Server
Run:   python app.py
Open:  http://localhost:5050

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  HOW TO ADD A NEW PROVIDER IN 3 STEPS:
  1. Write a call_xxx() function below
  2. Add it to the PROVIDER_REGISTRY dict
  3. Add its API key to .env
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)
CORS(app)


# ╔══════════════════════════════════════════════════════════════╗
# ║  PROVIDER REGISTRY                                           ║
# ║  Add new AI providers here. Each entry needs:               ║
# ║    "models"  → list of model IDs                            ║
# ║    "env_key" → the .env variable name for the API key       ║
# ║    "label"   → display name shown in the UI                 ║
# ║    "handler" → the Python function that calls the API       ║
# ╚══════════════════════════════════════════════════════════════╝
PROVIDER_REGISTRY = {

    "anthropic": {
        "label":   "Anthropic (Claude)",
        "env_key": "ANTHROPIC_API_KEY",
        "models":  ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    },

    "openai": {
        "label":   "OpenAI (ChatGPT)",
        "env_key": "OPENAI_API_KEY",
        "models":  ["gpt-4o", "gpt-4o-mini", "o1-mini", "o3-mini"],
    },

    "google": {
        "label":   "Google (Gemini)",
        "env_key": "GOOGLE_API_KEY",
        "models":  ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    },

    "groq": {
        "label":   "Groq (Fast LLaMA / Mixtral)",
        "env_key": "GROQ_API_KEY",
        "models":  ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    },

    "mistral": {
        "label":   "Mistral AI",
        "env_key": "MISTRAL_API_KEY",
        "models":  ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "open-mistral-nemo"],
    },

    # ── TEMPLATE: Add a new provider by copying this block ──────────────────
    # "myprovider": {
    #     "label":   "My Provider (Display Name)",
    #     "env_key": "MYPROVIDER_API_KEY",       # add this key to .env
    #     "models":  ["model-id-1", "model-id-2"],
    # },
    # Then add a call_myprovider() function below and register it in dispatch().
    # ─────────────────────────────────────────────────────────────────────────
}


# ── Shared context builder ────────────────────────────────────────────────────
def build_messages(conversation, agent_id):
    """
    Convert the shared conversation into messages for one specific agent.
      • User messages             → role: user
      • This agent's own replies  → role: assistant
      • Other agents' replies     → role: user, labelled "[AgentName]: …"
    """
    msgs = []
    for msg in conversation:
        if msg["role"] == "user":
            msgs.append({"role": "user", "content": msg["content"]})
        elif msg.get("agent_id") == agent_id:
            msgs.append({"role": "assistant", "content": msg["content"]})
        else:
            name = msg.get("agent_name", "Another agent")
            msgs.append({"role": "user", "content": f"[{name}]: {msg['content']}"})

    # All providers require the final message to be from the user
    if msgs and msgs[-1]["role"] == "assistant":
        msgs.append({"role": "user", "content": "Please continue."})

    if not msgs:
        msgs.append({"role": "user", "content": "Please introduce yourself and your role in this discussion."})

    return msgs


# ── Provider call functions ───────────────────────────────────────────────────

def call_anthropic(model, system_prompt, messages):
    import anthropic
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key: raise ValueError("ANTHROPIC_API_KEY is not set in your .env file.")
    client = anthropic.Anthropic(api_key=key)
    resp = client.messages.create(
        model=model,
        max_tokens=2048,
        system=system_prompt,
        messages=messages,
    )
    return resp.content[0].text


def call_openai(model, system_prompt, messages):
    from openai import OpenAI
    key = os.getenv("OPENAI_API_KEY")
    if not key: raise ValueError("OPENAI_API_KEY is not set in your .env file.")
    client = OpenAI(api_key=key)
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system_prompt}, *messages],
        max_tokens=2048,
    )
    return resp.choices[0].message.content


def call_google(model, system_prompt, messages):
    import google.generativeai as genai
    key = os.getenv("GOOGLE_API_KEY")
    if not key: raise ValueError("GOOGLE_API_KEY is not set in your .env file.")
    genai.configure(api_key=key)

    # Gemini requires strict user/model alternation — merge consecutive same-role msgs
    gemini_msgs = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        if gemini_msgs and gemini_msgs[-1]["role"] == role:
            gemini_msgs[-1]["parts"][0] += "\n\n" + msg["content"]
        else:
            gemini_msgs.append({"role": role, "parts": [msg["content"]]})

    gmodel = genai.GenerativeModel(model_name=model, system_instruction=system_prompt)
    if len(gemini_msgs) == 1:
        resp = gmodel.generate_content(gemini_msgs[0]["parts"][0])
    else:
        chat = gmodel.start_chat(history=gemini_msgs[:-1])
        resp = chat.send_message(gemini_msgs[-1]["parts"][0])
    return resp.text


def call_groq(model, system_prompt, messages):
    """Groq uses an OpenAI-compatible API — just a different base_url and key."""
    from openai import OpenAI
    key = os.getenv("GROQ_API_KEY")
    if not key: raise ValueError("GROQ_API_KEY is not set in your .env file.")
    client = OpenAI(api_key=key, base_url="https://api.groq.com/openai/v1")
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system_prompt}, *messages],
        max_tokens=2048,
    )
    return resp.choices[0].message.content


def call_mistral(model, system_prompt, messages):
    """Mistral also uses an OpenAI-compatible API."""
    from openai import OpenAI
    key = os.getenv("MISTRAL_API_KEY")
    if not key: raise ValueError("MISTRAL_API_KEY is not set in your .env file.")
    client = OpenAI(api_key=key, base_url="https://api.mistral.ai/v1")
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system_prompt}, *messages],
        max_tokens=2048,
    )
    return resp.choices[0].message.content


# ── Central dispatcher — maps provider id → handler ──────────────────────────
# When you add a new provider above, also add it here.
HANDLERS = {
    "anthropic": call_anthropic,
    "openai":    call_openai,
    "google":    call_google,
    "groq":      call_groq,
    "mistral":   call_mistral,
}


# ── API routes ────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_file("index.html")


@app.route("/api/providers")
def providers():
    """Return the full provider registry (without env_key values)."""
    return jsonify({
        pid: {"label": p["label"], "models": p["models"]}
        for pid, p in PROVIDER_REGISTRY.items()
    })


@app.route("/api/status")
def api_status():
    """Tell the UI which API keys are configured (true/false, never the key itself)."""
    return jsonify({
        pid: bool(os.getenv(p["env_key"]))
        for pid, p in PROVIDER_REGISTRY.items()
    })


@app.route("/chat", methods=["POST"])
def chat():
    try:
        data          = request.json
        provider      = data["provider"]
        model         = data["model"]
        agent_id      = data["agent_id"]
        system_prompt = data.get("system_prompt", "You are a helpful AI assistant in a multi-agent discussion.")
        conversation  = data["conversation"]

        handler = HANDLERS.get(provider)
        if not handler:
            return jsonify({"error": f"Unknown provider '{provider}'. Is it registered in HANDLERS?"}), 400

        messages = build_messages(conversation, agent_id)
        content  = handler(model, system_prompt, messages)
        return jsonify({"content": content})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("\n" + "━" * 46)
    print("  🤖  Multi-Agent Chat")
    print("  →   http://localhost:5050")
    print("━" * 46)
    configured = [pid for pid, p in PROVIDER_REGISTRY.items() if os.getenv(p["env_key"])]
    missing    = [pid for pid, p in PROVIDER_REGISTRY.items() if not os.getenv(p["env_key"])]
    if configured: print(f"  ✓   Keys found: {', '.join(configured)}")
    if missing:    print(f"  ✗   Not set:    {', '.join(missing)}")
    print("━" * 46 + "\n")
    app.run(debug=False, port=5050)
