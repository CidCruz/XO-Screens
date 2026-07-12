"""
XO-Screens Local LLM Judge
Simulates the AMD AI Judge for Track 2 scoring based on PDF criteria.
"""

import os
import json
import time
import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

def get_api_key() -> str:
    return os.environ.get("FIREWORKS_API_KEY", "").strip()

FIREWORKS_BASE_URL = os.environ.get("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1").rstrip("/")
JUDGE_MODEL = os.environ.get("JUDGE_MODEL", os.environ.get("PROCESS_MODEL", "accounts/fireworks/models/deepseek-v4-pro"))

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
        "model": JUDGE_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 1000,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    url = f"{FIREWORKS_BASE_URL}/chat/completions"
    
    for _ in range(3):
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=30)
            if resp.status_code == 429:
                time.sleep(5)
                continue
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"]
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
        print("FIREWORKS_API_KEY not found.")
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
