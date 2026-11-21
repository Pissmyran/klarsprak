import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const writer = fileURLToPath(new URL("../docker/write-dev-vars.mjs", import.meta.url));
const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const index = fileURLToPath(new URL("../src/index.js", import.meta.url));
const names = ["ADMIN_TOKEN", "RATE_LIMIT_KEY", "TURNSTILE_SECRET", "TURNSTILE_HOSTNAMES"];

function writeVars(path, values) {
  const env = { ...process.env };
  for (const name of names) delete env[name];
  return spawnSync(process.execPath, [writer, path], {
    env: { ...env, ...values },
    encoding: "utf8",
  });
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolve),
  );
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

test(
  "Docker settings reach Wrangler and admin authentication unchanged",
  { timeout: 60000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "klarsprak-dev-vars-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const values = {
      ADMIN_TOKEN: "prefix#suffix$NOT_SET",
      RATE_LIMIT_KEY: "'quoted` and $HOME # literal",
      TURNSTILE_SECRET: "trailing newline\n",
      TURNSTILE_HOSTNAMES: '"quoted" # literal',
    };
    const path = join(dir, ".dev.vars");
    const result = writeVars(path, values);
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await stat(path)).mode & 0o777, 0o600);

    await writeFile(
      join(dir, "worker.mjs"),
      `import app from ${JSON.stringify(index)};
    export default { async fetch(request, env, ctx) {
      if (new URL(request.url).pathname === '/bindings') {
        return Response.json(Object.fromEntries(${JSON.stringify(names)}.map(name => [name, env[name]])));
      }
      const session = { prepare() { return { all: async () => ({ results: [] }) }; } };
      return app.fetch(request, Object.assign(Object.create(env), { DB: { withSession: () => session } }), ctx);
    } };`,
    );
    await writeFile(
      join(dir, "wrangler.jsonc"),
      JSON.stringify({
        name: "test-docker-vars",
        main: "worker.mjs",
        compatibility_date: "2026-07-01",
      }),
    );
    const port = await freePort();
    const env = {
      ...process.env,
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
      WRANGLER_SEND_METRICS: "false",
    };
    for (const name of names) delete env[name];
    const server = spawn(
      process.execPath,
      [
        wrangler,
        "dev",
        "--local",
        "--ip",
        "127.0.0.1",
        "--port",
        String(port),
        "--show-interactive-dev-session=false",
      ],
      { cwd: dir, env, stdio: "ignore" },
    );
    t.after(() => {
      server.kill("SIGTERM");
    });
    const url = `http://127.0.0.1:${port}`;
    let response;
    for (let attempts = 0; attempts < 100; attempts++) {
      if (server.exitCode !== null) throw new Error(`Wrangler exited with ${server.exitCode}`);
      try {
        response = await fetch(`${url}/bindings`);
        break;
      } catch {
        await delay(250);
      }
    }
    assert.ok(response, "Wrangler did not start");
    assert.deepEqual(await response.json(), values);
    for (const [token, status] of [
      ["prefix", 401],
      [values.ADMIN_TOKEN, 200],
    ]) {
      const result = await fetch(`${url}/admin/api/queue`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(result.status, status);
    }
    assert.equal((await fetch(`${url}/admin/api/queue`)).status, 401);
  },
);

test("unsupported settings fail before writing an env file", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "klarsprak-dev-vars-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const value of ["with\rcarriage-return", "trailing-backslash\\", "'\"`", "'`literal\\n"]) {
    const path = resolve(dir, ".dev.vars");
    const result = writeVars(path, { ADMIN_TOKEN: value });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ADMIN_TOKEN cannot be represented exactly/);
    await assert.rejects(readFile(path), { code: "ENOENT" });
  }
});
