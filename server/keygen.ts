import { generateMasterKey } from "./keys.ts";

if (import.meta.main) {
  console.info(generateMasterKey());
  console.info("Save it as SYNC_MASTER_KEY in the server environment (keep it secret).");
}
