import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryTermsRepository } from "../src/services/billing/terms-store.js";

test("document terms start blank and can be replaced", async () => {
  const repository = createMemoryTermsRepository();
  assert.equal(await repository.read(), "");
  assert.equal(await repository.save("  Payment is due on the invoice date.  "), "Payment is due on the invoice date.");
  assert.equal(await repository.read(), "Payment is due on the invoice date.");
  assert.equal(await repository.save(""), "");
  await assert.rejects(() => repository.save("x".repeat(4001)), /4000/);
});
