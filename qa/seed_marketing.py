#!/usr/bin/env python3
"""Seed a polished marketing persona for App Store / website screenshots.

Creates "Marathon-Ready Runner" with three milestones, ~90%-consistency
5-week history (today deliberately partial: 1 of 3 done, so the Today shot
shows live action cards), a qualifying Energy discovery, and all transient
cards marked seen so screens stay clean. Run against a freshly launched app's
AsyncStorage manifest (app terminated first).
"""

import hashlib
import json
import sys
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

MANIFEST = sys.argv[1]
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def store_value(manifest, key, value):
    sidecar = Path(MANIFEST).parent / hashlib.md5(key.encode()).hexdigest()
    if len(value.encode()) > 1024:
        sidecar.write_text(value, encoding="utf-8")
        manifest[key] = None
    else:
        manifest[key] = value
        sidecar.unlink(missing_ok=True)


with open(MANIFEST) as f:
    manifest = json.load(f)

today = date.today()
start = today - timedelta(days=34)
created_iso = datetime(start.year, start.month, start.day, 7, 0).isoformat()

persona = {
    "id": str(uuid.uuid4()),
    "name": "Confident Spanish Speaker",
    "description": "Becoming someone who speaks Spanish without hesitation.",
    "createdAt": created_iso,
}

benchmarks = [
    {"id": str(uuid.uuid4()), "personaId": persona["id"], "title": "Hold a 15-Minute Conversation",
     "targetDate": (today + timedelta(days=45)).isoformat(), "status": "active", "createdAt": created_iso},
    {"id": str(uuid.uuid4()), "personaId": persona["id"], "title": "Master 1,000 Core Words",
     "targetDate": None, "status": "active", "createdAt": created_iso},
    {"id": str(uuid.uuid4()), "personaId": persona["id"], "title": "Think in Spanish",
     "targetDate": None, "status": "active", "createdAt": created_iso},
]

actions = [
    {"id": str(uuid.uuid4()), "benchmarkId": benchmarks[0]["id"], "title": "Speak Spanish aloud for 10 minutes",
     "frequency": WEEKDAYS[:], "anchorLink": "after morning coffee",
     "kickstartVersion": "Say one sentence out loud", "createdAt": created_iso},
    {"id": str(uuid.uuid4()), "benchmarkId": benchmarks[1]["id"], "title": "Review 20 flashcards",
     "frequency": ["Tuesday", "Thursday", "Saturday"], "anchorLink": "on the evening commute",
     "kickstartVersion": "Review five cards", "createdAt": created_iso},
    {"id": str(uuid.uuid4()), "benchmarkId": benchmarks[2]["id"], "title": "One lesson + a line in Spanish",
     "frequency": WEEKDAYS[:], "anchorLink": "before bed",
     "kickstartVersion": "Write one Spanish word", "createdAt": created_iso},
]

# ~90% history: skip two specific days entirely; today partial (stretch only).
skip_days = {start + timedelta(days=9), start + timedelta(days=23)}
logs = []
day = start
notes = {
    6: "Ordered coffee entirely in Spanish today.",
    16: "Busy day \u2014 one sentence still counted.",
    27: "Rolled my Rs for the first time!",
}
while day <= today:
    weekday = WEEKDAYS[day.weekday()]
    is_today = day == today
    scheduled = [a for a in actions if weekday in a["frequency"]]
    completed_all = day not in skip_days
    for a in scheduled:
        if is_today and a["title"] != "Speak Spanish aloud for 10 minutes":
            continue  # today stays partial for the live Today shot
        if not completed_all:
            continue
        offset = (day - start).days
        logs.append({
            "id": str(uuid.uuid4()),
            "actionId": a["id"],
            "logDate": day.isoformat(),
            "status": True,
            "createdAt": datetime(day.year, day.month, day.day, 8, 30).isoformat(),
            **({"note": notes[offset]} if offset in notes and a is scheduled[0] else {}),
            "completionKind": "kickstart" if offset == 16 and a is scheduled[0] else "full",
        })
    day += timedelta(days=1)

store_value(manifest, "hasOnboarded", "true")
store_value(manifest, "persona", json.dumps(persona))
store_value(manifest, "personas", json.dumps([persona]))
store_value(manifest, "activePersonaId", persona["id"])  # raw string, not JSON
store_value(manifest, "benchmarks", json.dumps(benchmarks))
store_value(manifest, "elementalActions", json.dumps(actions))
store_value(manifest, "dailyLogs", json.dumps(logs))
store_value(manifest, "aiConsent", "true")

# Keep transient cards out of the screenshots
monday = today - timedelta(days=today.weekday())
manifest["today_weekly_recap_seen_week"] = monday.isoformat()
prev_month = (today.replace(day=1) - timedelta(days=1))
manifest["today_month_recap_seen_month"] = f"{prev_month.year}-{prev_month.month:02d}"
manifest["today_first_day_complete_seen"] = "true"
manifest["today_widget_hint_seen"] = "true"
manifest["progress_next_steps_dismissed"] = "true"
manifest["journey_milestone_info_dismissed"] = "true"

with open(MANIFEST, "w") as f:
    json.dump(manifest, f)

print(f"seeded marketing persona: {len(logs)} logs")
