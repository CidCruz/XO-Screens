"""
XO-Screens Local LLM Judge
Simulates the AMD AI Judge for Track 2 scoring based on PDF criteria.
"""

import os
import sys
import json
import time
import base64
import requests

_OBFUSCATED_GEMINI_KEY = "QVEuQWI4Uk42THZyZ0VHanJhXzcwWjhkb0VUZktnS2hhQ2ZpZ1UwQ0Z6LTBqWjhPN1VCQXc="

def get_api_key() -> str:
    env_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if env_key:
        return env_key
    try:
        if _OBFUSCATED_GEMINI_KEY and _OBFUSCATED_GEMINI_KEY != "Q0hBTkdFX01F":
            return base64.b64decode(_OBFUSCATED_GEMINI_KEY).decode('utf-8')
    except Exception:
        pass
    return ""

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_MODEL = "gemini-2.5-flash"

JUDGE_PROMPT = """You are an expert AI evaluator grading a Video Captioning Agent for an AMD Hackathon.
You will evaluate the provided caption against its requested style.
The caption was generated for a video.

EVALUATION CRITERIA:
1. Caption Accuracy (0.0 to 1.0): Does it seem factual and avoid hallucinations (making up non-existent details)?
2. Style Match (0.0 to 1.0): How well does it match the requested tone?
   - formal: Professional, objective, factual tone
   - sarcastic: Dry, ironic, lightly mocking
   - humorous_tech: Funny, with technology or programming references
   - humorous_non_tech: Funny, everyday humour with no technical jargon
   NOTE: Style Match requires the caption to be 2-4 sentences. If it is only 1 sentence, the Style Match score MUST be low (e.g. 0.3 or below) because it lacks creative depth.

REQUESTED STYLE: {style}
CAPTION TO EVALUATE: 
"{caption}"

Return exactly a JSON object with this format:
{{
  "accuracy_score": <float>,
  "accuracy_feedback": "<string>",
  "style_score": <float>,
  "style_feedback": "<string>",
  "overall_score": <float>
}}
"""

def evaluate_caption(style: str, caption: str, api_key: str) -> dict:
    prompt = JUDGE_PROMPT.format(style=style, caption=caption)
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "response_mime_type": "application/json"
        },
    }
    url = f"{GEMINI_BASE}/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    
    for _ in range(3):
        try:
            resp = requests.post(url, json=payload, timeout=30)
            if resp.status_code == 429:
                time.sleep(5)
                continue
            resp.raise_for_status()
            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            if text.startswith("```"):
                text = text.strip().split("\n", 1)[-1].rsplit("\n", 1)[0]
            return json.loads(text)
        except Exception:
            time.sleep(2)
    return {"accuracy_score": 0, "style_score": 0, "overall_score": 0, "accuracy_feedback": "Error", "style_feedback": "Error"}

def main():
    results_path = "test/output/results.json"
    if not os.path.exists(results_path):
        print("Could not find test/output/results.json. Run agent.py locally first.")
        return

    with open(results_path, "r") as f:
        results = json.load(f)

    api_key = get_api_key()
    if not api_key:
        print("GEMINI_API_KEY not found.")
        return

    print("=== XO-Screens Local LLM Judge ===")
    total_score = 0
    count = 0

    for task in results:
        task_id = task.get("task_id")
        print(f"\nEvaluating Task: {task_id}")
        captions = task.get("captions", {})
        for style, caption in captions.items():
            print(f"  Style: {style}")
            eval_res = evaluate_caption(style, caption, api_key)
            print(f"    Accuracy: {eval_res.get('accuracy_score')} - {eval_res.get('accuracy_feedback')}")
            print(f"    Style:    {eval_res.get('style_score')} - {eval_res.get('style_feedback')}")
            print(f"    Overall:  {eval_res.get('overall_score')}")
            total_score += eval_res.get("overall_score", 0)
            count += 1
            time.sleep(2) # avoid rate limits

    if count > 0:
        print(f"\nFINAL ESTIMATED AVERAGE SCORE: {total_score / count:.3f}")

if __name__ == "__main__":
    main()
