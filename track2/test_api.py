"""Quick smoke test — run this before rebuilding Docker."""
import os, requests
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

API_KEY  = os.environ.get("FIREWORKS_API_KEY", "").strip()
BASE_URL = os.environ.get("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1").rstrip("/")

VISION_MODEL = os.environ.get("VISION_MODEL", "accounts/fireworks/models/minimax-m3")
TEXT_MODEL   = os.environ.get("TEXT_MODEL",   "accounts/fireworks/models/kimi-k2p6")

print(f"API_KEY  : {'SET (' + API_KEY[:8] + '...)' if API_KEY else 'NOT SET ← THIS IS YOUR PROBLEM'}")
print(f"BASE_URL : {BASE_URL}")
print(f"VISION   : {VISION_MODEL}")
print(f"TEXT     : {TEXT_MODEL}")
print()

def test_model(model, messages, label):
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    payload = {"model": model, "messages": messages, "max_tokens": 50, "temperature": 0.1}
    try:
        r = requests.post(f"{BASE_URL}/chat/completions", headers=headers, json=payload, timeout=30)
        if r.status_code == 200:
            print(f"✓ {label}: OK — '{r.json()['choices'][0]['message']['content'][:60]}'")
        else:
            print(f"✗ {label}: HTTP {r.status_code} — {r.text[:200]}")
    except Exception as e:
        print(f"✗ {label}: Exception — {e}")

test_model(TEXT_MODEL,   [{"role": "user", "content": "Say hello in 5 words."}], f"TEXT  ({TEXT_MODEL.split('/')[-1]})")
test_model(VISION_MODEL, [{"role": "user", "content": "Say hello in 5 words."}], f"VISION({VISION_MODEL.split('/')[-1]})")
