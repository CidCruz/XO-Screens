import os, requests, json, base64
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

k = os.environ.get('FIREWORKS_API_KEY','').strip()
vision_model = os.environ.get('VISION_MODEL', 'accounts/fireworks/models/kimi-k2p6')
b64 = base64.b64encode(Path(r'C:\Temp\testframe.jpg').read_bytes()).decode()

r = requests.post('https://api.fireworks.ai/inference/v1/chat/completions',
    headers={'Authorization': f'Bearer {k}', 'Content-Type': 'application/json'},
    json={
        'model': vision_model,
        'messages': [{'role': 'user', 'content': [
            {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{b64}'}},
            {'type': 'text', 'text': 'Describe exactly what you see in this image in 2 sentences.'}
        ]}],
        'max_tokens': 300, 'temperature': 0.1
    }, timeout=60)

data = r.json()
msg = data['choices'][0]['message']
print('STATUS:', r.status_code)
print('content:', msg.get('content', 'EMPTY'))
print('reasoning:', msg.get('reasoning_content', '')[:150])
print('finish_reason:', data['choices'][0]['finish_reason'])
