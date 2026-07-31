import fs from "node:fs";
import path from "node:path";

describe("native widget contract", () => {
  const widgetSource = fs.readFileSync(
    path.join(process.cwd(), "targets/widget/index.swift"),
    "utf8",
  );
  const shortcutsSource = fs.readFileSync(
    path.join(process.cwd(), "targets/widget/AppShortcuts.swift"),
    "utf8",
  );
  const storageSource = fs.readFileSync(
    path.join(
      process.cwd(),
      "modules/app-group-storage/ios/AppGroupStorageModule.swift",
    ),
    "utf8",
  );
  const widgetBridgeSource = fs.readFileSync(
    path.join(process.cwd(), "client/lib/widget.ts"),
    "utf8",
  );

  it("keeps the interactive completion intent widget-only with explicit defaults", () => {
    expect(widgetSource).toContain("static var isDiscoverable = false");
    expect(widgetSource).toContain(
      '@Parameter(title: "Action", default: "") var actionId: String',
    );
    expect(widgetSource).toContain(
      '@Parameter(title: "Kickstart", default: false) var isKickstart: Bool',
    );
  });

  it("provides a default entity for the discoverable Siri action", () => {
    expect(shortcutsSource).toContain(
      "func defaultResult() async -> ResolutionActionEntity?",
    );
  });

  it("flushes App Group defaults before WidgetKit reloads", () => {
    expect(storageSource).toContain("defaults?.synchronize()");
  });

  it("writes the completion key while retaining the legacy queue migration", () => {
    expect(widgetSource).toContain(
      'let kPendingCompletionsKey = "pendingCompletions"',
    );
    expect(widgetBridgeSource).toContain(
      'const PENDING_COMPLETIONS_KEY = "pendingCompletions"',
    );
    expect(widgetBridgeSource).toContain(
      'const LEGACY_PENDING_COMPLETIONS_KEY = "pendingVotes"',
    );
  });
});
