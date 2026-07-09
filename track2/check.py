import ast, re, sys

src = open("track2/agent.py").read()
fails = []
passes = []

def check(condition, label):
    if condition:
        passes.append(f"PASS  {label}")
    else:
        fails.append(f"FAIL  {label}")

# 1. Syntax
try:
    ast.parse(src)
    check(True, "syntax valid")
except SyntaxError as e:
    check(False, f"syntax — {e}")

# 2. Imports
for mod in ["os","re","sys","json","time","base64","random","hashlib",
            "shutil","tempfile","subprocess","logging","requests"]:
    check(mod in src, f"import {mod}")

# 3. Functions
for fn in ["main","process_task","download_video","extract_frames",
           "transcribe_audio","encode_frames","describe_video",
           "generate_caption","clean_caption","call_fireworks",
           "startup_checks","adaptive_frame_count","get_video_duration",
           "build_describe_prompt","_caption_user_prompt",
           "budget_remaining","is_time_tight","elapsed"]:
    check(f"def {fn}" in src, f"func {fn}")

# 4. I/O paths
check("/output/results.json" in src, "output path /output/results.json")
check("/input/tasks.json"    in src, "input path /input/tasks.json")

# 5. All 4 styles
for s in ["formal","sarcastic","humorous_tech","humorous_non_tech"]:
    check(s in src, f"style {s}")

# 6. Model IDs
check("qwen3-vl-32b-instruct"         in src, "vision model qwen3-vl-32b-instruct")
check("llama4-maverick-instruct-basic" in src, "text model llama4-maverick-instruct-basic")

# 7. Per-style temperatures
for s,t in [("formal","0.15"),("sarcastic","0.85"),
            ("humorous_tech","0.88"),("humorous_non_tech","0.92")]:
    check(t in src, f"temperature {s}={t}")

# 8. Budget watchdog
check("TOTAL_BUDGET_SECS" in src, "budget watchdog TOTAL_BUDGET_SECS")
check("budget_remaining"  in src, "budget_remaining called")

# 9. Exit codes
check("sys.exit(0)" in src, "exit code 0 on success")
check("sys.exit(1)" in src, "exit code 1 on failure")

# 10. No hardcoded API key
keys = re.findall(r"fw_[a-zA-Z0-9]{10,}", src)
check(len(keys) == 0, f"no hardcoded API key (found: {keys})")

# 11. Whisper tiny default
check("tiny" in src, "whisper tiny default")

# 12. clean_caption called inside generate_caption
gc_block = src[src.find("def generate_caption"):]
gc_block = gc_block[:gc_block.find("\ndef ", 5)]
check("clean_caption" in gc_block, "clean_caption called inside generate_caption")

# 13. Empty description fallback
check("Unable to extract" in src or "fallback" in src, "empty description fallback")

# 14. Short caption retry
check("Caption too short" in src, "short caption retry logic")

# 15. Per-style length guide
check("length_guide" in src, "per-style length guidance in prompts")

# 16. scene-change frame extraction
check("gt(scene" in src, "scene-change frame extraction")

# 17. Jitter in retry backoff
check("random.uniform" in src, "jitter in retry backoff")

# 18. HEAD request with graceful fallback
check("HEAD request failed" in src, "HEAD request graceful fallback")

# 19. Valid JSON output guaranteed
check("json.dumps" in src, "json.dumps for output")
check("ensure_ascii=False" in src, "ensure_ascii=False for unicode safety")

# 20. Dockerfile checks
df = open("track2/Dockerfile").read()
check("linux/amd64"  in df, "Dockerfile platform linux/amd64")
check("whisper"      in df, "Dockerfile whisper pre-download")
check("tiny"         in df, "Dockerfile whisper tiny")
check("USER agent"   in df, "Dockerfile non-root user")
check("ffmpeg"       in df, "Dockerfile ffmpeg installed")

# 21. requirements.txt
req = open("track2/requirements.txt").read()
check("requests==2.32.3"        in req, "requirements requests pinned")
check("openai-whisper"          in req, "requirements openai-whisper")
check("python-dotenv"           in req, "requirements python-dotenv")

# 22. sample_input.json valid JSON with all 3 clips
import json
sample = json.loads(open("track2/sample_input.json").read())
check(len(sample) == 3, "sample_input.json has 3 clips")
check(all("task_id" in t and "video_url" in t and "styles" in t for t in sample),
      "sample_input.json all tasks have required fields")
check(all(len(t["styles"]) == 4 for t in sample),
      "sample_input.json all tasks have 4 styles")

# ── Report ────────────────────────────────────────────────────────────────────
for p in passes:
    print(p)
print()
for f in fails:
    print(f)
print()
print(f"Results: {len(passes)} passed, {len(fails)} failed")
sys.exit(0 if not fails else 1)
