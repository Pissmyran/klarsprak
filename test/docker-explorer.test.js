import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

// Set this to an image built from the checkout to exercise the actual entrypoint.
const image = process.env.KLARSPRAK_TEST_IMAGE;
// A local CA directory can be mounted when the image does not provide one.
const caCerts = process.env.KLARSPRAK_TEST_CA_CERTS;

test(
  "container disables the local database explorer",
  { skip: !image, timeout: 120_000 },
  async () => {
    const port = await new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        server.close((error) => (error ? reject(error) : resolve(port)));
      });
    });
    const id = execFileSync(
      "docker",
      [
        "run",
        "-d",
        "--network",
        "host",
        ...(caCerts ? ["--mount", `type=bind,src=${caCerts},dst=/etc/ssl/certs,readonly`] : []),
        "-e",
        `PORT=${port}`,
        "-e",
        "ADMIN_TOKEN=synthetic-test-token",
        "-e",
        "CLOUDFLARE_CF_FETCH_ENABLED=false",
        "-e",
        "X_LOCAL_EXPLORER=true",
        image,
      ],
      { encoding: "utf8" },
    ).trim();
    const base = `http://127.0.0.1:${port}`;
    try {
      let terms;
      for (let i = 0; i < 200; i++) {
        try {
          terms = await fetch(`${base}/api/terms`, { signal: AbortSignal.timeout(1000) });
          break;
        } catch {
          await delay(250);
        }
      }
      assert.ok(terms, "container did not become ready");
      assert.equal(terms.status, 200);
      assert.equal((await fetch(`${base}/admin/api/queue`)).status, 401);
      assert.equal(
        (
          await fetch(`${base}/admin/api/queue`, {
            headers: { authorization: "Bearer synthetic-test-token" },
          })
        ).status,
        200,
      );
      assert.equal((await fetch(`${base}/cdn-cgi/local/explorer/api/d1/database`)).status, 404);
      assert.equal(
        (
          await fetch(`${base}/cdn-cgi/local/explorer/api/d1/database/local/raw`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sql: "SELECT * FROM submissions" }),
          })
        ).status,
        404,
      );
    } finally {
      execFileSync("docker", ["rm", "-f", "-v", id], { stdio: "ignore" });
    }
  },
);
