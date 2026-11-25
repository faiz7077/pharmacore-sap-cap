const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = cds.ql
const { today, addDays, num, nextNumber, audit, postMovement, decorateBatches } = require('./lib/common')

module.exports = class SalesService extends cds.ApplicationService {
  init() {
    const { SalesOrders, Batches } = this.entities

    this.after('READ', '*', rows => decorateBatches(rows))

    this.before('CREATE', SalesOrders, async req => {
      if (!req.data.items?.length) return req.error(400, 'A sales order needs at least one item')
      req.data.soNumber = await nextNumber('SO')
    })
    this.after('CREATE', SalesOrders, (so, req) => audit(req, 'SalesOrders', so.soNumber, 'CREATED', {}))

    /** Delivery with FEFO picking – only QC-released batches with enough remaining shelf life. */
    this.on('createDelivery', SalesOrders, async req => {
      const { ID } = req.params[0]
      const so = await SELECT.one.from('pharmacore.SalesOrders').where({ ID })
      if (so.status_code === 'DLV') return req.reject(409, `Sales order ${so.soNumber} is already delivered`)
      const items = await SELECT.from('pharmacore.SalesOrderItems').where({ up__ID: ID })
      const picks = [], problems = []

      for (const it of items) {
        let need = num(it.quantity) - num(it.deliveredQty)
        if (need <= 0) continue
        const mat = await SELECT.one.from('pharmacore.Materials').where({ ID: it.material_ID })
        const minExpiry = addDays(today(), mat.minRemainingShelfLifeDays ?? 0)
        const batches = await SELECT.from('pharmacore.Batches')
          .where({ material_ID: mat.ID, status_code: 'R', availableQty: { '>': 0 }, expiryDate: { '>=': minExpiry } })
          .orderBy('expiryDate asc')
        for (const b of batches) {
          if (need <= 0) break
          const take = Math.min(need, num(b.availableQty))
          picks.push({ item: it, batch: b, quantity: take })
          need -= take
        }
        if (need > 0) problems.push(`${mat.name}: short by ${need} ${mat.baseUnit} (only QC-released stock expiring after ${minExpiry} is eligible)`)
      }
      if (problems.length) return req.reject(409, `Cannot deliver. ${problems.join('; ')}`)

      const delivery = { ID: cds.utils.uuid(), deliveryNo: await nextNumber('DLV'), salesOrder_ID: ID, customer_ID: so.customer_ID, items: [] }
      for (const p of picks) {
        await UPDATE('pharmacore.Batches', p.batch.ID).with({ quantity: { '-=': p.quantity }, availableQty: { '-=': p.quantity } })
        await postMovement('601', p.batch, -p.quantity, delivery.deliveryNo)
        await UPDATE('pharmacore.SalesOrderItems', p.item.ID).with({ deliveredQty: { '+=': p.quantity } })
        delivery.items.push({ ID: cds.utils.uuid(), material_ID: p.batch.material_ID, batch_ID: p.batch.ID, quantity: p.quantity })
      }
      await INSERT.into('pharmacore.Deliveries').entries(delivery)
      await UPDATE('pharmacore.SalesOrders', ID).with({ status_code: 'DLV' })
      await audit(req, 'SalesOrders', so.soNumber, 'DELIVERED', { delivery: delivery.deliveryNo, batches: picks.map(p => p.batch.batchNo) })
      req.info(`Delivery ${delivery.deliveryNo} posted (goods issue 601) from batches ${picks.map(p => p.batch.batchNo).join(', ')}`)
      return SELECT.one.from(SalesOrders).where({ ID })
    })

    return super.init()
  }
}
