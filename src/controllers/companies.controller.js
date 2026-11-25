// src/controllers/companies.controller.js
const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { nz } = require('../utils/values');

exports.list = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM companies ORDER BY created_at DESC');
  res.json(rows);
});

exports.get = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM companies WHERE id=$1', [req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'Company not found');
  // Ledger: totals across this company's trips (cancelled trips have income 0 via the view)
  const ledger = await query(
    `SELECT
        COUNT(*)                           AS trips,
        COALESCE(SUM(tf.freight_amount) FILTER (WHERE t.status <> 'cancelled'),0) AS total_freight,
        COALESCE(SUM(tf.company_diesel),0) AS diesel_given,
        COALESCE(SUM(tf.income),0)         AS total_income,
        COALESCE(SUM(tf.received),0)       AS total_received,
        COALESCE(SUM(tf.pending),0)        AS total_pending
       FROM trips t JOIN trip_financials tf ON tf.trip_id = t.id
      WHERE t.company_id = $1`, [req.params.id]);
  res.json({ ...rows[0], ledger: ledger.rows[0] });
});

exports.create = asyncHandler(async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `INSERT INTO companies (name, contact_person, phone, deduct_diesel_default)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [f.name, nz(f.contact_person), nz(f.phone), !!f.deduct_diesel_default]);
  res.status(201).json(rows[0]);
});

exports.update = asyncHandler(async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `UPDATE companies SET name=$1, contact_person=$2, phone=$3,
       deduct_diesel_default=COALESCE($4, deduct_diesel_default),
       is_active=COALESCE($5, is_active) WHERE id=$6 RETURNING *`,
    [f.name, nz(f.contact_person), nz(f.phone),
     f.deduct_diesel_default === undefined ? null : !!f.deduct_diesel_default,
     f.is_active === undefined ? null : !!f.is_active, req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'Company not found');
  res.json(rows[0]);
});

exports.remove = asyncHandler(async (req, res) => {
  const used = await query('SELECT 1 FROM trips WHERE company_id=$1 LIMIT 1', [req.params.id]);
  if (used.rows.length) {
    const { rows } = await query(
      'UPDATE companies SET is_active=false WHERE id=$1 RETURNING *', [req.params.id]);
    if (!rows[0]) throw new ApiError(404, 'Company not found');
    return res.json({ softDeleted: true, company: rows[0] });
  }
  const del = await query('DELETE FROM companies WHERE id=$1 RETURNING id', [req.params.id]);
  if (!del.rows[0]) throw new ApiError(404, 'Company not found');
  res.json({ deleted: true });
});
