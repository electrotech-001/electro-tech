"use client";

import "@/components/billing/quotation-print.css";

const LETTER = ".quotation-letter";

function isLetter(node: Element | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement;
}

function imageElements(root: ParentNode): HTMLImageElement[] {
  return [...root.querySelectorAll("img")].filter((node): node is HTMLImageElement => node instanceof HTMLImageElement && Boolean(node.getAttribute("src")));
}

function whenImageReady(img: HTMLImageElement): Promise<void> {
  const decoded = () => {
    if (img.naturalWidth > 0 && typeof img.decode === "function") {
      return img.decode().then(() => undefined, () => undefined);
    }
    return Promise.resolve();
  };
  if (img.complete) return decoded();
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 4000);
    const finish = () => {
      window.clearTimeout(timer);
      void decoded().then(resolve);
    };
    img.addEventListener("load", finish, { once: true });
    img.addEventListener("error", () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function waitForImages(root: ParentNode): Promise<void> {
  if (navigator.userAgent.includes("jsdom")) return Promise.resolve();
  return Promise.all(imageElements(root).map((img) => {
    img.loading = "eager";
    img.decoding = "sync";
    return whenImageReady(img);
  })).then(() => undefined);
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

export async function printBillingLetter(from?: ParentNode | null, attempt = 0): Promise<void> {
  const letter = findBillingLetter(from);
  if (!letter) {
    if (attempt < 8) {
      await new Promise((resolve) => window.setTimeout(resolve, 40));
      await printBillingLetter(from, attempt + 1);
    }
    return;
  }

  await waitForImages(letter);
  document.querySelector(".print-host")?.remove();
  const host = document.createElement("div");
  host.className = "print-host";
  host.append(letter.cloneNode(true));
  document.body.append(host);
  await waitForImages(host);
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

  const cleanup = () => {
    host.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

export function printFromControl(control: Element): Promise<void> {
  const dialog = control.closest("[role='dialog']");
  return printBillingLetter(dialog instanceof HTMLElement ? dialog : document.body);
}
