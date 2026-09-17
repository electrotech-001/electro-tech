import path from "node:path";
import { DEFAULT_OPERATIONAL_CONFIG } from "../config.js";

export const MAX_BILL_FILE_BYTES = DEFAULT_OPERATIONAL_CONFIG.solarAnalyzerMaxFileMb * 1024 * 1024;

export type ValidBillMimeType = "application/pdf" | "image/jpeg" | "image/png";

const ALLOWED_BY_EXTENSION: Readonly<Record<string, ValidBillMimeType>> = Object.freeze({
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
});

const PERMITTED_BROWSER_MIMES: Readonly<Record<ValidBillMimeType, ReadonlySet<string>>> = Object.freeze({
  "application/pdf": new Set(["application/pdf", "application/x-pdf", "application/octet-stream", ""]),
  "image/jpeg": new Set(["image/jpeg", "image/jpg", "image/pjpeg", "application/octet-stream", ""]),
  "image/png": new Set(["image/png", "image/x-png", "application/octet-stream", ""]),
});

function detectedMimeType(buffer: Buffer): ValidBillMimeType | null {
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

export class BillUploadError extends Error {
  constructor(public readonly code: "empty" | "unsupported" | "mismatch", message: string) {
    super(message);
    this.name = "BillUploadError";
  }
}

export function validateBillUpload(file: Express.Multer.File): { bytes: Buffer; mimeType: ValidBillMimeType } {
  if (!file.buffer?.length || file.size === 0) {
    throw new BillUploadError("empty", "The uploaded bill is empty.");
  }
  const expectedMime = ALLOWED_BY_EXTENSION[path.extname(file.originalname).toLowerCase()];
  if (!expectedMime) {
    throw new BillUploadError("unsupported", "Upload a PDF, JPG, JPEG, or PNG bill.");
  }
  const signatureMime = detectedMimeType(file.buffer);
  if (!signatureMime || signatureMime !== expectedMime) {
    throw new BillUploadError("mismatch", "The bill file type does not match its contents.");
  }
  const browserMime = file.mimetype?.trim().toLowerCase() ?? "";
  const allowedBrowserMimes = PERMITTED_BROWSER_MIMES[expectedMime];
  if (browserMime && !allowedBrowserMimes.has(browserMime)) {
    throw new BillUploadError("mismatch", "The bill file type does not match its contents.");
  }
  return { bytes: file.buffer, mimeType: signatureMime };
}
