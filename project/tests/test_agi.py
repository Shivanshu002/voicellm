"""AGI protocol tests against a scripted fake Asterisk.  py -m unittest discover tests"""
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from voice_agent.agi import AGI, Hangup  # noqa: E402

ENV = "agi_request: voice_agent.py\nagi_channel: PJSIP/1001-00000001\nagi_uniqueid: 1729800000.12\n\n"


def make(responses):
    out = io.StringIO()
    return AGI(stdin=io.StringIO(ENV + "".join(r + "\n" for r in responses)), stdout=out), out


class AGITest(unittest.TestCase):
    def test_env_parsed(self):
        agi, _ = make([])
        self.assertEqual(agi.env["agi_uniqueid"], "1729800000.12")
        self.assertEqual(agi.env["agi_channel"], "PJSIP/1001-00000001")

    def test_commands_written(self):
        agi, out = make(["200 result=0", "200 result=0 endpos=1234", "200 result=0 (timeout) endpos=8000"])
        agi.answer()
        agi.stream_file("/tmp/x")
        result, data = agi.record_file("/tmp/in_0", max_ms=15000, silence_s=2)
        self.assertEqual(data, "timeout")
        self.assertEqual(out.getvalue().splitlines(), [
            "ANSWER",
            'STREAM FILE /tmp/x ""',
            'RECORD FILE /tmp/in_0 wav "#" 15000 0 s=2',
        ])

    def test_get_variable(self):
        agi, out = make(["200 result=1 (42)", "200 result=0"])
        self.assertEqual(agi.get_variable("VL_CONTACT_ID"), "42")
        self.assertEqual(agi.get_variable("NOPE"), "")
        self.assertEqual(out.getvalue().splitlines(), ["GET VARIABLE VL_CONTACT_ID", "GET VARIABLE NOPE"])

    def test_hangup_result(self):
        agi, _ = make(["200 result=-1 (hangup) endpos=0"])
        with self.assertRaises(Hangup):
            agi.record_file("/tmp/in_0")

    def test_dead_channel_and_hangup_line(self):
        agi, _ = make(["HANGUP", "511 Command Not Permitted on a dead channel or intercept routine"])
        with self.assertRaises(Hangup):
            agi.stream_file("/tmp/x")

    def test_eof_is_hangup(self):
        agi, _ = make([])
        with self.assertRaises(Hangup):
            agi.answer()

    def test_hangup_never_raises(self):
        agi, _ = make([])
        self.assertEqual(agi.hangup(), (1, ""))


if __name__ == "__main__":
    unittest.main()
