"""has_speech() on generated wavs.  py -m unittest discover tests"""
import array
import math
import os
import sys
import tempfile
import unittest
import wave

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from voice_agent import pipeline  # noqa: E402


def write_wav(path, amplitude, seconds=1.0, rate=8000):
    n = int(seconds * rate)
    samples = array.array("h", (int(amplitude * math.sin(2 * math.pi * 440 * i / rate)) for i in range(n)))
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(samples.tobytes())


class HasSpeechTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def path(self, name):
        return os.path.join(self.dir, name)

    def test_silence_like_muted_softphone(self):
        write_wav(self.path("s.wav"), 16)  # peak seen from the muted MicroSIP call
        self.assertFalse(pipeline.has_speech(self.path("s.wav")))

    def test_speech_level(self):
        write_wav(self.path("v.wav"), 6000)
        self.assertTrue(pipeline.has_speech(self.path("v.wav")))

    def test_missing_or_empty(self):
        self.assertFalse(pipeline.has_speech(self.path("nope.wav")))
        write_wav(self.path("e.wav"), 6000, seconds=0)
        self.assertFalse(pipeline.has_speech(self.path("e.wav")))


if __name__ == "__main__":
    unittest.main()
