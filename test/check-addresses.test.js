import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("../tools/check-addresses.mjs", import.meta.url));

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "address-check-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return {
    dir,
    track(name) {
      execFileSync("git", ["add", "--", name], { cwd: dir });
    },
    check() {
      const result = spawnSync(process.execPath, [checker], {
        cwd: dir,
        encoding: "utf8",
        timeout: 5000,
      });
      assert.ifError(result.error);
      return result;
    },
  };
}

test("checks tracked working-tree content, including addresses across read boundaries", (t) => {
  const repo = fixture(t);
  const path = join(repo.dir, "text.txt");
  writeFileSync(path, "person@example.com\n");
  repo.track("text.txt");
  assert.equal(repo.check().status, 0);

  const address = "person@" + "fictional-domain" + ".not-a-tld";
  writeFileSync(path, "x".repeat(65_533) + "\n" + address + "\n");
  const result = repo.check();
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(`text.txt:2: ${address}`));

  writeFileSync(path, `a@example.com+${address}\n`);
  assert.ok(repo.check().stderr.includes(`text.txt:1: +${address}`));

  writeFileSync(path, Buffer.from([0, ...Buffer.from(address)]));
  assert.equal(repo.check().status, 0);

  writeFileSync(path, "x".repeat(65_536) + "@invalid\n");
  assert.equal(repo.check().status, 0);
});

test(
  "rejects tracked symlinks without reading their targets",
  { skip: process.platform === "win32" },
  (t) => {
    const repo = fixture(t);
    symlinkSync("/dev/zero", join(repo.dir, "device-link"));
    repo.track("device-link");
    const result = repo.check();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /device-link: not a regular file/);
  },
);

test(
  "rejects a tracked file replaced by a named pipe",
  { skip: process.platform === "win32" },
  (t) => {
    const repo = fixture(t);
    const path = join(repo.dir, "pipe");
    writeFileSync(path, "original");
    repo.track("pipe");
    rmSync(path);
    execFileSync("mkfifo", [path]);
    const result = repo.check();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /pipe: not a regular file/);
  },
);

test("accepts the size limit and rejects files over it", (t) => {
  const repo = fixture(t);
  const path = join(repo.dir, "large.txt");
  writeFileSync(path, "original");
  repo.track("large.txt");
  writeFileSync(path, Buffer.alloc(5_000_000, 32));
  assert.equal(repo.check().status, 0);
  writeFileSync(path, Buffer.alloc(5_000_001, 32));
  const result = repo.check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /large.txt: file exceeds 5000000 bytes/);
});
