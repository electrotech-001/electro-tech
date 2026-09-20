import "dotenv/config";
import { checkSupabaseConnection } from "../services/supabase.js";

async function main(): Promise<void> {
  const result = await checkSupabaseConnection();
  if (result.ok) {
    console.log("Supabase connection: OK");
    process.exitCode = 0;
  } else {
    console.error(`Supabase connection failed: ${result.error}`);
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error("Supabase connection failed: Unexpected error.");
  process.exitCode = 1;
});
