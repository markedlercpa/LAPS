-- Backfill sequential contract ids on already-won proposals that predate the
-- contractId field. Numbered per calendar year by win date.
WITH ranked AS (
  SELECT id,
    'EZ-' || to_char(coalesce("wonAt", "createdAt"), 'YYYY') || '-' ||
    lpad(
      row_number() OVER (
        PARTITION BY to_char(coalesce("wonAt", "createdAt"), 'YYYY')
        ORDER BY coalesce("wonAt", "createdAt"), id
      )::text, 3, '0'
    ) AS cid
  FROM "Proposal"
  WHERE status = 'WON' AND "contractId" IS NULL
)
UPDATE "Proposal" p SET "contractId" = r.cid FROM ranked r WHERE p.id = r.id;
