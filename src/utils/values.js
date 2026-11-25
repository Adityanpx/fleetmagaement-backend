// src/utils/values.js
// Like `v || null` but keeps legitimate falsy values such as 0 and false.
// undefined, null and '' become null.
function nz(v) {
  return v === undefined || v === null || v === '' ? null : v;
}

module.exports = { nz };
