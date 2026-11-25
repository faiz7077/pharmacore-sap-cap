const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = cds.ql
const { today, addMonths, num, nextNumber, audit, postMovement, createInspectionLot, decorateBatches } = require('./lib/common')

module.exports = class ManufacturingService extends cds.ApplicationService {
  init() {
    const { ProductionOrders, Batches } = this.entities

    this.after('READ', '*', rows => decorateBatches(rows))

    this.before('CREATE', ProductionOrders, async req => {
      const bom = await SELECT.one.from('pharmacore.BOMs').where({ product_ID: req.data.product_ID })
      if (!bom) return req.error(400, 'No bill of materials exists for this product', 'in/product_ID')
      if (num(req.data.plannedQty) <= 0) return req.error(400, 'Planned quantity must be positive', 'in/plannedQty')
      req.data.orderNo = await nextNumber('PROD')
    })
    this.after('CREATE', ProductionOrders, (o, req) => audit(req, 'ProductionOrders', o.orderNo, 'CREATED', { plannedQty: o.plannedQty }))

    /**
     * Release: explode BOM and reserve RELEASED component batches, first-expiry-first-out.
     * Quarantined or rejected material can never be reserved (GMP).
     */
    this.on('release', ProductionOrders, async req => {
      const { ID } = req.params[0]
      const order = await SELECT.one.from('pharmacore.ProductionOrders').where({ ID })
      if (order.status_code !== 'CRTD') return req.reject(409, `Order ${order.orderNo} is not in status Created`)
      const bom = await SELECT.one.from('pharmacore.BOMs').where({ product_ID: order.product_ID })
      const bomItems = await SELECT.from('pharmacore.BOMItems').where({ up__ID: bom.ID })
      const factor = num(order.plannedQty) / num(bom.baseQuantity)
      const reservations = [], shortages = []

      for (const item of bomItems) {
        let need = +(num(item.quantity) * factor).toFixed(3)
        const batches = await SELECT.from('pharmacore.Batches')
          .where({ material_ID: item.component_ID, status_code: 'R', availableQty: { '>': 0 }, expiryDate: { '>': today() } })
          .orderBy('expiryDate asc')
        for (const b of batches) {
          if (need <= 0) break
          const take = Math.min(need, num(b.availableQty))
          reservations.push({ ID: cds.utils.uuid(), up__ID: ID, material_ID: item.component_ID, batch_ID: b.ID, quantity: take, batch: b })
          need = +(need - take).toFixed(3)
        }
        if (need > 0) {
          const m = await SELECT.one.from('pharmacore.Materials').columns('name', 'baseUnit').where({ ID: item.component_ID })
          shortages.push(`${m.name}: short by ${need} ${m.baseUnit}`)
        }
      }
      if (shortages.length) return req.reject(409, `Cannot release – insufficient released stock. ${shortages.join('; ')}`)

      for (const r of reservations) {
        await UPDATE('pharmacore.Batches', r.batch_ID).with({ availableQty: { '-=': r.quantity }, reservedQty: { '+=': r.quantity } })
        delete r.batch
      }
      await INSERT.into('pharmacore.Reservations').entries(reservations)
      await UPDATE('pharmacore.ProductionOrders', ID).with({ status_code: 'REL' })
      await audit(req, 'ProductionOrders', order.orderNo, 'RELEASED', { reservations: reservations.length })
      req.info(`Order released. ${reservations.length} batch reservations created (FEFO).`)
      return SELECT.one.from(ProductionOrders).where({ ID })
    })

    /**
     * Confirm: consume reservations (261), receive finished goods (101) into quarantine,
     * record genealogy and open a production inspection lot (origin 04).
     */
    this.on('confirm', ProductionOrders, async req => {
      const { ID } = req.params[0]
      const order = await SELECT.one.from('pharmacore.ProductionOrders').where({ ID })
      if (order.status_code !== 'REL') return req.reject(409, `Order ${order.orderNo} must be released before confirmation`)
      const yieldQty = num(req.data.yieldQty) || num(order.plannedQty)
      const product = await SELECT.one.from('pharmacore.Materials').where({ ID: order.product_ID })
      const reservations = await SELECT.from('pharmacore.Reservations').where({ up__ID: ID, consumed: false })

      const fg = {
        ID: cds.utils.uuid(), batchNo: await nextNumber('BATCH'), material_ID: product.ID, mfgDate: today(),
        expiryDate: addMonths(today(), product.shelfLifeMonths ?? 24), quantity: yieldQty, availableQty: 0, reservedQty: 0,
        status_code: 'Q', origin: 'PROD', productionOrder_ID: ID
      }
      await INSERT.into('pharmacore.Batches').entries(fg)
      await postMovement('101', fg, yieldQty, order.orderNo)

      for (const r of reservations) {
        const b = await SELECT.one.from('pharmacore.Batches').where({ ID: r.batch_ID })
        await UPDATE('pharmacore.Batches', b.ID).with({ quantity: { '-=': r.quantity }, reservedQty: { '-=': r.quantity } })
        await postMovement('261', b, -num(r.quantity), order.orderNo)
        await UPDATE('pharmacore.Reservations', r.ID).with({ consumed: true })
        await INSERT.into('pharmacore.BatchGenealogy').entries({ ID: cds.utils.uuid(), parentBatch_ID: b.ID, childBatch_ID: fg.ID, quantity: r.quantity, productionOrder_ID: ID })
      }
      const lot = await createInspectionLot(req, fg, product.type_code, '04')
      await UPDATE('pharmacore.ProductionOrders', ID).with({ status_code: 'CNF', outputBatch_ID: fg.ID, confirmedBy: req.user.id })
      await audit(req, 'ProductionOrders', order.orderNo, 'CONFIRMED', { yieldQty, batch: fg.batchNo, inspectionLot: lot.lotNo })
      req.info(`Batch ${fg.batchNo} (${yieldQty} ${product.baseUnit}) created in quarantine. Inspection lot ${lot.lotNo} opened for QC.`)
      return SELECT.one.from(ProductionOrders).where({ ID })
    })

    return super.init()
  }
}
