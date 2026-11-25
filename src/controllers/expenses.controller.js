// src/controllers/expenses.controller.js
// Guards keep every row consistent with the views' assumptions:
// - paid_by='company' must resolve to a company
// - paid_by='driver' needs a driver on the trip
// - an advance is cash given TO the driver: needs a driver, and cannot be "paid by driver"
// - diesel computes amount = litres x rate when amount is omitted
const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { nz } = require('../utils/values');

async function validateExpense(tripId, f) {
  const trip = await query('SELECT driver_id, company_id FROM trips WHERE id=$1', [tripId]);
  if (!trip.rows[0]) throw new ApiError(404, 'Trip not found');
  const { driver_id: driverId, company_id: tripCompanyId } = trip.rows[0];

  if (f.paid_by === 'driver' && !driverId)
    throw new ApiError(400, 'This trip has no driver, so "paid by driver" is not allowed');
  if (f.paid_by === 'company' && !nz(f.company_id) && !tripCompanyId)
    throw new ApiError(400, 'company_id is required when paid_by is company');
  if (f.category === 'advance') {
    if (!driverId) throw new ApiError(400, 'An advance needs a driver on the trip');
    if (f.paid_by === 'driver') throw new ApiError(400, 'An advance cannot be paid by the driver');
  }

  let amount = nz(f.amount);
  if (f.category === 'diesel') {
    if (!f.fill_location) throw new ApiError(400, 'fill_location is required for diesel');
    if (amount === null && nz(f.litres) !== null && nz(f.rate) !== null)
      amount = Math.round(Number(f.litres) * Number(f.rate) * 100) / 100;
  }
  if (amount === null) throw new ApiError(400, 'amount is required');
  if (Number.isNaN(Number(amount)) || Number(amount) < 0)
    throw new ApiError(400, 'amount must be a non-negative number');
  if (f.category === 'other' && !f.work_detail)
    throw new ApiError(400, 'work_detail is required when category is "other"');

  const companyId = f.paid_by === 'company' ? (nz(f.company_id) || tripCompanyId) : null;
  return { amount, companyId };
}

exports.listForTrip = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM expenses WHERE trip_id=$1 ORDER BY expense_date, id', [req.params.tripId]);
  res.json(rows);
});

exports.create = asyncHandler(async (req, res) => {
  const f = req.body;
  const { amount, companyId } = await validateExpense(req.params.tripId, f);
  const { rows } = await query(
    `INSERT INTO expenses
       (trip_id, category, amount, expense_date, paid_by, company_id, mode,
        vendor_name, note, litres, rate, fill_location, work_detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [req.params.tripId, f.category, amount, f.expense_date, f.paid_by, companyId,
     nz(f.mode), nz(f.vendor_name), nz(f.note), nz(f.litres),
     nz(f.rate), nz(f.fill_location), nz(f.work_detail)]);
  res.status(201).json(rows[0]);
});

exports.update = asyncHandler(async (req, res) => {
  const f = req.body;
  const existing = await query('SELECT trip_id FROM expenses WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) throw new ApiError(404, 'Expense not found');
  const { amount, companyId } = await validateExpense(existing.rows[0].trip_id, f);
  const { rows } = await query(
    `UPDATE expenses SET category=$1, amount=$2, expense_date=$3, paid_by=$4,
       company_id=$5, mode=$6, vendor_name=$7, note=$8, litres=$9, rate=$10,
       fill_location=$11, work_detail=$12 WHERE id=$13 RETURNING *`,
    [f.category, amount, f.expense_date, f.paid_by, companyId, nz(f.mode),
     nz(f.vendor_name), nz(f.note), nz(f.litres), nz(f.rate),
     nz(f.fill_location), nz(f.work_detail), req.params.id]);
  res.json(rows[0]);
});

exports.remove = asyncHandler(async (req, res) => {
  const del = await query('DELETE FROM expenses WHERE id=$1 RETURNING id', [req.params.id]);
  if (!del.rows[0]) throw new ApiError(404, 'Expense not found');
  res.json({ deleted: true });
});
