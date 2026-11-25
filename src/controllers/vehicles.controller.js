// src/controllers/vehicles.controller.js
// A vehicle with trips is soft-deleted (is_active=false) to keep history; otherwise hard-deleted.
const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { nz } = require('../utils/values');

exports.list = asyncHandler(async (req, res) => {
  const { active } = req.query;
  const where = active === 'true' ? 'WHERE is_active = true' : '';
  const { rows } = await query(`SELECT * FROM vehicles ${where} ORDER BY created_at DESC`);
  res.json(rows);
});

exports.get = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM vehicles WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'Vehicle not found');
  res.json(rows[0]);
});

exports.create = asyncHandler(async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `INSERT INTO vehicles
       (number, brand, model, year, emi_amount, emi_due_day,
        insurance_expiry, fitness_expiry, permit_expiry, puc_expiry)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [f.number, f.brand, nz(f.model), nz(f.year), nz(f.emi_amount),
     nz(f.emi_due_day), nz(f.insurance_expiry), nz(f.fitness_expiry),
     nz(f.permit_expiry), nz(f.puc_expiry)]
  );
  res.status(201).json(rows[0]);
});

exports.update = asyncHandler(async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `UPDATE vehicles SET
       number=$1, brand=$2, model=$3, year=$4, emi_amount=$5, emi_due_day=$6,
       insurance_expiry=$7, fitness_expiry=$8, permit_expiry=$9, puc_expiry=$10,
       is_active=COALESCE($11, is_active)
     WHERE id=$12 RETURNING *`,
    [f.number, f.brand, nz(f.model), nz(f.year), nz(f.emi_amount),
     nz(f.emi_due_day), nz(f.insurance_expiry), nz(f.fitness_expiry),
     nz(f.permit_expiry), nz(f.puc_expiry),
     f.is_active === undefined ? null : !!f.is_active, req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, 'Vehicle not found');
  res.json(rows[0]);
});

exports.remove = asyncHandler(async (req, res) => {
  const used = await query('SELECT 1 FROM trips WHERE vehicle_id = $1 LIMIT 1', [req.params.id]);
  if (used.rows.length) {
    const { rows } = await query(
      'UPDATE vehicles SET is_active = false WHERE id = $1 RETURNING *', [req.params.id]);
    if (!rows[0]) throw new ApiError(404, 'Vehicle not found');
    return res.json({ softDeleted: true, vehicle: rows[0] });
  }
  const del = await query('DELETE FROM vehicles WHERE id = $1 RETURNING id', [req.params.id]);
  if (!del.rows[0]) throw new ApiError(404, 'Vehicle not found');
  res.json({ deleted: true });
});
