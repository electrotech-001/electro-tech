import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const serverEntry = fileURLToPath(new URL("../.output/server/index.mjs", import.meta.url));
const port = 43_000 + (process.pid % 1_000);
const origin = `http://127.0.0.1:${port}`;
let server;
let serverError = "";

test.before(async () => {
  server = spawn(process.execPath, [serverEntry], {
    cwd: frontendRoot,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  server.stderr.setEncoding("utf8");
  server.stderr.on("data", (chunk) => { serverError += chunk; });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Nitro server exited before testing. ${serverError}`);
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Nitro server did not become ready. ${serverError}`);
});

test.after(async () => {
  if (!server || server.exitCode !== null) return;
  server.kill();
  await new Promise((resolve) => server.once("exit", resolve));
});

function render(path = "/") {
  return fetch(`${origin}${path}`, { headers: { accept: "text/html" } });
}

test("server-renders the complete Electro Tech page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Powering Progress/);
  assert.match(html, /With Smarter Energy/);
  assert.match(html, /Find your solar starting point/);
  assert.match(html, /AI Solar Bill Analyzer/);
  assert.match(html, /Upload your electricity bill and get a preliminary solar system recommendation based on your actual energy consumption/);
  assert.match(html, /href="\/solar-bill-analyzer"[^>]*>Analyze My Bill/);
  assert.match(html, /Selected projects/);
  assert.match(html, /View All Projects/);
  assert.match(html, /href="\/projects"/);
  assert.doesNotMatch(html, /Project imagery is representative until|Project details to be updated/);
  assert.match(html, /Request My Quote/);
  assert.match(html, /Electro Tech \| Solar Energy &amp; Electrical Solutions/);
  assert.match(html, /class="floating-whatsapp"/);
  assert.match(html, /href="https:\/\/wa\.me\/923105056394"/);
  assert.match(html, /aria-label="Chat on WhatsApp"/);
  assert.match(html, /stroke="#25D366"/);
  assert.match(html, /fill="none"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("adds security headers", async () => {
  const response = await render();
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
});

test("serves public assets and favicon from the Nitro output", async () => {
  const logoRes = await fetch(`${origin}/logos/electrotech-icon.png`);
  assert.equal(logoRes.status, 200);
  assert.match(logoRes.headers.get("content-type") ?? "", /^image\/png/);

  const icoRes = await fetch(`${origin}/favicon.ico`);
  assert.equal(icoRes.status, 200);
  assert.match(icoRes.headers.get("content-type") ?? "", /image\/(?:vnd\.microsoft\.icon|x-icon)/);

  const png32Res = await fetch(`${origin}/favicon-32x32.png`);
  assert.equal(png32Res.status, 200);
  assert.match(png32Res.headers.get("content-type") ?? "", /^image\/png/);

  const rootRes = await render("/");
  const html = await rootRes.text();
  assert.match(html, /<link[^>]+(?:href="\/favicon\.ico"|href="\/favicon-32x32\.png")/);
});

test("server-renders the dedicated Solar Bill Analyzer route", async () => {
  const response = await render("/solar-bill-analyzer");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Reduce the electricity bill with a practical, policy-aware solar configuration/);
  assert.match(html, /Upload your electricity bill/);
  assert.match(html, /Enter Consumption Manually/);
  assert.match(html, /Gemini reads bill data only/);
  assert.match(html, /The bill is processed in memory and is not stored/);
});

test("analyzer stylesheet contains narrow mobile breakpoints", async () => {
  const css = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../components/solar-bill-analyzer.module.css", import.meta.url), "utf8"));
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("server-renders the dedicated Projects Directory route", async () => {
  const response = await render("/projects");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Projects Directory/);
  assert.match(html, /OUR WORK/);
  assert.match(html, /Home/);
  assert.match(html, /Request a Solar Quote/);
});
