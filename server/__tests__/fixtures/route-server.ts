import express from "express";
import * as http from "node:http";
import type { AddressInfo } from "node:net";

// Starts the real route table on a loopback port. The caller loads the routes
// itself (jest.requireActual inside beforeAll) so they see the environment and
// mocks that test file set up.
export async function startRouteServer(
  registerRoutes: typeof import("../../routes").registerRoutes,
) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  function send(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    return new Promise<{
      status: number;
      text: string;
      json: any;
      headers: http.IncomingHttpHeaders;
    }>((resolve, reject) => {
      const request = http.request(
        {
          host: "127.0.0.1",
          port,
          method,
          path,
          headers: { "Content-Type": "application/json", ...headers },
        },
        (response) => {
          let text = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => (text += chunk));
          response.on("end", () => {
            let json: any = null;
            try {
              json = JSON.parse(text);
            } catch {}
            resolve({
              status: response.statusCode!,
              text,
              json,
              headers: response.headers,
            });
          });
        },
      );
      request.on("error", reject);
      request.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }

  return {
    send,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
