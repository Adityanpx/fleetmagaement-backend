// src/controllers/reports.controller.js
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { buildTripFilters } = require('../utils/filters');

const round2 = (n) => Math.round(n * 100) / 100;

exports.trips = asyncHandler(async (req, res) => {
  const { clause, params } = buildTripFilters(req.query, 't', 1);
  const { rows } = await query(
    `SELECT t.id, t.start_date, t.status, v.number AS vehicle,
            c.name AS company, tf.freight_amount, tf.company_diesel, tf.income,
            tf.owner_cost, tf.profit, tf.received, tf.pending, tf.km
       FROM trips t JOIN vehicles v ON v.id=t.vehicle_id
       LEFT JOIN companies c ON c.id=t.company_id
       JOIN trip_financials tf ON tf.trip_id=t.id ${clause}
      ORDER BY t.start_date DESC, t.id DESC`, params);
  const sum = rows.reduce((a, r) => ({
    income: a.income + Number(r.income),
    owner_cost: a.owner_cost + Number(r.owner_cost),
    profit: a.profit + Number(r.profit),
    pending: a.pending + Number(r.pending),
  }), { income: 0, owner_cost: 0, profit: 0, pending: 0 });
  const totals = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, round2(v)]));
  res.json({ rows, totals });
});

exports.vehicles = asyncHandler(async (req, res) => {
  // Filters go in the JOIN condition so vehicles with no matching trips still appear with zeros.
  const { andClause, params } = buildTripFilters(req.query, 't', 1);
  const { rows } = await query(
    `SELECT v.id, v.number, v.brand, COUNT(t.id) AS trips,
            COALESCE(SUM(tf.income),0) AS income,
            COALESCE(SUM(tf.owner_cost),0) AS owner_cost,
            COALESCE(SUM(tf.profit),0) AS profit,
            COALESCE(SUM(tf.km),0) AS km
       FROM vehicles v
       LEFT JOIN trips t ON t.vehicle_id=v.id ${andClause}
       LEFT JOIN trip_financials tf ON tf.trip_id=t.id
      GROUP BY v.id, v.number, v.brand ORDER BY profit DESC`, params);
  res.json({ rows });
});

exports.expenses = asyncHandler(async (req, res) => {
  const { clause, params } = buildTripFilters(req.query, 't', 1);
  const list = await query(
    `SELECT e.*, t.start_date, v.number AS vehicle
       FROM expenses e JOIN trips t ON t.id=e.trip_id
       JOIN vehicles v ON v.id=t.vehicle_id ${clause}
      ORDER BY e.expense_date DESC, e.id DESC`, params);
  const byCat = await query(
    `SELECT e.category, COALESCE(SUM(e.amount),0) AS total, COUNT(*) AS count
       FROM expenses e JOIN trips t ON t.id=e.trip_id ${clause}
      GROUP BY e.category ORDER BY total DESC`, params);
  res.json({ rows: list.rows, byCategory: byCat.rows });
});

exports.fuel = asyncHandler(async (req, res) => {
  // Per-vehicle litres, owner diesel cost, km, km/l, cost/km.
  // Diesel is aggregated per trip in a subquery first, so each trip's km is counted
  // exactly once no matter how many diesel rows it has.
  const { andClause, params } = buildTripFilters(req.query, 't', 1);
  const { rows } = await query(
    `SELECT v.id, v.number, v.brand,
            COALESCE(SUM(dz.litres),0)      AS litres,
            COALESCE(SUM(dz.diesel_cost),0) AS diesel_cost,
            COALESCE(SUM(tf.km),0)          AS km
       FROM vehicles v
       LEFT JOIN trips t ON t.vehicle_id=v.id ${andClause}
       LEFT JOIN trip_financials tf ON tf.trip_id=t.id
       LEFT JOIN (
         SELECT trip_id,
                SUM(COALESCE(litres,0)) AS litres,
                SUM(CASE WHEN paid_by = 'ourselves' THEN amount ELSE 0 END) AS diesel_cost
           FROM expenses WHERE category='diesel'
          GROUP BY trip_id
       ) dz ON dz.trip_id=t.id
      GROUP BY v.id, v.number, v.brand
      ORDER BY v.number`, params);
  // km/l and cost/km computed in JS to avoid divide-by-zero
  const out = rows.map((r) => ({
    ...r,
    km_per_litre: Number(r.litres) > 0 ? Number((Number(r.km) / Number(r.litres)).toFixed(2)) : null,
    cost_per_km: Number(r.km) > 0 ? Number((Number(r.diesel_cost) / Number(r.km)).toFixed(2)) : null,
  }));
  res.json({ rows: out });
});

exports.companies = asyncHandler(async (req, res) => {
  const { andClause, params } = buildTripFilters(req.query, 't', 1);
  const { rows } = await query(
    `SELECT c.id, c.name, COUNT(t.id) AS trips,
            COALESCE(SUM(tf.freight_amount) FILTER (WHERE t.status <> 'cancelled'),0) AS freight,
            COALESCE(SUM(tf.company_diesel),0) AS diesel_given,
            COALESCE(SUM(tf.income),0) AS income,
            COALESCE(SUM(tf.received),0) AS received,
            COALESCE(SUM(tf.pending),0) AS pending
       FROM companies c
       LEFT JOIN trips t ON t.company_id=c.id ${andClause}
       LEFT JOIN trip_financials tf ON tf.trip_id=t.id
      GROUP BY c.id, c.name ORDER BY pending DESC`, params);
  res.json({ rows });
});
