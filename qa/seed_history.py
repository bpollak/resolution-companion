#!/usr/bin/env python3
"""Seed 5 weeks of completed-action history into the simulator's AsyncStorage.

Backdates the persona/benchmarks/actions and completes every scheduled day in
the trailing 32 days for all three starter actions.
On next launch this exercises, with real production code paths:
  - milestone auto-completion (daily action reaches 21+ scheduled days)
  - the reward unlock (Dawn theme) + celebration reveal
  - the coach observation card (weekday held 3+ consecutive weeks)
  - long-streak StatChip state
The weekly-recap card is marked seen so the observation card gets the slot.
"""

import hashlib
import json
import sys
import uuid
from datetime import date, timedelta
from pathlib import Path

MANIFEST = sys.argv[1]


def load_value(manifest, key):
    value = manifest[key]
    if value is not None:
        return value
    sidecar = Path(MANIFEST).parent / hashlib.md5(key.encode()).hexdigest()
    return sidecar.read_text(encoding="utf-8")


def store_value(manifest, key, value):
    sidecar = Path(MANIFEST).parent / hashlib.md5(key.encode()).hexdigest()
    if len(value.encode()) > 1024:
        sidecar.write_text(value, encoding="utf-8")
        manifest[key] = None
    else:
        manifest[key] = value
        sidecar.unlink(missing_ok=True)

WEEKDAYS = {
    "Monday": 0,
    "Tuesday": 1,
    "Wednesday": 2,
    "Thursday": 3,
    "Friday": 4,
    "Saturday": 5,
    "Sunday": 6,
}

with open(MANIFEST) as f:
    manifest = json.load(f)

personas = json.loads(load_value(manifest, "personas"))
benchmarks = json.loads(load_value(manifest, "benchmarks"))
actions = json.loads(load_value(manifest, "elementalActions"))
logs = json.loads(load_value(manifest, "dailyLogs"))

today = date.today()
start = today - timedelta(days=33)
end = today - timedelta(days=1)
BACKDATE = f"{(start - timedelta(days=14)).isoformat()}T08:00:00.000Z"
for entity in personas + benchmarks + actions:
    entity["createdAt"] = BACKDATE
persona = json.loads(manifest["persona"])
persona["createdAt"] = BACKDATE
manifest["persona"] = json.dumps(persona)

existing = {(l["actionId"], l["logDate"].split("T")[0]) for l in logs}

added = 0
day = start
while day <= end:
    weekday_name = day.strftime("%A")
    for action in actions:
        if weekday_name not in action["frequency"]:
            continue
        key = (action["id"], day.isoformat())
        if key in existing:
            continue
        logs.append(
            {
                "id": "seed" + uuid.uuid4().hex[:16],
                "actionId": action["id"],
                "logDate": day.isoformat(),
                "status": True,
                "createdAt": f"{day.isoformat()}T18:00:00.000Z",
            }
        )
        added += 1
    day += timedelta(days=1)

store_value(manifest, "personas", json.dumps(personas))
store_value(manifest, "benchmarks", json.dumps(benchmarks))
store_value(manifest, "elementalActions", json.dumps(actions))
store_value(manifest, "dailyLogs", json.dumps(logs))
# Give the Today card slot to the coach observation
manifest["today_weekly_recap_seen_week"] = (
    today - timedelta(days=today.weekday())
).isoformat()

with open(MANIFEST, "w") as f:
    json.dump(manifest, f)

print(f"seeded {added} completed logs across {len(actions)} actions")
for a in actions:
    print(f"  {a['id']}  {a['title']}  {a['frequency']}")
