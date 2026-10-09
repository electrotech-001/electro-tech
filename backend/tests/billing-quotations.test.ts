import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import express from "express";
import { createBillingProjectsRouter, createBillingQuotationsRouter } from "../src/routes/billing-quotations.js";
import { computeTotals, formatSerial, splitInstallments } from "../src/services/billing/quotation-math.js";
import { createMemoryQuotationRepository, type QuotationRepository } from "../src/services/billing/quotation-store.js";
import type { QuotationDraft } from "../src/services/billing/quotation-math.js";

const servers = new Set<Server>();

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  })));
  servers.clear();
});

function sample(overrides: Partial<QuotationDraft> = {}): QuotationDraft {
  return {
    quotationDate: "2026-10-08",
    customerName: "Sheikh Zain",
    cnic: "37101-1234567-1",
    address: "Saddar Attock",
    contactNo: "0300-5607350",
    whatsappNo: "0300-5607350",
    customerPackage: "12 Kw Goodwe Hybrid Inverter with 5 Kw lithium battery",
    paymentMode: "installments",
    downPayment: 250000,
    installmentCount: 3,
    items: [
      {
        description: "12 Kw Goodwe Hybrid Inverter with 5 Kw Goodwe Lithium Battery",
        qty: 1,
        unit: "Set",
        price: 673000,
        taxPercent: 0,
      },
    ],
    ...overrides,
  };
}

test("line taxable amount follows quantity times price and tax stays editable", () => {
  const totals = computeTotals(sample({
    items: [
      { description: "Inverter", qty: 2, unit: "Nos", price: 1000, taxPercent: 10 },
    ],
  }));
  assert.equal(totals.items[0]?.taxableAmount, 2000);
  assert.equal(totals.items[0]?.taxAmount, 200);
  assert.equal(totals.items[0]?.lineTotal, 2200);
  assert.equal(totals.grandTotal, 2200);
});

test("installments split the balance after down payment without losing paisa", () => {
  const lines = splitInstallments(100, 3);
  assert.deepEqual(lines.map((line) => line.amount), [33.33, 33.33, 33.34]);
  const totals = computeTotals(sample());
  assert.equal(totals.grandTotal, 673000);
  assert.equal(totals.installments.length, 3);
  assert.equal(totals.installments.reduce((sum, line) => sum + line.amount, 0), 423000);
});

test("saved quotations keep a copy when approved and serials increment", async () => {
  const repository = createMemoryQuotationRepository();
  assert.equal(await repository.nextSerial(), "QT-001");
  const first = await repository.create(sample());
  const second = await repository.create(sample({ customerName: "Ayesha Khan", paymentMode: "direct", downPayment: null, installmentCount: null }));
  assert.equal(first.serial, formatSerial(1));
  assert.equal(second.serial, "QT-002");

  const project = await repository.approve(first.id);
  assert.equal(project.serial, "QT-001");
  assert.equal(project.customerName, "Sheikh Zain");
  assert.equal(project.installments.length, 3);
  const quotations = await repository.listQuotations();
  assert.equal(quotations.length, 2);
  assert.equal(quotations.find((entry) => entry.id === first.id)?.approvedAt == null, false);
  const projects = await repository.listProjects();
  assert.equal(projects.length, 1);
  await assert.rejects(() => repository.approve(first.id), /already in Projects in Process/);

  const returned = await repository.disapprove(first.id);
  assert.equal(returned.approvedAt, null);
  assert.equal((await repository.listProjects()).length, 0);
  assert.equal((await repository.listQuotations()).length, 2);
  const again = await repository.approve(first.id);
  assert.equal(again.serial, "QT-001");
  await repository.remove(first.id);
  assert.equal((await repository.listQuotations()).map((entry) => entry.serial).join(","), "QT-002");
  assert.equal((await repository.listProjects()).length, 0);
});

function listen(repository: QuotationRepository): Promise<string> {
  const app = express();
  app.use(express.json());
  const auth: express.RequestHandler = (request, response, next) => {
    if (!request.headers.authorization) {
      response.status(401).json({ message: "Missing authorization header." });
      return;
    }
    next();
  };
  app.use("/api/billing/quotations", createBillingQuotationsRouter({ authMiddleware: auth, repository }));
  app.use("/api/billing/projects", createBillingProjectsRouter({ authMiddleware: auth, repository }));
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      servers.add(server);
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

test("quotation routes require billing login and reject an incomplete CNIC", async () => {
  const baseUrl = await listen(createMemoryQuotationRepository());
  const missing = await fetch(`${baseUrl}/api/billing/quotations`);
  assert.equal(missing.status, 401);

  const created = await fetch(`${baseUrl}/api/billing/quotations`, {
    method: "POST",
    headers: { Authorization: "Bearer staff", "Content-Type": "application/json" },
    body: JSON.stringify(sample({ cnic: "123" })),
  });
  assert.equal(created.status, 400);
  const body = await created.json() as { message: string };
  assert.match(body.message, /CNIC/);
});
