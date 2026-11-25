// src/utils/filters.js
// Builds a parameterised WHERE clause for trip-based queries.
// `alias` is the table alias for trips (e.g. 't').
// Also returns `andClause` (same conditions prefixed with AND) for appending to an existing WHERE.
function buildTripFilters(q, alias = 't', startIdx = 1) {
  const conds = [];
  const params = [];
  let i = startIdx;

  if (q.status) { conds.push(`${alias}.status = $${i++}`); params.push(q.status); }
  if (q.vehicle_id) { conds.push(`${alias}.vehicle_id = $${i++}`); params.push(q.vehicle_id); }
  if (q.driver_id) { conds.push(`${alias}.driver_id = $${i++}`); params.push(q.driver_id); }
  if (q.company_id) { conds.push(`${alias}.company_id = $${i++}`); params.push(q.company_id); }
  if (q.from) { conds.push(`${alias}.start_date >= $${i++}`); params.push(q.from); }
  if (q.to) { conds.push(`${alias}.start_date <= $${i++}`); params.push(q.to); }

  const joined = conds.join(' AND ');
  return {
    clause: conds.length ? `WHERE ${joined}` : '',
    andClause: conds.length ? `AND ${joined}` : '',
    params,
    nextIdx: i,
  };
}

module.exports = { buildTripFilters };
