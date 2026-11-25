-- src/db/migrations/001_remove_drivers.sql
-- Removes everything driver-related from an existing database. Safe to re-run.
-- Run with: npm run db:migrate   (or paste into the Supabase SQL editor)
--
-- Data handling:
--   * expenses paid_by='driver'  -> paid_by='ourselves'  (still owner cost, so profit is unchanged)
--   * expenses category='advance' -> deleted               (advances were never counted as cost)
--   * driver_settlements, drivers, trips.driver_id        -> dropped

BEGIN;

DROP VIEW IF EXISTS driver_balances;
DROP TABLE IF EXISTS driver_settlements;

UPDATE expenses SET paid_by = 'ourselves' WHERE paid_by = 'driver';
DELETE FROM expenses WHERE category = 'advance';

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check CHECK (category IN
  ('diesel','toll','food','fine','parking','loading_unloading','tyre','repair','other'));

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_paid_by_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_paid_by_check CHECK (paid_by IN ('ourselves','company'));

DROP INDEX IF EXISTS idx_trips_driver;
ALTER TABLE trips DROP COLUMN IF EXISTS driver_id;
DROP TABLE IF EXISTS drivers;

-- Rebuild the money view without the driver/advance branches.
DROP VIEW IF EXISTS trip_financials;
CREATE VIEW trip_financials AS
WITH base AS (
  SELECT
    t.id AS trip_id,
    t.freight_amount,
    COALESCE(cd.company_diesel, 0) AS company_diesel,
    COALESCE(oc.owner_cost, 0)     AS owner_cost,
    COALESCE(pr.received, 0)       AS received,
    CASE
      WHEN t.status = 'cancelled' THEN 0
      WHEN t.deduct_company_diesel THEN t.freight_amount - COALESCE(cd.company_diesel, 0)
      ELSE t.freight_amount
    END AS income,
    CASE WHEN t.start_odometer IS NOT NULL AND t.end_odometer IS NOT NULL
         THEN t.end_odometer - t.start_odometer END AS km,
    COALESCE(dl.diesel_litres, 0)  AS diesel_litres
  FROM trips t
  LEFT JOIN (
    SELECT trip_id, SUM(amount) AS company_diesel
    FROM expenses WHERE category = 'diesel' AND paid_by = 'company'
    GROUP BY trip_id
  ) cd ON cd.trip_id = t.id
  LEFT JOIN (
    SELECT trip_id, SUM(amount) AS owner_cost
    FROM expenses WHERE paid_by = 'ourselves'
    GROUP BY trip_id
  ) oc ON oc.trip_id = t.id
  LEFT JOIN (
    SELECT trip_id, SUM(amount) AS received
    FROM trip_payments GROUP BY trip_id
  ) pr ON pr.trip_id = t.id
  LEFT JOIN (
    SELECT trip_id, SUM(litres) AS diesel_litres
    FROM expenses WHERE category = 'diesel'
    GROUP BY trip_id
  ) dl ON dl.trip_id = t.id
)
SELECT
  trip_id,
  freight_amount,
  company_diesel,
  owner_cost,
  income,
  income - owner_cost AS profit,
  received,
  income - received   AS pending,
  km,
  diesel_litres
FROM base;

COMMIT;
