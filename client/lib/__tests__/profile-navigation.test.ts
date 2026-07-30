import fs from "fs";
import path from "path";

const screensDirectory = path.resolve(__dirname, "../../screens");

describe("profile information architecture", () => {
  test("keeps the main settings list focused and moves witness sharing there", () => {
    const profileSource = fs.readFileSync(
      path.join(screensDirectory, "ProfileScreen.tsx"),
      "utf8",
    );
    const mainPanelStart = profileSource.indexOf('{activePanel === "main" ? (');
    const mainPanelEnd = profileSource.indexOf(
      '{activePanel === "privacy" ? (',
      mainPanelStart,
    );
    const mainPanel = profileSource.slice(mainPanelStart, mainPanelEnd);

    expect(mainPanel.match(/<SettingsRow/g)).toHaveLength(5);
    expect(mainPanel).toContain('title="Daily Reminder"');
    expect(mainPanel).toContain('title="Trusted Witness"');
    expect(mainPanel).toContain('navigation.navigate("Witness")');
    expect(mainPanel).toContain('title="Privacy & Data"');
    expect(mainPanel).toContain('title="About"');
    expect(mainPanel).not.toContain('title="The Year You Became"');
    expect(mainPanel).not.toContain('title="Private iCloud Backup"');
    expect(mainPanel).not.toContain('title="AI Data Sharing"');
  });

  test("keeps one story destination in Journey", () => {
    const journeySource = fs.readFileSync(
      path.join(screensDirectory, "JourneyScreen.tsx"),
      "utf8",
    );

    expect(journeySource).toContain('title="Your Story"');
    expect(journeySource).toContain('navigation.navigate("EvidenceTimeline")');
    expect(journeySource).not.toContain('title="Story Archive"');
    expect(journeySource).not.toContain('title="The Year You Became"');
    expect(journeySource).not.toContain('title="Someone in Your Corner"');
    expect(journeySource).not.toContain('navigation.navigate("YearRecap"');
    expect(journeySource).not.toContain('navigation.navigate("Witness")');
  });
});
