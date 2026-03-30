/**
 * Manual Connections pool ingest (Claude pipeline → `games` table).
 * Same logic as GET /api/cron/games → growConnectionsPool → runConnectionsIngest.
 *
 * Env loads via package.json (`-r dotenv/config` + dotenv_config_path) so DB client
 * sees NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY before imports run.
 *
 *   npm run games:connections
 *   npx tsx -r dotenv/config scripts/connections-pool-ingest.ts dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/connections-pool-ingest.ts dotenv_config_path=.env.local -- --category "Science & Discovery"
 */

import type { Category } from "../lib/constants";
import { CATEGORIES } from "../lib/constants";
import {
  getConnectionsPoolSize,
  runConnectionsIngest,
} from "../lib/games/connectionsIngestAgent";

function argCategory(): Category | undefined {
  const i = process.argv.indexOf("--category");
  if (i === -1 || !process.argv[i + 1]) return undefined;
  const raw = process.argv[i + 1].trim();
  const found = CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
  if (!found) {
    console.error(`Unknown category: "${raw}"`);
    console.error(`Valid: ${CATEGORIES.join(", ")}`);
    process.exit(1);
  }
  return found;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error("ANTHROPIC_API_KEY missing — set in .env.local");
    process.exit(1);
  }
  const before = await getConnectionsPoolSize();
  console.log(`Connections pool before: ${before}`);
  const cat = argCategory();
  if (cat) console.log(`Single category: ${cat}\n`);
  else console.log("All categories (one puzzle each per run)\n");

  const n = await runConnectionsIngest(cat);
  const after = await getConnectionsPoolSize();
  console.log(`\nInserted ${n} puzzle(s). Pool after: ${after}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
