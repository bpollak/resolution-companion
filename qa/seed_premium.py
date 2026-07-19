#!/usr/bin/env python3
"""Grant a future-dated local yearly entitlement in a simulator manifest.

This is QA-only state setup. The production reconciliation logic keeps a
store-validated local entitlement until its expiry when the server has not yet
observed it, which makes the annual recap test deterministic and offline.
"""

import json
import sys

manifest_path = sys.argv[1]

with open(manifest_path, encoding="utf-8") as handle:
    manifest = json.load(handle)

manifest["subscription"] = json.dumps(
    {
        "isPremium": True,
        "plan": "yearly",
        "expiresAt": "2099-12-31T23:59:59.000Z",
        "purchasedAt": "2026-07-18T12:00:00.000Z",
    }
)

with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle)

print("seeded future-dated yearly entitlement")
