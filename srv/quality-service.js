const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = cds.ql
const { num, nextNumber, audit, postMovement, decorateBatches } = require('./lib/common')

module.exports = class QualityService extends cds.ApplicationService {
  init() {
    const { InspectionLots, InspectionResults, Batches } = this.entities

    this.after('READ', '*', rows => decorateBatches(rows))
    this.after('READ', 'InspectionResults', rows => {
      for (const r of [].concat(rows ?? [])) if (r) r.resultCriticality = r.result === 'PASS' ? 3 : r.result === 'FAIL' ? 1 : 0
    })

    // Evaluate each result against its specification while QC is editing the draft
    const evaluate = r => {
      if (r.value === null || r.value === undefined || r.value === '') return null
      return num(r.value) >= num(r.lowerLimit) && num(r.value) <= num(r.upperLimit) ? 'PASS' : 'FAIL'
    }
    this.before('PATCH', InspectionResults.drafts, async req => {
      if (!('value' in req.data)) return
      const cur = await SELECT.one.from(req.subject)
      req.data.result = evaluate({ ...cur, value: req.data.value })
    })
    this.before('UPDATE', InspectionLots, req => {
      for (const r of req.data.results ?? []) r.result = evaluate(r)
      if (req.data.results?.every(r => r.result)) req.data.status_code = 'RREC'
    })
    this.before('EDIT', InspectionLots, async req => {
      const lot = await SELECT.one.from('pharmacore.InspectionLots').where({ ID: req.params[0].ID ?? req.params[0] })
      if (['ACC', 'REJ'].includes(lot?.status_code)) req.reject(409, `Lot ${lot.lotNo} already has a usage decision and is locked`)
    })

    /** Usage decision – the quality release gate. */
    this.on('usageDecision', InspectionLots, async req => {
      const { ID } = req.params[0]
      const { decision, reason } = req.data
      if (!['ACC', 'REJ'].includes(decision)) return req.reject(400, 'Decision must be ACC (accept) or REJ (reject)')
      if (!reason?.trim()) return req.reject(400, 'A reason is mandatory for the usage decision (electronic signature)')

      const lot = await SELECT.one.from('pharmacore.InspectionLots').where({ ID })
      if (['ACC', 'REJ'].includes(lot.status_code)) return req.reject(409, `Lot ${lot.lotNo} already decided`)
      const results = await SELECT.from('pharmacore.InspectionResults').where({ up__ID: ID })
      const missing = results.filter(r => !r.result)
      if (missing.length) return req.reject(409, `Record all results first. Missing: ${missing.map(r => r.characteristic).join(', ')}`)
      const failed = results.filter(r => r.result === 'FAIL')
      if (decision === 'ACC' && failed.length)
        return req.reject(409, `Cannot accept – out-of-specification: ${failed.map(r => `${r.characteristic} = ${r.value} ${r.unit}`).join(', ')}`)

      const batch = await SELECT.one.from('pharmacore.Batches').where({ ID: lot.batch_ID })
      // Segregation of duties: whoever confirmed production may not release the same batch
      if (batch.productionOrder_ID) {
        const po = await SELECT.one.from('pharmacore.ProductionOrders').columns('confirmedBy').where({ ID: batch.productionOrder_ID })
        if (po?.confirmedBy && po.confirmedBy === req.user.id)
          return req.reject(403, 'Segregation of duties: the user who confirmed production cannot release the batch')
      }

      if (decision === 'ACC') {
        await UPDATE('pharmacore.Batches', batch.ID).with({ status_code: 'R', availableQty: num(batch.quantity) - num(batch.reservedQty) })
        await postMovement('321', batch, batch.quantity, lot.lotNo)
      } else {
        await UPDATE('pharmacore.Batches', batch.ID).with({ status_code: 'X', availableQty: 0 })
        await postMovement('350', batch, batch.quantity, lot.lotNo)
      }
      await UPDATE('pharmacore.InspectionLots', ID).with({
        status_code: decision, usageDecisionBy: req.user.id, usageDecisionAt: new Date().toISOString(), usageDecisionReason: reason
      })
      await audit(req, 'InspectionLots', lot.lotNo, decision === 'ACC' ? 'UD_ACCEPTED' : 'UD_REJECTED', { batch: batch.batchNo }, reason)
      req.info(decision === 'ACC' ? `Batch ${batch.batchNo} released for use` : `Batch ${batch.batchNo} rejected and blocked`)
      return SELECT.one.from(InspectionLots).where({ ID })
    })

    this.on('trace', Batches, async req => trace(req.params[0].ID ?? req.params[0]))

    /** Recall: forward-trace, block every downstream batch, list customers who received them. */
    this.on('initiateRecall', Batches, async req => {
      const ID = req.params[0].ID ?? req.params[0]
      if (!req.data.reason?.trim()) return req.reject(400, 'Recall reason is mandatory')
      const nodes = await trace(ID)
      const affected = nodes.filter(n => n.direction !== 'BACKWARD')
      const ids = affected.map(n => n.ID)
      await UPDATE('pharmacore.Batches').set({ status_code: 'C', availableQty: 0 }).where({ ID: { in: ids } })
      const customers = [...new Set(affected.filter(n => n.customer).map(n => n.customer))]
      const recall = { ID: cds.utils.uuid(), recallNo: await nextNumber('RECALL'), batch_ID: ID, reason: req.data.reason,
        affectedBatches: [...new Set(affected.map(n => n.batchNo))].join(', '), affectedCustomers: customers.join(', ') || '— none shipped —' }
      await INSERT.into('pharmacore.Recalls').entries(recall)
      await audit(req, 'Batches', recall.affectedBatches, 'RECALL', { recallNo: recall.recallNo, customers }, req.data.reason)
      req.warn(`Recall ${recall.recallNo}: ${ids.length} batch(es) blocked; customers to notify: ${recall.affectedCustomers}`)
      return recall
    })

    return super.init()
  }
}

/** Walk genealogy backwards (made from) and forwards (used in), and attach deliveries. */
async function trace(rootID) {
  const out = []
  const node = async (id, direction, level) => {
    const b = await SELECT.one.from('pharmacore.Batches', id).columns('ID', 'batchNo', 'quantity', 'status_code', 'material.name as material')
    return { ID: b.ID, direction, level, batchNo: b.batchNo, material: b.material, status: b.status_code, quantity: b.quantity, customer: null }
  }
  out.push(await node(rootID, 'ROOT', 0))
  const walk = async (id, dir, level, seen = new Set()) => {
    if (seen.has(id)) return; seen.add(id)
    const links = await SELECT.from('pharmacore.BatchGenealogy').where(dir === 'BACKWARD' ? { childBatch_ID: id } : { parentBatch_ID: id })
    for (const l of links) {
      const next = dir === 'BACKWARD' ? l.parentBatch_ID : l.childBatch_ID
      out.push({ ...(await node(next, dir, level)), quantity: l.quantity })   // quantity consumed via this link
      await walk(next, dir, level + 1, seen)
    }
  }
  await walk(rootID, 'BACKWARD', 1)
  await walk(rootID, 'FORWARD', 1)
  // deliveries of root + forward batches
  for (const n of out.filter(n => n.direction !== 'BACKWARD')) {
    const dels = await SELECT.from('pharmacore.DeliveryItems').columns('quantity', 'up_.deliveryNo as deliveryNo', 'up_.customer.name as customer').where({ batch_ID: n.ID })
    for (const d of dels) out.push({ ...n, direction: 'SHIPPED', level: n.level + 1, quantity: d.quantity, customer: `${d.customer} (${d.deliveryNo})` })
  }
  return out
}
