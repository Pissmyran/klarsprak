#!/usr/bin/env node
// Fails if a tracked file contains an e-mail address outside the reserved
// example domains (RFC 2606: example.com/.net/.org, .example, .test, .invalid,
// .localhost). Real addresses are data, and data never goes in this repo.
//
//   node tools/check-addresses.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const LOCAL_PART = /[A-Za-z0-9._%+-]+/g;
const DOMAIN = /[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/y;
const RESERVED = /(?:^|\.)(?:example\.(?:com|net|org)|example|test|invalid|localhost)$/i;
// Package scopes and versions look like addresses but are not.
const NOT_AN_ADDRESS = /^(?:\d+(?:\.\d+)*|[a-z]+\.(?:js|ts|mjs|json))$/i;

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(
    (path) => path && !/(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|bun\.lock)$/.test(path),
  );

const found = [];
for (const path of files) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue; // binary
  text.split("\n").forEach((line, index) => {
    // Scan each local-part run once and try the domain only at the next character.
    LOCAL_PART.lastIndex = 0;
    let local;
    while ((local = LOCAL_PART.exec(line))) {
      if (line[LOCAL_PART.lastIndex] !== "@") continue;
      DOMAIN.lastIndex = LOCAL_PART.lastIndex + 1;
      const match = DOMAIN.exec(line);
      if (!match) continue;
      // Consume the match even when it is ignored, as the original search did.
      LOCAL_PART.lastIndex = DOMAIN.lastIndex;
      if (line[local.index - 1] === ":") continue; // user:password@host in a URL
      const domain = match[0].replace(/\.$/, "");
      if (!RESERVED.test(domain) && !NOT_AN_ADDRESS.test(domain))
        found.push(`${path}:${index + 1}: ${local[0]}@${domain}`);
    }
  });
}

if (found.length) {
  console.error(`E-postadresser utanför exempeldomänerna (${found.length}):\n${found.join("\n")}`);
  console.error("Använd example.com, .example eller .test i kod, tester och dokumentation.");
  process.exit(1);
}
console.log(`Inga riktiga e-postadresser i ${files.length} filer.`);
