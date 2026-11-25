// src/controllers/dashboard.controller.js
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { buildTripFilters } = require('../utils/filters');

exports.summary = asyncHandler(async (req, res) => {
  // `clause` = "WHERE ..." for queries with no WHERE of their own;
  // `andClause` = "AND ..." for appending to an existing WHERE. Both are '' with no filters.
  const { clause, andClause, params } = buildTripFilters(req.query, 't', 1);

  // Tiles: totals across filtered trips (cancelled trips contribute 0 income via the view)
  const tiles = await query(
    `SELECT
        COUNT(*) FILTER (WHERE t.status='running')   AS running_trips,
        COUNT(*)                                      AS total_trips,
        COALESCE(SUM(tf.income),0)     AS total_income,
        COALESCE(SUM(tf.owner_cost),0) AS total_cost,
        COALESCE(SUM(tf.profit),0)     AS total_profit,
        COALESCE(SUM(tf.pending),0)    AS total_pending
       FROM trips t JOIN trip_financials tf ON tf.trip_id=t.id ${clause}`, params);

  // Diesel cost to owner (ourselves+driver) in the same filter window
  const diesel = await query(
    `SELECT COALESCE(SUM(e.amount),0) AS diesel_cost
       FROM expenses e JOIN trips t ON t.id=e.trip_id
      WHERE e.category='diesel' AND e.paid_by IN ('ourselves','driver') ${andClause}`, params);

  // Expenses by category (owner-borne)
  const byCat = await query(
    `SELECT e.category, COALESCE(SUM(e.amount),0) AS total
       FROM expenses e JOIN trips t ON t.id=e.trip_id
      WHERE e.category<>'advance' AND e.paid_by IN ('ourselves','driver') ${andClause}
      GROUP BY e.category ORDER BY total DESC`, params);

  // Profit by vehicle
  const byVehicle = await query(
    `SELECT v.id, v.number, v.brand, COALESCE(SUM(tf.profit),0) AS profit
       FROM trips t JOIN trip_financials tf ON tf.trip_id=t.id
       JOIN vehicles v ON v.id=t.vehicle_id ${clause}
      GROUP BY v.id, v.number, v.brand ORDER BY profit DESC`, params);

  // Monthly trend (income/cost/profit by month)
  const monthly = await query(
    `SELECT to_char(date_trunc('month', t.start_date),'YYYY-MM') AS month,
            COALESCE(SUM(tf.income),0) AS income,
            COALESCE(SUM(tf.owner_cost),0) AS cost,
            COALESCE(SUM(tf.profit),0) AS profit
       FROM trips t JOIN trip_financials tf ON tf.trip_id=t.id ${clause}
      GROUP BY 1 ORDER BY 1`, params);

  // Running trips list (always current, not filtered)
  const running = await query(
    `SELECT t.id, v.number AS vehicle_number, c.name AS company_name,
            t.start_location, t.expected_end_location, tf.owner_cost
       FROM trips t JOIN vehicles v ON v.id=t.vehicle_id
       LEFT JOIN companies c ON c.id=t.company_id
       JOIN trip_financials tf ON tf.trip_id=t.id
      WHERE t.status='running' ORDER BY t.start_date DESC`);

  // Document expiries: already expired or expiring within 30 days
  const expiries = await query(
    `SELECT id, number, brand, insurance_expiry, fitness_expiry, permit_expiry, puc_expiry
       FROM vehicles
      WHERE is_active=true AND (
        insurance_expiry <= CURRENT_DATE + 30 OR
        fitness_expiry   <= CURRENT_DATE + 30 OR
        permit_expiry    <= CURRENT_DATE + 30 OR
        puc_expiry       <= CURRENT_DATE + 30)
      ORDER BY number`);

  // Driver dues
  const drivers = await query(
    `SELECT d.id, d.name, b.balance
       FROM drivers d JOIN driver_balances b ON b.driver_id=d.id
      WHERE b.balance <> 0 ORDER BY ABS(b.balance) DESC`);

  res.json({
    tiles: { ...tiles.rows[0], diesel_cost: diesel.rows[0].diesel_cost },
    expensesByCategory: byCat.rows,
    profitByVehicle: byVehicle.rows,
    monthly: monthly.rows,
    runningTrips: running.rows,
    documentExpiries: expiries.rows,
    driverDues: drivers.rows,
  });
});
