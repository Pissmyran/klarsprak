#!/usr/bin/env node
// Fails if a tracked file contains an e-mail address outside the reserved
// example domains (RFC 2606: example.com/.net/.org, .example, .test, .invalid,
// .localhost). Real addresses are data, and data never goes in this repo.
//
//   node tools/check-addresses.mjs
import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";

const LOCAL_CHAR = /[A-Za-z0-9._%+-]/;
const DOMAIN = /[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/y;
const RESERVED = /(?:^|\.)(?:example\.(?:com|net|org)|example|test|invalid|localhost)$/i;
// Package scopes and versions look like addresses but are not.
const NOT_AN_ADDRESS = /^(?:\d+(?:\.\d+)*|[a-z]+\.(?:js|ts|mjs|json))$/i;
// Fail instead of declaring an unreadable or oversized file clean.
const MAX_BYTES = 5_000_000;

if (typeof constants.O_NOFOLLOW !== "number" || typeof constants.O_NONBLOCK !== "number") {
  throw new Error("This checker requires O_NOFOLLOW and O_NONBLOCK support.");
}

function readText(path) {
  if (!lstatSync(path).isFile()) throw new Error("not a regular file");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error("not a regular file");
    if (stat.size > MAX_BYTES) throw new Error(`file exceeds ${MAX_BYTES} bytes`);
    const chunks = [];
    let total = 0;
    while (total <= MAX_BYTES) {
      const chunk = Buffer.allocUnsafe(Math.min(65_536, MAX_BYTES + 1 - total));
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      total += count;
      if (total > MAX_BYTES) throw new Error(`file exceeds ${MAX_BYTES} bytes`);
      chunks.push(chunk.subarray(0, count));
    }
    return Buffer.concat(chunks, total).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

// Search from each @ instead of retrying a long local part at every character.
function* addresses(line) {
  let cursor = 0;
  for (let at; (at = line.indexOf("@", cursor)) !== -1;) {
    let start = at;
    while (start > cursor && LOCAL_CHAR.test(line[start - 1])) start--;
    DOMAIN.lastIndex = at + 1;
    const domain = start < at && DOMAIN.exec(line);
    if (domain) {
      yield { index: start, address: line.slice(start, DOMAIN.lastIndex), domain: domain[0] };
      cursor = DOMAIN.lastIndex;
    } else {
      cursor = at + 1;
    }
  }
}

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(
    (path) => path && !/(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|bun\.lock)$/.test(path),
  );

const found = [];
let failed = false;
for (const path of files) {
  let text;
  try {
    text = readText(path);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Cannot check ${path}: ${error.message}`);
      failed = true;
    }
    continue;
  }
  if (text.includes("\0")) continue; // binary
  text.split("\n").forEach((line, index) => {
    for (const match of addresses(line)) {
      if (line[match.index - 1] === ":") continue; // user:password@host in a URL
      const domain = match.domain.replace(/\.$/, "");
      if (!RESERVED.test(domain) && !NOT_AN_ADDRESS.test(domain))
        found.push(`${path}:${index + 1}: ${match.address}`);
    }
  });
}

if (found.length) {
  console.error(`E-postadresser utanför exempeldomänerna (${found.length}):\n${found.join("\n")}`);
  console.error("Använd example.com, .example eller .test i kod, tester och dokumentation.");
}
if (found.length || failed) process.exit(1);
console.log(`Inga riktiga e-postadresser i ${files.length} filer.`);
