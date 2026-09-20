-- Budgets move to native QBO (ledger) accounts. Existing budget lines were
-- keyed to the retired reporting COA and can't be auto-remapped, so clear them;
-- budgets are re-entered / re-imported from QBO at the account level.
DELETE FROM "BudgetLine";

-- DropForeignKey
ALTER TABLE "BudgetLine" DROP CONSTRAINT "BudgetLine_reportingAccountId_fkey";

-- DropIndex
DROP INDEX "BudgetLine_budgetId_reportingAccountId_key";

-- AlterTable
ALTER TABLE "BudgetLine" DROP COLUMN "reportingAccountId",
ADD COLUMN     "ledgerAccountId" TEXT NOT NULL;

-- DropTable
DROP TABLE "ReportingAccount";

-- CreateIndex
CREATE INDEX "BudgetLine_ledgerAccountId_idx" ON "BudgetLine"("ledgerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_budgetId_ledgerAccountId_key" ON "BudgetLine"("budgetId", "ledgerAccountId");

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

