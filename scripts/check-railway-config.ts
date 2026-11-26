import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRailwayContext, project } from "railway/iac";
import configuration, { partial } from "../.railway/railway";

async function main() {
  const desired = await configuration(
    createRailwayContext({ environment: "production" }),
    project,
  );
  assert.equal(partial, "app", "Keep database resources outside this partial");
  assert.equal(desired.name, "resolution-companion");
  assert("variables" in desired);
  assert.deepEqual(
    desired.variables,
    { managed: false },
    "Never manage secrets",
  );

  const resources = desired.resources?.flat() ?? [];
  assert.deepEqual(
    resources.map((resource) => resource.address),
    ["service.app"],
  );
  const app = resources[0];
  assert(app?.type === "service");
  assert.equal(app.variables, undefined);
  assert.equal(app.volumeMounts, undefined);
  assert.equal(app.volumeAttachments, undefined);
  assert.equal(app.configFile, undefined);
  assert.equal(app.source?.repo, "bpollak/resolution-companion");
  assert.equal(app.source?.branch, "main");
  assert.equal(app.source?.checkSuites, false);
  assert.deepEqual(app.build, {
    buildEnvironment: "V3",
    builder: "DOCKERFILE",
    dockerfilePath: "Dockerfile",
  });
  assert.deepEqual(app.deploy, {
    healthcheckPath: "/api/health",
    restartPolicyType: "ON_FAILURE",
    restartPolicyMaxRetries: 10,
    multiRegionConfig: { sfo: { numReplicas: 1 } },
  });
  assert.deepEqual(app.networking?.customDomains, {
    "resolutioncompanion.com": { port: 8080 },
    "www.resolutioncompanion.com": { port: 8080 },
  });
  for (const legacy of ["railway.json", "railway.toml"]) {
    assert(
      !existsSync(legacy),
      `Remove deprecated ${legacy} after production cutover`,
    );
  }
  for (const artifact of [
    ".railway/.cac-migration.json",
    ".railway/production.plan.json",
  ]) {
    execFileSync("git", ["check-ignore", "--quiet", "--no-index", artifact]);
  }
  console.log(
    "Railway configuration preserves app deployment and excludes database, volumes, and secrets.",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
