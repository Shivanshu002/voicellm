#!/usr/bin/env bash
# Copy code, business_info.txt and Asterisk configs from F: into WSL (after editing them).
#   wsl -d Ubuntu-24.04 -u root -- bash /mnt/f/voicellm/project/scripts/deploy_wsl.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)   # repository root, e.g. /mnt/f/voicellm
SRC=$ROOT/project
rm -rf /opt/voicellm/app/voice_agent
cp -r "$SRC/voice_agent" /opt/voicellm/app/
cp "$SRC/business_info.txt" /opt/voicellm/app/
install -m 0755 "$SRC/agi/voice_agent.py" /usr/share/asterisk/agi-bin/voice_agent.py
for f in pjsip.conf extensions.conf; do
    install -m 0640 -o asterisk -g asterisk "$SRC/asterisk/$f" /etc/asterisk/$f
done
sed -i 's/\r$//' /usr/share/asterisk/agi-bin/voice_agent.py /etc/asterisk/pjsip.conf /etc/asterisk/extensions.conf
# userside backend link (written by userside\backend\scripts\link_asterisk.ps1)
if [ -f "$SRC/asterisk/manager.conf" ]; then
    install -m 0640 -o asterisk -g asterisk "$SRC/asterisk/manager.conf" /etc/asterisk/manager.conf
    sed -i 's/\r$//' /etc/asterisk/manager.conf
fi
TOKEN=$ROOT/userside/backend/data/internal_token
if [ -f "$TOKEN" ]; then
    install -m 0640 -o asterisk -g asterisk "$TOKEN" /opt/voicellm/app/internal_token
fi
rm -rf /var/spool/asterisk/voicellm/cache   # greeting etc. are re-synthesized
asterisk -rx "core reload" >/dev/null
asterisk -rx "manager reload" >/dev/null 2>&1 || true
echo "deployed"
