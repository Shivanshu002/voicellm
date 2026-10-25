#!/usr/bin/env bash
# Runs inside Ubuntu 24.04 (WSL) as root. Safe to run again.
#   wsl -d Ubuntu-24.04 -u root -- bash /mnt/f/voicellm/project/scripts/setup_wsl.sh
#
# Installs Asterisk + sox + Python venv, copies whisper.cpp / Piper / models from
# F:\voicellm into /opt/voicellm (inside the WSL disk, which also lives on F:),
# and installs the voicellm Asterisk configs + AGI script.
set -euo pipefail

SRC=$(cd "$(dirname "$0")/../.." && pwd)   # repository root, e.g. /mnt/f/voicellm
DL=$SRC/downloads
OPT=/opt/voicellm
AGI_DIR=/usr/share/asterisk/agi-bin
WORK=/var/spool/asterisk/voicellm

step() { echo; echo "=== $* ==="; }

step "apt packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q asterisk asterisk-core-sounds-en sox libgomp1 python3-venv curl ca-certificates

mkdir -p "$OPT"/{whisper,piper,models,app} "$WORK"

wrap() {  # wrap <wrapper path> <real binary> : run a bundled binary with its own libs
    cat > "$1" <<EOF
#!/bin/sh
export LD_LIBRARY_PATH="$(dirname "$2"):$(dirname "$2")/../lib:\${LD_LIBRARY_PATH:-}"
exec "$2" "\$@"
EOF
    chmod +x "$1"
}

step "whisper.cpp"
rm -rf "$OPT/whisper/dist" && mkdir -p "$OPT/whisper/dist"
tar -xzf "$DL/whisper-bin-ubuntu-x64.tar.gz" -C "$OPT/whisper/dist"
real=$(find "$OPT/whisper/dist" -type f -name whisper-cli | head -1)
if [ -n "$real" ]; then
    chmod +x "$real"
    find "$OPT/whisper/dist" -name '*.so*' -exec dirname {} \; | sort -u > /tmp/wlib
    # libs may sit next to the binary or in a separate lib dir
    libpath=$(paste -sd: /tmp/wlib)
    cat > "$OPT/whisper/whisper-cli" <<EOF
#!/bin/sh
export LD_LIBRARY_PATH="$libpath:\${LD_LIBRARY_PATH:-}"
exec "$real" "\$@"
EOF
    chmod +x "$OPT/whisper/whisper-cli"
fi
if ! "$OPT/whisper/whisper-cli" --help >/dev/null 2>&1; then
    echo "prebuilt whisper-cli does not run here, building from source"
    apt-get install -y -q build-essential cmake git
    rm -rf "$OPT/whisper/src"
    git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git "$OPT/whisper/src"
    cmake -S "$OPT/whisper/src" -B "$OPT/whisper/src/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF
    cmake --build "$OPT/whisper/src/build" -j"$(nproc)" --target whisper-cli
    ln -sf "$OPT/whisper/src/build/bin/whisper-cli" "$OPT/whisper/whisper-cli"
fi
"$OPT/whisper/whisper-cli" --help >/dev/null 2>&1 && echo "whisper-cli OK"

step "Piper"
rm -rf "$OPT/piper/dist" && mkdir -p "$OPT/piper/dist"
tar -xzf "$DL/piper_linux_x86_64.tar.gz" -C "$OPT/piper/dist"
wrap "$OPT/piper/piper" "$OPT/piper/dist/piper/piper"
echo "test" | "$OPT/piper/piper" --model "$SRC/models/piper/en_US-amy-medium.onnx" \
    --output_file /tmp/piper_test.wav >/dev/null 2>&1 && echo "piper OK"

step "models (copied so each call does not read through /mnt/f)"
mkdir -p "$OPT/models/whisper" "$OPT/models/piper"
cp -u "$SRC"/models/whisper/*.bin "$OPT/models/whisper/"
cp -u "$SRC"/models/piper/*.onnx "$SRC"/models/piper/*.onnx.json "$OPT/models/piper/"

step "Python app"
[ -x "$OPT/venv/bin/python" ] || python3 -m venv "$OPT/venv"
"$OPT/venv/bin/pip" install -q -r "$SRC/project/requirements.txt"
rm -rf "$OPT/app/voice_agent"
cp -r "$SRC/project/voice_agent" "$OPT/app/"
cp "$SRC/project/business_info.txt" "$OPT/app/"
install -m 0755 "$SRC/project/agi/voice_agent.py" "$AGI_DIR/voice_agent.py"
sed -i 's/\r$//' "$AGI_DIR/voice_agent.py"   # in case the file got Windows line endings
chown -R asterisk:asterisk "$WORK"

step "Asterisk config"
for f in pjsip.conf extensions.conf; do
    if [ -f /etc/asterisk/$f ] && [ ! -f /etc/asterisk/$f.orig ]; then
        cp /etc/asterisk/$f /etc/asterisk/$f.orig
    fi
    install -m 0640 -o asterisk -g asterisk "$SRC/project/asterisk/$f" /etc/asterisk/$f
    sed -i 's/\r$//' /etc/asterisk/$f
done
# the stock sip.conf / chan_sip would also want port 5060; keep only pjsip
sed -i '/^noload => chan_sip.so/d' /etc/asterisk/modules.conf   # must sit under [modules], not at the end
sed -i '/^\[modules\]/a noload => chan_sip.so' /etc/asterisk/modules.conf

step "start Asterisk"
systemctl enable asterisk >/dev/null 2>&1 || true
systemctl restart asterisk
sleep 3
asterisk -rx "core show version"
asterisk -rx "pjsip show endpoints" | head -20

step "pipeline check from inside WSL"
if curl -sf http://127.0.0.1:11434/api/version >/dev/null; then
    echo "Ollama on Windows is reachable from WSL"
else
    echo "WARNING: Ollama not reachable at 127.0.0.1:11434 - run scripts/start_all.ps1 on Windows"
fi
sudo -u asterisk env PYTHONPATH="$OPT/app" "$OPT/venv/bin/python" - <<'PY'
from voice_agent import pipeline
pipeline.text_to_speech("This is a telephone audio test.", "/var/spool/asterisk/voicellm/selftest.wav")
print("STT of 8 kHz TTS output:", repr(pipeline.speech_to_text("/var/spool/asterisk/voicellm/selftest.wav")))
PY

echo
echo "setup_wsl.sh finished OK"
