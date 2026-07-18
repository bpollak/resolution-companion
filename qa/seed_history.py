#!/usr/bin/env python3
"""Seed 5 weeks of completed-action history into the simulator's AsyncStorage.

Backdates the persona/benchmarks/actions to June 1 and completes every
scheduled day from June 15 through July 16 for all three starter actions.
On next launch this exercises, with real production code paths:
  - milestone auto-completion (daily action reaches 21+ scheduled days)
  - the reward unlock (Dawn theme) + celebration reveal
  - the coach observation card (weekday held 3+ consecutive weeks)
  - long-streak StatChip state
The weekly-recap card is marked seen so the observation card gets the slot.
"""

import json
import sys
import uuid
from datetime import date, timedelta

MANIFEST = sys.argv[1]

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

personas = json.loads(manifest["personas"])
benchmarks = json.loads(manifest["benchmarks"])
actions = json.loads(manifest["elementalActions"])
logs = json.loads(manifest["dailyLogs"])

BACKDATE = "2026-06-01T08:00:00.000Z"
for entity in personas + benchmarks + actions:
    entity["createdAt"] = BACKDATE
persona = json.loads(manifest["persona"])
persona["createdAt"] = BACKDATE
manifest["persona"] = json.dumps(persona)

existing = {(l["actionId"], l["logDate"].split("T")[0]) for l in logs}

start = date(2026, 6, 15)
end = date(2026, 7, 16)
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

manifest["personas"] = json.dumps(personas)
manifest["benchmarks"] = json.dumps(benchmarks)
manifest["elementalActions"] = json.dumps(actions)
manifest["dailyLogs"] = json.dumps(logs)
# Give the Today card slot to the coach observation
manifest["today_weekly_recap_seen_week"] = "2026-07-13"

with open(MANIFEST, "w") as f:
    json.dump(manifest, f)

print(f"seeded {added} completed logs across {len(actions)} actions")
for a in actions:
    print(f"  {a['id']}  {a['title']}  {a['frequency']}")
