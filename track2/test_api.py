"""Quick smoke test: run this before rebuilding Docker."""
import json
import os
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

API_KEY = os.environ.get("FIREWORKS_API_KEY", "").strip()
BASE_URL = os.environ.get("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1").rstrip("/")

def load_model_config() -> dict:
    defaults = {
        "vision": "accounts/fireworks/models/kimi-k2p6",
        "process": "accounts/fireworks/models/deepseek-v4-pro",
    }
    config_path = Path(os.environ.get("MODEL_CONFIG_PATH", Path(__file__).with_name("model_config.json")))
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            for key in defaults:
                value = data.get(key)
                if isinstance(value, str) and value.strip():
                    defaults[key] = value.strip()
    except FileNotFoundError:
        pass
    return defaults

MODEL_CONFIG = load_model_config()
VISION_MODEL = os.environ.get("VISION_MODEL", MODEL_CONFIG["vision"])
PROCESS_MODEL = os.environ.get("PROCESS_MODEL", MODEL_CONFIG["process"])

print(f"API_KEY  : {'SET (' + API_KEY[:8] + '...)' if API_KEY else 'NOT SET'}")
print(f"BASE_URL : {BASE_URL}")
print(f"VISION   : {VISION_MODEL}")
print(f"PROCESS  : {PROCESS_MODEL}")
print()

def test_model(model, messages, label):
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    payload = {"model": model, "messages": messages, "max_tokens": 50, "temperature": 0.1}
    try:
        r = requests.post(f"{BASE_URL}/chat/completions", headers=headers, json=payload, timeout=30)
        if r.status_code == 200:
            print(f"OK {label}: '{r.json()['choices'][0]['message']['content'][:60]}'")
        else:
            print(f"FAIL {label}: HTTP {r.status_code} - {r.text[:200]}")
    except Exception as e:
        print(f"FAIL {label}: Exception - {e}")

test_model(PROCESS_MODEL, [{"role": "user", "content": "Say hello in 5 words."}], f"PROCESS({PROCESS_MODEL.split('/')[-1]})")
test_model(VISION_MODEL, [{"role": "user", "content": "Say hello in 5 words."}], f"VISION({VISION_MODEL.split('/')[-1]})")
