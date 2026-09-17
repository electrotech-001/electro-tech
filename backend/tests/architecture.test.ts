import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

async function readTree(path: string): Promise<string> {
  const entries = await readdir(path, { withFileTypes: true });
  const content = await Promise.all(entries.map((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? readTree(child) : readFile(child, "utf8");
  }));
  return content.join("\n");
}

test("backend production files contain no persistence dependency or browser secret", async () => {
  const content = [
    await readTree(join(process.cwd(), "src")),
    await readFile(join(process.cwd(), "package.json"), "utf8"),
    await readFile(join(process.cwd(), "package-lock.json"), "utf8"),
    await readFile(join(process.cwd(), ".env.example"), "utf8"),
  ].join("\n").toLowerCase();
  assert.equal(content.includes("sup" + "abase"), false);
  assert.equal(content.includes("service_role_key"), false);
  assert.equal(content.includes("next_public_sup" + "abase"), false);
});
