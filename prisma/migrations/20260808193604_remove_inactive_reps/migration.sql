-- One-time data cleanup: keep only the three real sales reps (Mark Edler,
-- Jon Bock, Maher Abduselam) plus the admin account; hard-delete every other
-- User seeded from the HubSpot owner import. All User FKs are SetNull or
-- Cascade, so dependent rows (leads/proposals/appointments ownership) are
-- preserved with a null owner and auth accounts/sessions cascade away.
DELETE FROM "User"
WHERE lower(coalesce(email, '')) <> 'mark@edlerzain.com'
  AND lower(coalesce(name, ''))  NOT LIKE '%edler%'
  AND lower(coalesce(name, ''))  NOT LIKE '%bock%'
  AND lower(coalesce(name, ''))  NOT LIKE '%abduselam%'
  AND lower(coalesce(email, '')) NOT LIKE '%bock%'
  AND lower(coalesce(email, '')) NOT LIKE '%abduselam%';
