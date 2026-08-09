-- Multi-demo: replace demoKey with demoKeys[] (migrating existing values)
ALTER TABLE "Proposal" ADD COLUMN "demoKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Proposal" SET "demoKeys" = ARRAY["demoKey"] WHERE "demoKey" IS NOT NULL;
ALTER TABLE "Proposal" DROP COLUMN "demoKey";
