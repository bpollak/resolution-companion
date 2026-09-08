#!/usr/bin/env python3
"""Unlock every permanent cosmetic for native Profile regression testing."""

import json
import sys

MANIFEST = sys.argv[1]

with open(MANIFEST) as f:
    manifest = json.load(f)

manifest["unlocked_reward_ids"] = json.dumps(
    [
        "dawn-theme",
        "direct-coach-tone",
        "aurora-celebration",
        "aurora-app-icon",
        "violet-accent",
    ]
)
manifest["app_theme_mode"] = "midnight"
manifest["app_accent_style"] = "cyan"

with open(MANIFEST, "w") as f:
    json.dump(manifest, f)

print("seeded all five earned cosmetic rewards")
