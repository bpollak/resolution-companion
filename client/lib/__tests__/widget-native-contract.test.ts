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

  it("keeps the interactive vote intent widget-only with explicit defaults", () => {
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
});
