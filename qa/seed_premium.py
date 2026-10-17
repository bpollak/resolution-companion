#!/usr/bin/env python3
"""Grant a future-dated local yearly entitlement in a simulator manifest.

This is QA-only state setup. Since review fix B (2026-10-13) the launch check
treats StoreKit's completed, empty entitlement list as account truth and
clears this flag, so on a simulator without a StoreKit entitlement the
seeded Premium state lasts only until that check lands. Use it for checks
that run before the reconciliation, or pair it with a StoreKit test
entitlement.
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
