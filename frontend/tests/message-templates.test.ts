import { expect, test } from "vitest";
import { fillTemplate, templateCardTitle, templateSendsCard } from "@/lib/billing/message-templates";

test("thank you and feedback cards fill the customer into the message", () => {
  expect(templateSendsCard("thank_you")).toBe(true);
  expect(templateSendsCard("feedback")).toBe(true);
  expect(templateCardTitle("thank_you")).toBe("THANK YOU");
  expect(templateCardTitle("feedback")).toBe("FEEDBACK");
  expect(fillTemplate("Assalam o Alaikum {{name}}, project {{project}}.", {
    name: "Sheikh Zain",
    project: "QT-001",
    packageName: "12 Kw hybrid",
    phone: "0300-5607350",
  })).toBe("Assalam o Alaikum Sheikh Zain, project QT-001.");
});
