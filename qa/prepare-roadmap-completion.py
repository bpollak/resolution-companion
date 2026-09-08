#!/usr/bin/env python3
"""Expose the two long-tenure roadmap moments in an onboarded sim manifest.

Run after qa/seed_history.py. The helper clears the milestone celebration's
seen set and suppresses higher-priority weekly/coach cards so the second-
journey invitation can occupy Today's single story slot after the modal.
"""

import json
import sys
from datetime import date, timedelta

manifest_path = sys.argv[1]

with open(manifest_path, encoding="utf-8") as handle:
    manifest = json.load(handle)

today = date.today()
current_monday = today - timedelta(days=today.weekday())
last_monday = current_monday - timedelta(days=7)

manifest["milestone_celebration_seen_ids"] = json.dumps([])
# The first run flips the seeded benchmark to completed before persisting the
# seen id. Reset its edge-triggered status as well so this helper is rerunnable.
benchmarks = json.loads(manifest["benchmarks"])
if benchmarks:
    benchmarks[0]["status"] = "active"
manifest["benchmarks"] = json.dumps(benchmarks)
manifest["today_weekly_recap_seen_week"] = last_monday.isoformat()
manifest["today_coach_observation_seen"] = (
    f"weekday-Monday-{current_monday.isoformat()}"
)
manifest.pop("second_persona_invite_seen_month", None)

with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle)

print("prepared milestone proposal and second-persona invitation")
