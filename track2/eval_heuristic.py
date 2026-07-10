import json
from pathlib import Path

PALETTE = set(["red","orange","yellow","green","blue","purple","brown","gray","black","white"])
MOTION_WORDS = set(["move","moves","moving","walk","walks","run","runs","jump","turn","enter","exits","approach","approaches","drives","driving","falls","flies","slides"])

def has_color(text: str) -> bool:
    t = text.lower()
    return any(c in t for c in PALETTE)

def has_motion(text: str) -> bool:
    t = text.lower()
    return any(m in t for m in MOTION_WORDS)

def score_caption(text: str) -> float:
    # Heuristic: color presence (0.5), motion presence (0.3), length (0.2)
    s = 0.0
    if has_color(text):
        s += 0.5
    if has_motion(text):
        s += 0.3
    ln = len(text.split())
    if ln >= 25:
        s += 0.2
    elif ln >= 15:
        s += 0.1
    return s

def main():
    p = Path("test/output/results.json")
    if not p.exists():
        print("NO_RESULTS")
        return
    data = json.loads(p.read_text())
    total = 0.0
    count = 0
    for task in data:
        caps = task.get("captions", {})
        for k, v in caps.items():
            s = score_caption(v)
            total += s
            count += 1
    avg = total / count if count else 0.0
    print(f"HEURISTIC_AVG_SCORE={avg:.3f} (based on {count} captions)")

if __name__ == "__main__":
    main()
