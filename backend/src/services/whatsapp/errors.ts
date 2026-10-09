export class WhatsAppServiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "WhatsAppServiceError";
    this.status = status;
    this.code = code;
  }
}
