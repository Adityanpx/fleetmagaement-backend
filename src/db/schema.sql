-- src/db/schema.sql
-- Run once in Supabase SQL editor (or `npm run db:schema`). Safe to re-run.

-- ---------- USERS (single owner) ----------
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- VEHICLES ----------
CREATE TABLE IF NOT EXISTS vehicles (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number            TEXT NOT NULL,
  brand             TEXT NOT NULL,
  model             TEXT,
  year              INT,
  emi_amount        NUMERIC(12,2),
  emi_due_day       INT CHECK (emi_due_day BETWEEN 1 AND 31),
  insurance_expiry  DATE,
  fitness_expiry    DATE,
  permit_expiry     DATE,
  puc_expiry        DATE,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- DRIVERS ----------
CREATE TABLE IF NOT EXISTS drivers (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            TEXT NOT NULL,
  phone           TEXT,
  license_number  TEXT,
  license_expiry  DATE,
  salary          NUMERIC(12,2),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- COMPANIES ----------
CREATE TABLE IF NOT EXISTS companies (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                   TEXT NOT NULL,
  contact_person         TEXT,
  phone                  TEXT,
  deduct_diesel_default  BOOLEAN NOT NULL DEFAULT false,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- TRIPS ----------
CREATE TABLE IF NOT EXISTS trips (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id             BIGINT NOT NULL REFERENCES vehicles(id),
  driver_id              BIGINT REFERENCES drivers(id),
  company_id             BIGINT REFERENCES companies(id),
  cargo                  TEXT,
  quantity               NUMERIC(10,2),
  start_date             DATE NOT NULL,
  start_location         TEXT NOT NULL,
  expected_end_date      DATE,
  expected_end_location  TEXT,
  actual_end_date        DATE,
  actual_end_location    TEXT,
  start_odometer         NUMERIC(10,1),
  end_odometer           NUMERIC(10,1),
  freight_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  deduct_company_diesel  BOOLEAN NOT NULL DEFAULT false,
  status                 TEXT NOT NULL DEFAULT 'scheduled'
                         CHECK (status IN ('scheduled','running','completed','cancelled')),
  cancel_reason          TEXT,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- EXPENSES ----------
CREATE TABLE IF NOT EXISTS expenses (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id       BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category      TEXT NOT NULL CHECK (category IN
                 ('advance','diesel','toll','food','fine','parking',
                  'loading_unloading','tyre','repair','other')),
  amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  expense_date  DATE NOT NULL,
  paid_by       TEXT NOT NULL CHECK (paid_by IN ('ourselves','company','driver')),
  company_id    BIGINT REFERENCES companies(id),  -- set when paid_by='company'
  mode          TEXT CHECK (mode IN ('cash','upi','bank','card')),
  vendor_name   TEXT,          -- pump / shop / company name
  note          TEXT,
  -- diesel-specific
  litres        NUMERIC(10,2),
  rate          NUMERIC(10,2),
  fill_location TEXT,
  -- tyre / repair / fine / other detail
  work_detail   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- TRIP PAYMENTS (freight received from company) ----------
CREATE TABLE IF NOT EXISTS trip_payments (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id       BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  payment_date  DATE NOT NULL,
  mode          TEXT CHECK (mode IN ('cash','upi','bank','card')),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- DRIVER SETTLEMENTS ----------
CREATE TABLE IF NOT EXISTS driver_settlements (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  driver_id    BIGINT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  trip_id      BIGINT REFERENCES trips(id) ON DELETE SET NULL,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  direction    TEXT NOT NULL CHECK (direction IN ('paid_to_driver','received_from_driver')),
  settle_date  DATE NOT NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- INDEXES ----------
CREATE INDEX IF NOT EXISTS idx_trips_vehicle   ON trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver    ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_company   ON trips(company_id);
CREATE INDEX IF NOT EXISTS idx_trips_status    ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_startdate ON trips(start_date);
CREATE INDEX IF NOT EXISTS idx_expenses_trip   ON expenses(trip_id);
CREATE INDEX IF NOT EXISTS idx_expenses_cat    ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_payments_trip   ON trip_payments(trip_id);
CREATE INDEX IF NOT EXISTS idx_settle_driver   ON driver_settlements(driver_id);

-- ---------- VIEW: trip_financials (THE money logic, one place) ----------
-- A cancelled trip earns no income (income = 0) but its owner costs are still real,
-- so profit goes negative by the amount spent.
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
    FROM expenses WHERE category <> 'advance' AND paid_by IN ('ourselves','driver')
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

-- ---------- VIEW: driver_balances ----------
-- positive = we owe the driver, negative = driver owes us
DROP VIEW IF EXISTS driver_balances;
CREATE VIEW driver_balances AS
SELECT
  d.id AS driver_id,
  COALESCE(own.own_spend, 0)  AS own_spend,
  COALESCE(adv.advances, 0)   AS advances,
  COALESCE(stl.net_settle, 0) AS net_settle,
  COALESCE(own.own_spend, 0) - COALESCE(adv.advances, 0) + COALESCE(stl.net_settle, 0) AS balance
FROM drivers d
LEFT JOIN (
  SELECT t.driver_id, SUM(e.amount) AS own_spend
  FROM expenses e JOIN trips t ON t.id = e.trip_id
  WHERE e.paid_by = 'driver'
  GROUP BY t.driver_id
) own ON own.driver_id = d.id
LEFT JOIN (
  SELECT t.driver_id, SUM(e.amount) AS advances
  FROM expenses e JOIN trips t ON t.id = e.trip_id
  WHERE e.category = 'advance'
  GROUP BY t.driver_id
) adv ON adv.driver_id = d.id
LEFT JOIN (
  SELECT driver_id,
         SUM(CASE WHEN direction = 'received_from_driver' THEN amount
                  ELSE -amount END) AS net_settle
  FROM driver_settlements
  GROUP BY driver_id
) stl ON stl.driver_id = d.id;
