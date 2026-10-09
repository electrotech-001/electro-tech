import "dotenv/config";
import { createApp } from "./app.js";
import { loadRuntimeConfig } from "./config.js";
import { loadQuoteEmailConfig } from "./services/email.js";
import { loadGeminiConfig } from "./services/gemini.js";
import { loadSupabaseConfig } from "./config.js";
import { restoreWhatsAppSession, shutdownWhatsAppSession } from "./services/whatsapp/session.js";

const HOST = "0.0.0.0";
const config = loadRuntimeConfig();
const app = createApp({ config });

function isConfigured(loader: () => unknown): boolean {
  try {
    loader();
    return true;
  } catch {
    return false;
  }
}

console.log(`Gemini configured: ${isConfigured(() => loadGeminiConfig())}`);
console.log(`Resend configured: ${isConfigured(() => loadQuoteEmailConfig())}`);
console.log(`Supabase configured: ${isConfigured(() => loadSupabaseConfig())}`);

const server = app.listen(config.port, HOST, () => {
  console.log(`Electrotech API listening on ${HOST}:${config.port}`);
  if (isConfigured(() => loadSupabaseConfig())) {
    void restoreWhatsAppSession();
  }
});

function shutdown(signal: string) {
  console.log(`Received ${signal}; closing HTTP server.`);
  void shutdownWhatsAppSession().finally(() => {
    server.close((error) => {
      if (error) {
        console.error("HTTP server shutdown failed", error);
        process.exitCode = 1;
      }
    });
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
