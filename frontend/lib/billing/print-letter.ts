"use client";

import "@/components/billing/quotation-print.css";

const LETTER = ".quotation-letter";

function isLetter(node: Element | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement;
}

export function findBillingLetter(from?: ParentNode | null): HTMLElement | null {
  if (from instanceof HTMLElement && from.classList.contains("quotation-letter")) return from;
  const scoped = from?.querySelector(LETTER);
  if (isLetter(scoped)) return scoped;

  const letters = [...document.querySelectorAll(LETTER)].filter(isLetter);
  const onScreen = letters.find((node) => {
    const box = node.getBoundingClientRect();
    return box.width > 40 && box.bottom > 0 && box.left >= -20 && box.left < window.innerWidth;
  });
  return onScreen ?? letters[0] ?? null;
}

export function printBillingLetter(from?: ParentNode | null, attempt = 0) {
  const letter = findBillingLetter(from);
  if (!letter) {
    if (attempt < 8) window.setTimeout(() => printBillingLetter(from, attempt + 1), 40);
    return;
  }

  document.querySelector(".print-host")?.remove();
  const host = document.createElement("div");
  host.className = "print-host";
  host.append(letter.cloneNode(true));
  document.body.append(host);

  const cleanup = () => {
    host.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

export function printFromControl(control: Element) {
  const dialog = control.closest("[role='dialog']");
  printBillingLetter(dialog instanceof HTMLElement ? dialog : document.body);
}
