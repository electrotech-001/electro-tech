import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryTemplatesRepository } from "../src/services/billing/templates-store.js";

test("message templates start with reminder, thank you, and feedback, and custom ones can be added", async () => {
  const repository = createMemoryTemplatesRepository();
  const initial = await repository.list();
  assert.deepEqual(initial.map((template) => template.kind), ["reminder", "thank_you", "feedback"]);

  const created = await repository.create({ name: "Site visit", body: "Assalam o Alaikum {{name}}, our team will visit {{project}}." });
  assert.equal(created.kind, "custom");
  const edited = await repository.update(initial[1]?.id ?? "", {
    name: "Thank you note",
    body: "Assalam o Alaikum {{name}}, thank you for choosing Electro Tech.",
  });
  assert.equal(edited.kind, "thank_you");
  assert.equal(edited.name, "Thank you note");

  await assert.rejects(() => repository.remove(initial[2]?.id ?? ""), /stays in the list/);
  await repository.remove(created.id);
  assert.equal((await repository.list()).some((template) => template.id === created.id), false);
});
