import unittest

from agent import extract_chat_message_text


class ChatResponseParsingTests(unittest.TestCase):
    def test_extracts_text_from_multiple_parts(self):
        payload = {
            "choices": [
                {
                    "message": {
                        "content": [
                            {"type": "text", "text": "First sentence."},
                            {"type": "text", "text": " Second sentence."},
                        ]
                    }
                }
            ]
        }
        self.assertEqual(extract_chat_message_text(payload), "First sentence. Second sentence.")

    def test_ignores_non_text_parts(self):
        payload = {
            "choices": [
                {
                    "message": {
                        "content": [
                            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,abc"}},
                            {"type": "text", "text": "Caption generated."},
                        ]
                    }
                }
            ]
        }
        self.assertEqual(extract_chat_message_text(payload), "Caption generated.")


if __name__ == "__main__":
    unittest.main()
