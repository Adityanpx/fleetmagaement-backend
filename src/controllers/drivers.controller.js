// src/controllers/drivers.controller.js
const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { nz } = require('../utils/values');

exports.list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT d.*, COALESCE(b.balance,0) AS balance
       FROM drivers d LEFT JOIN driver_balances b ON b.driver_id = d.id
      ORDER BY d.created_at DESC`);
  res.json(rows);
});

exports.get = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT d.*, COALESCE(b.own_spend,0) own_spend, COALESCE(b.advances,0) advances,
            COALESCE(b.net_settle,0) net_settle, COALESCE(b.balance,0) balance
       FROM drivers d LEFT JOIN driver_balances b ON b.driver_id = d.id
      WHERE d.id = $1`, [req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'Driver not found');
  const settlements = await query(
    'SELECT * FROM driver_settlements WHERE driver_id = $1 ORDER BY settle_date DESC, id DESC',
    [req.params.id]);
  res.json({ ...rows[0], settlements: settlements.rows });
});

exports.create = asyncHandler(async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `INSERT INTO drivers (name, phone, license_number, license_expiry, salary)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [f.name, nz(f.phone), nz(f.license_number), nz(f.license_expiry), nz(f.salary)]);
  res.status(201).json(rows[0]);
});

exports.update = asyncHandler(async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `UPDATE drivers SET name=$1, phone=$2, license_number=$3, license_expiry=$4,
       salary=$5, is_active=COALESCE($6, is_active) WHERE id=$7 RETURNING *`,
    [f.name, nz(f.phone), nz(f.license_number), nz(f.license_expiry),
     nz(f.salary), f.is_active === undefined ? null : !!f.is_active, req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'Driver not found');
  res.json(rows[0]);
});

exports.remove = asyncHandler(async (req, res) => {
  const used = await query('SELECT 1 FROM trips WHERE driver_id = $1 LIMIT 1', [req.params.id]);
  if (used.rows.length) {
    const { rows } = await query(
      'UPDATE drivers SET is_active=false WHERE id=$1 RETURNING *', [req.params.id]);
    if (!rows[0]) throw new ApiError(404, 'Driver not found');
    return res.json({ softDeleted: true, driver: rows[0] });
  }
  const del = await query('DELETE FROM drivers WHERE id=$1 RETURNING id', [req.params.id]);
  if (!del.rows[0]) throw new ApiError(404, 'Driver not found');
  res.json({ deleted: true });
});

// Settlements
exports.addSettlement = asyncHandler(async (req, res) => {
  const f = req.body;
  const d = await query('SELECT 1 FROM drivers WHERE id=$1', [req.params.id]);
  if (!d.rows[0]) throw new ApiError(404, 'Driver not found');
  const { rows } = await query(
    `INSERT INTO driver_settlements (driver_id, trip_id, amount, direction, settle_date, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, nz(f.trip_id), f.amount, f.direction, f.settle_date, nz(f.note)]);
  res.status(201).json(rows[0]);
});

exports.deleteSettlement = asyncHandler(async (req, res) => {
  const del = await query(
    'DELETE FROM driver_settlements WHERE id=$1 AND driver_id=$2 RETURNING id',
    [req.params.settlementId, req.params.id]);
  if (!del.rows[0]) throw new ApiError(404, 'Settlement not found');
  res.json({ deleted: true });
});
