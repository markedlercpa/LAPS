/**
 * CLI entry for the HubSpot import. Reads JSONL/JSON from HUBSPOT_DATA_DIR
 * (default ./hubspot-export) and loads into the DB via the shared importer.
 *
 * Usage:  HUBSPOT_DATA_DIR=./hubspot-export tsx scripts/import-hubspot.ts
 */
import { runHubspotImport } from "../lib/hubspot-import";
import { prisma } from "../lib/prisma";

const dir = process.env.HUBSPOT_DATA_DIR || "./hubspot-export";

runHubspotImport(dir)
  .then((counts) => console.log("Import complete:", counts))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
