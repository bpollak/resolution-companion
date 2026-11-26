import { defineRailway, github, project, service } from "railway/iac";

// A named partial cannot remove the separately managed database or its volume.
export const partial = "app";

export default defineRailway(() => {
  const app = service("app", {
    source: github("bpollak/resolution-companion", {
      branch: "main",
      checkSuites: false,
    }),
    build: {
      buildEnvironment: "V3",
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    deploy: {
      healthcheckPath: "/api/health",
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
      multiRegionConfig: { sfo: { numReplicas: 1 } },
    },
    // The apex uses Railway's default port; www already targets 8080 explicitly.
    domains: [
      "resolutioncompanion.com",
      { domain: "www.resolutioncompanion.com", port: 8080 },
    ],
  });

  // Railway CLI 5.75 supports this policy before SDK 3.18's ProjectDefinition
  // type does. Keeping a named definition preserves the policy without a cast.
  const definition = {
    variables: { managed: false },
    resources: [app],
  };
  return project("resolution-companion", definition);
});
