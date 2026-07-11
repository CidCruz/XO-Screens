import unittest

from agent import extract_gemini_text


class GeminiResponseParsingTests(unittest.TestCase):
    def test_extracts_text_from_multiple_parts(self):
        payload = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "First sentence."},
                            {"text": " Second sentence."},
                        ]
                    }
                }
            ]
        }
        self.assertEqual(extract_gemini_text(payload), "First sentence. Second sentence.")

    def test_ignores_non_text_parts(self):
        payload = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"inlineData": {"mimeType": "image/jpeg"}},
                            {"text": "Caption generated."},
                        ]
                    }
                }
            ]
        }
        self.assertEqual(extract_gemini_text(payload), "Caption generated.")


if __name__ == "__main__":
    unittest.main()
