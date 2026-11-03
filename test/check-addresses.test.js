import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const checker = fileURLToPath(new URL("../tools/check-addresses.mjs", import.meta.url));
const address = (local, domain) => `${local}@${domain}`;

function runChecker(files) {
  const cwd = mkdtempSync(join(tmpdir(), "check-addresses-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd });
    for (const [name, contents] of Object.entries(files)) writeFileSync(join(cwd, name), contents);
    execFileSync("git", ["add", "--", ...Object.keys(files)], { cwd });
    return spawnSync(process.execPath, [checker], { cwd, encoding: "utf8", timeout: 5000 });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("reports non-reserved addresses while preserving exclusions and match boundaries", () => {
  const first = address("person", "unreserved.invalidx");
  const second = address("host", "unreserved.invalidx");
  const result = runChecker({
    "content.txt": [
      address("person", "example.com"),
      address("person", "sub.example.org"),
      address("person", "sample.test"),
      address("package", "1.2.3"),
      address("package", "module.js"),
      `https://user:${first}`,
      `${first}. ${address("missing", "host")}@unreserved.invalidx`,
    ].join("\n"),
    "binary.txt": `\0${first}`,
    "bun.lock": first,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\(2\)/);
  assert.ok(result.stderr.includes(`content.txt:7: ${first}`));
  assert.ok(result.stderr.includes(`content.txt:7: ${second}`));
  assert.ok(!result.stderr.includes("binary.txt:"));
  assert.ok(!result.stderr.includes("bun.lock:"));
});

test("finishes scanning long failed candidates and still finds later addresses", () => {
  const found = address("person", "unreserved.invalidx");
  const result = runChecker({
    "content.txt": `${"a".repeat(300_000)}@nodot ${"b".repeat(300_000)} c@${"d".repeat(300_000)} ${"e@nodot ".repeat(15_000)} ${found}`,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(`content.txt:1: ${found}`));
  assert.match(result.stderr, /\(1\)/);
});

test("accepts files without non-reserved addresses", () => {
  const result = runChecker({ "content.txt": address("person", "example.com") });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Inga riktiga e-postadresser/);
});
