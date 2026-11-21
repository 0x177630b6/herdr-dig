#!/bin/sh
# Optional Claude Code hook for herdr-fleet: gives the toast and the mailbox the agent's
# own question, and clears it when you answer. Not installed by install.sh.
#
# In the agent's ~/.claude/settings.json (on the machine where the agent runs):
#   "hooks": {
#     "Notification":     [{ "hooks": [{ "type": "command", "command": "/path/to/fleet-ask.sh ask" }] }],
#     "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "/path/to/fleet-ask.sh clear" }] }]
#   }
#
# Labels written on the agent's own terminal (HC_TERMINAL_ID, set by herdr-core):
#   ask=<question text>          shown in the toast, the mailbox and the Home board
#   choices=Yes:1 Enter|No:3 Enter   optional answer buttons, "label:keys" (keys go through
#                                `hc keys`); a choice without ":" is typed as text.
[ -n "$HC_TERMINAL_ID" ] || exit 0
command -v hc >/dev/null 2>&1 || exit 0
case "$1" in
  ask)
    # The hook's JSON arrives on stdin; its "message" is the question.
    msg=$(python3 -I -c 'import json,sys
try: print(" ".join(str(json.load(sys.stdin).get("message","")).split())[:240])
except Exception: pass' 2>/dev/null)
    [ -n "$msg" ] && hc label "$HC_TERMINAL_ID" "ask=$msg" >/dev/null 2>&1
    ;;
  clear)
    hc label "$HC_TERMINAL_ID" ask= choices= >/dev/null 2>&1
    ;;
esac
exit 0
