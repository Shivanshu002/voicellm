"""Sentence streaming tests with a fake Ollama response.  py -m unittest discover tests"""
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from voice_agent import pipeline  # noqa: E402


class FakeResponse:
    def __init__(self, tokens):
        self._lines = [json.dumps({"message": {"content": t}, "done": False}).encode() for t in tokens]
        self._lines.append(json.dumps({"message": {"content": ""}, "done": True}).encode())

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def raise_for_status(self):
        pass

    def iter_lines(self):
        return iter(self._lines)


def sentences(tokens):
    with mock.patch.object(pipeline.requests, "post", return_value=FakeResponse(tokens)):
        return list(pipeline.stream_llm_sentences([{"role": "user", "content": "hi"}]))


class StreamTest(unittest.TestCase):
    def test_splits_sentences(self):
        self.assertEqual(
            sentences(["Yes", ", we", " are open.", " We close at", " six! Anything", " else?"]),
            ["Yes, we are open.", "We close at six!", "Anything else?"],
        )

    def test_hindi_danda(self):
        self.assertEqual(sentences(["जी हाँ। ", "हम खुले हैं।"]), ["जी हाँ।", "हम खुले हैं।"])

    def test_long_first_sentence_cut_at_comma(self):
        out = sentences(["Our store hours vary by location", ", but I can connect", " you to a human agent."])
        self.assertEqual(out, ["Our store hours vary by location,", "but I can connect you to a human agent."])

    def test_markdown_stripped(self):
        self.assertEqual(sentences(["**Sure**, done."]), ["Sure, done."])

    def test_empty_reply(self):
        self.assertEqual(sentences([]), [])


if __name__ == "__main__":
    unittest.main()
