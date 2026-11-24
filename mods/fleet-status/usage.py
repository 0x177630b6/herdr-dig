# Prints the plan's usage limits of the Claude Code account signed in on this computer, as
# one line of JSON: {"ok": true, "limits": [{"label", "percent", "resets"}]}.
# Only run when "Claude usage" is switched on in Fleet settings. It reads Claude Code's own
# sign-in (the macOS keychain item, or ~/.claude/.credentials.json) and sends it to
# api.anthropic.com only. The token is never printed, and never on a command line.
import json, os, subprocess, sys, urllib.request

def token():
    raw = None
    if sys.platform == "darwin":
        r = subprocess.run(["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"], capture_output=True, text=True, timeout=10)
        raw = r.stdout if r.returncode == 0 else None
    if not raw:
        try:
            raw = open(os.path.expanduser("~/.claude/.credentials.json")).read()
        except OSError:
            return None
    try:
        return json.loads(raw)["claudeAiOauth"]["accessToken"]
    except (ValueError, KeyError, TypeError):
        return None

def main():
    t = token()
    if not t:
        return {"ok": False, "why": "not signed in"}
    req = urllib.request.Request("https://api.anthropic.com/api/oauth/usage", headers={
        "Authorization": "Bearer " + t, "anthropic-beta": "oauth-2025-04-20", "User-Agent": "herdr-fleet"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.load(r)
    except Exception as e:
        return {"ok": False, "why": getattr(e, "reason", None) and str(e.reason) or type(e).__name__}
    out = []
    for l in data.get("limits") or []:
        if not isinstance(l, dict) or l.get("percent") is None:
            continue
        kind = str(l.get("kind") or "")
        model = ((l.get("scope") or {}).get("model") or {}).get("display_name")
        label = model or {"weekly_all": "Week", "session": "5 h", "five_hour": "5 h"}.get(kind, kind.replace("_", " "))
        out.append({"label": str(label)[:16], "percent": round(float(l["percent"])), "resets": l.get("resets_at"), "week": kind.startswith("weekly")})
    return {"ok": True, "limits": out[:4]}

print(json.dumps(main()))
