const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = cds.ql

const today = () => new Date().toISOString().slice(0, 10)
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const addMonths = (d, n) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10) }
const num = v => Number(v ?? 0)

/** Next document number from a number range object, e.g. PO-000123. */
async function nextNumber(object) {
  await UPDATE('pharmacore.NumberRanges').set('current = current + 1').where({ object })
  const r = await SELECT.one.from('pharmacore.NumberRanges').where({ object })
  if (!r) throw new Error(`Number range ${object} not maintained`)
  return `${r.prefix}${String(r.current).padStart(6, '0')}`
}

/** Write a GMP audit trail entry. */
async function audit(req, entity, entityKey, action, details = {}, reason = null) {
  await INSERT.into('pharmacore.AuditLog').entries({
    ID: cds.utils.uuid(), timestamp: new Date().toISOString(), user: req.user?.id ?? 'system',
    entity, entityKey: String(entityKey), action, reason, details: JSON.stringify(details)
  })
}

/** Post a stock movement document (SAP movement type). */
async function postMovement(movementType, batch, quantity, reference) {
  await INSERT.into('pharmacore.StockMovements').entries({
    ID: cds.utils.uuid(), movementType_code: movementType, batch_ID: batch.ID,
    material_ID: batch.material_ID, quantity, reference
  })
}

/** Inspection plan per material type (simplified SAP QM inspection plan). */
const INSPECTION_PLANS = {
  ROH:  [['Identification (IR)', 'match', 1, 1], ['Assay', '%', 98, 102], ['Loss on drying', '%', 0, 0.5], ['Heavy metals', 'ppm', 0, 10]],
  VERP: [['Visual inspection', 'match', 1, 1], ['Dimensions', 'mm', 0.95, 1.05]],
  FERT: [['Assay', '%', 95, 105], ['Dissolution (30 min)', '%', 80, 100], ['Hardness', 'kp', 4, 10], ['Disintegration', 'min', 0, 15], ['Microbial count', 'cfu/g', 0, 1000]]
}

async function createInspectionLot(req, batch, materialType, origin) {
  const lot = { ID: cds.utils.uuid(), lotNo: await nextNumber('LOT'), batch_ID: batch.ID, origin, status_code: 'OPEN',
    results: (INSPECTION_PLANS[materialType] ?? INSPECTION_PLANS.ROH).map(([characteristic, unit, lowerLimit, upperLimit]) =>
      ({ ID: cds.utils.uuid(), characteristic, unit, lowerLimit, upperLimit })) }
  await INSERT.into('pharmacore.InspectionLots').entries(lot)
  await audit(req, 'InspectionLots', lot.lotNo, 'CREATED', { batch: batch.batchNo, origin })
  return lot
}

/** Compute expiry indicators for batch reads. */
function decorateBatches(rows, now = Date.now()) {
  for (const b of [].concat(rows ?? [])) {
    if (!b || typeof b !== 'object') continue
    if (b.expiryDate) {   // only batches carry an expiry date
      b.daysToExpiry = Math.floor((new Date(b.expiryDate) - now) / 864e5)
      b.expiryCriticality = b.daysToExpiry < 0 ? 1 : b.daysToExpiry <= 90 ? 2 : 3
    }
    for (const v of Object.values(b)) if (v && typeof v === 'object' && !(v instanceof Date)) decorateBatches(v, now)  // expanded navigations
  }
}

module.exports = { today, addDays, addMonths, num, nextNumber, audit, postMovement, createInspectionLot, decorateBatches }
