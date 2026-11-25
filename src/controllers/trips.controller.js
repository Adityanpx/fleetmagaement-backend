// src/controllers/trips.controller.js
// deduct_company_diesel inherits the company's default when not sent on create.
// Completing requires end date + end odometer >= start; cancelling requires a reason.
const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { buildTripFilters } = require('../utils/filters');
const { nz } = require('../utils/values');

const TRIP_SELECT = `
  SELECT t.*, v.number AS vehicle_number, v.brand AS vehicle_brand,
         c.name AS company_name,
         tf.income, tf.owner_cost, tf.profit, tf.received, tf.pending,
         tf.company_diesel, tf.km, tf.diesel_litres
    FROM trips t
    JOIN vehicles v ON v.id = t.vehicle_id
    LEFT JOIN companies c ON c.id = t.company_id
    JOIN trip_financials tf ON tf.trip_id = t.id`;

exports.list = asyncHandler(async (req, res) => {
  const { clause, params } = buildTripFilters(req.query, 't', 1);
  const { rows } = await query(
    `${TRIP_SELECT} ${clause} ORDER BY t.start_date DESC, t.id DESC`, params);
  res.json(rows);
});

exports.get = asyncHandler(async (req, res) => {
  const t = await query(`${TRIP_SELECT} WHERE t.id = $1`, [req.params.id]);
  if (!t.rows[0]) throw new ApiError(404, 'Trip not found');
  const expenses = await query(
    'SELECT * FROM expenses WHERE trip_id=$1 ORDER BY expense_date, id', [req.params.id]);
  const payments = await query(
    'SELECT * FROM trip_payments WHERE trip_id=$1 ORDER BY payment_date, id', [req.params.id]);
  res.json({ ...t.rows[0], expenses: expenses.rows, payments: payments.rows });
});

exports.create = asyncHandler(async (req, res) => {
  const f = req.body;
  let deduct = f.deduct_company_diesel;
  if (deduct === undefined && f.company_id) {
    const c = await query('SELECT deduct_diesel_default FROM companies WHERE id=$1', [f.company_id]);
    deduct = c.rows[0] ? c.rows[0].deduct_diesel_default : false;
  }
  const { rows } = await query(
    `INSERT INTO trips
       (vehicle_id, company_id, cargo, quantity, start_date, start_location,
        expected_end_date, expected_end_location, start_odometer, freight_amount,
        deduct_company_diesel, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'scheduled') RETURNING *`,
    [f.vehicle_id, nz(f.company_id), nz(f.cargo),
     nz(f.quantity), f.start_date, f.start_location, nz(f.expected_end_date),
     nz(f.expected_end_location), nz(f.start_odometer), nz(f.freight_amount) ?? 0,
     !!deduct, nz(f.notes)]);
  res.status(201).json(rows[0]);
});

exports.update = asyncHandler(async (req, res) => {
  const f = req.body;
  const cur = await query('SELECT end_odometer FROM trips WHERE id=$1', [req.params.id]);
  if (!cur.rows[0]) throw new ApiError(404, 'Trip not found');
  const startOdo = nz(f.start_odometer);
  const endOdo = cur.rows[0].end_odometer;
  if (startOdo !== null && endOdo !== null && Number(startOdo) > Number(endOdo))
    throw new ApiError(400, 'start_odometer cannot be greater than the recorded end_odometer');

  const { rows } = await query(
    `UPDATE trips SET
       vehicle_id=$1, company_id=$2, cargo=$3, quantity=$4,
       start_date=$5, start_location=$6, expected_end_date=$7, expected_end_location=$8,
       start_odometer=$9, freight_amount=$10,
       deduct_company_diesel=COALESCE($11, deduct_company_diesel), notes=$12
     WHERE id=$13 RETURNING *`,
    [f.vehicle_id, nz(f.company_id), nz(f.cargo),
     nz(f.quantity), f.start_date, f.start_location, nz(f.expected_end_date),
     nz(f.expected_end_location), startOdo, nz(f.freight_amount) ?? 0,
     f.deduct_company_diesel === undefined ? null : !!f.deduct_company_diesel,
     nz(f.notes), req.params.id]);
  res.json(rows[0]);
});

exports.changeStatus = asyncHandler(async (req, res) => {
  const { status, actual_end_date, actual_end_location, end_odometer, cancel_reason } = req.body;
  const cur = await query('SELECT * FROM trips WHERE id=$1', [req.params.id]);
  const trip = cur.rows[0];
  if (!trip) throw new ApiError(404, 'Trip not found');

  if (status === 'completed') {
    if (!actual_end_date) throw new ApiError(400, 'actual_end_date is required to complete a trip');
    if (nz(end_odometer) === null)
      throw new ApiError(400, 'end_odometer is required to complete a trip');
    if (trip.start_odometer != null && Number(end_odometer) < Number(trip.start_odometer))
      throw new ApiError(400, 'end_odometer cannot be less than start_odometer');
    const { rows } = await query(
      `UPDATE trips SET status='completed', actual_end_date=$1, actual_end_location=$2,
         end_odometer=$3, cancel_reason=NULL WHERE id=$4 RETURNING *`,
      [actual_end_date, nz(actual_end_location), end_odometer, req.params.id]);
    return res.json(rows[0]);
  }
  if (status === 'cancelled') {
    if (!cancel_reason) throw new ApiError(400, 'cancel_reason is required to cancel a trip');
    const { rows } = await query(
      `UPDATE trips SET status='cancelled', cancel_reason=$1 WHERE id=$2 RETURNING *`,
      [cancel_reason, req.params.id]);
    return res.json(rows[0]);
  }
  if (status === 'scheduled' || status === 'running') {
    const { rows } = await query(
      'UPDATE trips SET status=$1, cancel_reason=NULL WHERE id=$2 RETURNING *',
      [status, req.params.id]);
    return res.json(rows[0]);
  }
  throw new ApiError(400, 'Invalid status');
});

exports.remove = asyncHandler(async (req, res) => {
  // expenses & payments cascade via FK ON DELETE CASCADE.
  const del = await query('DELETE FROM trips WHERE id=$1 RETURNING id', [req.params.id]);
  if (!del.rows[0]) throw new ApiError(404, 'Trip not found');
  res.json({ deleted: true });
});

// ----- Trip payments (freight received) -----
exports.addPayment = asyncHandler(async (req, res) => {
  const f = req.body;
  const t = await query('SELECT 1 FROM trips WHERE id=$1', [req.params.id]);
  if (!t.rows[0]) throw new ApiError(404, 'Trip not found');
  const { rows } = await query(
    `INSERT INTO trip_payments (trip_id, amount, payment_date, mode, note)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, f.amount, f.payment_date, nz(f.mode), nz(f.note)]);
  res.status(201).json(rows[0]);
});

exports.deletePayment = asyncHandler(async (req, res) => {
  const del = await query(
    'DELETE FROM trip_payments WHERE id=$1 AND trip_id=$2 RETURNING id',
    [req.params.paymentId, req.params.id]);
  if (!del.rows[0]) throw new ApiError(404, 'Payment not found');
  res.json({ deleted: true });
});
