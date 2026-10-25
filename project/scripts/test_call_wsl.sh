#!/usr/bin/env bash
# Places a real call through Asterisk into the agent, with a robot caller asking one question.
#   wsl -d Ubuntu-24.04 -u root -- bash /mnt/f/voicellm/project/scripts/test_call_wsl.sh "Do you open on Sunday?"
set -euo pipefail
QUESTION=${1:-"Hi, what time does your store open on Sunday?"}
WORK=/var/spool/asterisk/voicellm
PY="sudo -u asterisk env PYTHONPATH=/opt/voicellm/app /opt/voicellm/venv/bin/python"

# question audio (8 kHz) + the greeting, so we know how long to wait before speaking
$PY - "$QUESTION" <<'PY'
import os, sys
from voice_agent import config, pipeline
work = config.WORK_DIR
pipeline.text_to_speech(sys.argv[1], os.path.join(work, "test_question.wav"))
cache = os.path.join(work, "cache")
os.makedirs(cache, exist_ok=True)
greeting = os.path.join(cache, f"greeting_{config.LANGUAGE}.wav")
if not os.path.exists(greeting):
    pipeline.text_to_speech(config.GREETING, greeting)
PY
greet=$(soxi -D "$WORK/cache/greeting_en.wav" 2>/dev/null || echo 4)
wait_s=$(python3 -c "print(round($greet + 1.3, 1))")   # dialplan Wait(0.5) + AGI start-up

asterisk -rx "dialplan set global VL_WAIT $wait_s" >/dev/null
asterisk -rx "dialplan set global VL_QUESTION $WORK/test_question" >/dev/null
count() { cat "$WORK/transcripts.jsonl" 2>/dev/null | wc -l; }
before=$(count)

echo "calling agent; robot caller says: $QUESTION"
asterisk -rx "channel originate Local/100@inbound-ai extension s@voicellm-test-caller"

for i in $(seq 90); do   # call ends by itself after the answer (+ silence handling)
    [ "$(count)" -gt "$before" ] && break
    sleep 1
done
echo "--- transcript"
tail -1 "$WORK/transcripts.jsonl"
echo "--- agent log"
grep -E "INFO|ERROR|Error" "$WORK/voice_agent.log" | tail -5
