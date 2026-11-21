import { writeFileSync } from "node:fs";

const names = ["ADMIN_TOKEN", "RATE_LIMIT_KEY", "TURNSTILE_SECRET", "TURNSTILE_HOSTNAMES"];
const lines = [];
for (const name of names) {
  const value = process.env[name];
  if (!value) continue;

  // dotenv normalizes CR, treats a final backslash as an escaped closing quote,
  // and expands literal \n and \r inside double quotes.
  const quote = ["'", "`", '"'].find(
    (q) => !value.includes(q) && (q !== '"' || !/\\[nr]/.test(value)),
  );
  if (!quote || value.includes("\r") || value.endsWith("\\")) {
    throw new Error(`${name} cannot be represented exactly in .dev.vars`);
  }
  lines.push(`${name}=${quote}${value}${quote}`);
}

writeFileSync(process.argv[2], `${lines.join("\n")}\n`, { mode: 0o600, flag: "wx" });
