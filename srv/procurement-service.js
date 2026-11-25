const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = cds.ql
const { today, addMonths, num, nextNumber, audit, postMovement, createInspectionLot, decorateBatches } = require('./lib/common')

module.exports = class ProcurementService extends cds.ApplicationService {
  init() {
    const { PurchaseOrders, Batches } = this.entities

    this.after('READ', '*', rows => decorateBatches(rows))

    this.before('CREATE', PurchaseOrders, async req => {
      const supplier = await SELECT.one.from('pharmacore.Suppliers').where({ ID: req.data.supplier_ID })
      if (!supplier?.gmpApproved) return req.error(400, `Supplier ${supplier?.name ?? ''} is not on the GMP approved vendor list`, 'in/supplier_ID')
      if (!req.data.items?.length) return req.error(400, 'A purchase order needs at least one item')
      req.data.poNumber = await nextNumber('PO')
    })
    this.after('CREATE', PurchaseOrders, (po, req) => audit(req, 'PurchaseOrders', po.poNumber, 'CREATED', { supplier: po.supplier_ID }))

    /** Goods receipt (movement 101) into quality-inspection stock + inspection lot (origin 01). */
    this.on('postGoodsReceipt', PurchaseOrders, async req => {
      const { ID } = req.params[0]
      const po = await SELECT.one.from('pharmacore.PurchaseOrders').where({ ID })
      if (!po) return req.reject(404, 'Purchase order not found')
      if (po.status_code === 'RECV') return req.reject(409, `PO ${po.poNumber} is already fully received`)
      const items = await SELECT.from('pharmacore.PurchaseOrderItems').where({ up__ID: ID })
      const received = []
      for (const it of items) {
        const open = num(it.quantity) - num(it.receivedQty)
        if (open <= 0) continue
        const mat = await SELECT.one.from('pharmacore.Materials').where({ ID: it.material_ID })
        const batch = {
          ID: cds.utils.uuid(), batchNo: await nextNumber('BATCH'), material_ID: mat.ID, mfgDate: today(),
          expiryDate: addMonths(today(), mat.shelfLifeMonths ?? 24), quantity: open, availableQty: 0, reservedQty: 0,
          status_code: 'Q', origin: 'GR', supplier_ID: po.supplier_ID, purchaseOrder_ID: po.ID
        }
        await INSERT.into('pharmacore.Batches').entries(batch)
        await postMovement('101', batch, open, po.poNumber)
        await UPDATE('pharmacore.PurchaseOrderItems', it.ID).with({ receivedQty: it.quantity })
        await createInspectionLot(req, batch, mat.type_code, '01')
        received.push(`${mat.name}: ${open} ${mat.baseUnit} → batch ${batch.batchNo}`)
      }
      await UPDATE('pharmacore.PurchaseOrders', ID).with({ status_code: 'RECV' })
      await audit(req, 'PurchaseOrders', po.poNumber, 'GOODS_RECEIPT', { received })
      req.info(`Goods receipt posted to quarantine. ${received.join('; ')}`)
      return SELECT.one.from(PurchaseOrders).where({ ID })
    })

    /** Inbound integration: SAP S/4HANA Product Master (API_PRODUCT_SRV, OData V2). */
    this.on('syncMaterialsFromS4', async req => {
      const s4 = await cds.connect.to('API_PRODUCT_SRV')
      const { A_Product, A_ProductDescription } = s4.entities
      const products = await s4.run(SELECT.from(A_Product).columns('Product', 'ProductType', 'BaseUnit').limit(100))
      const texts = await s4.run(SELECT.from(A_ProductDescription).columns('Product', 'ProductDescription').where({ Language: 'EN' }).limit(500))
      const nameOf = Object.fromEntries(texts.map(t => [t.Product, t.ProductDescription]))
      let created = 0, updated = 0
      for (const p of products) {
        const typeMap = { FERT: 'FERT', ROH: 'ROH', VERP: 'VERP' }
        const existing = await SELECT.one.from('pharmacore.Materials').where({ s4Product: p.Product })
        const data = { s4Product: p.Product, materialNo: p.Product, name: nameOf[p.Product] ?? p.Product,
          type_code: typeMap[p.ProductType] ?? 'ROH', baseUnit: p.BaseUnit }
        if (existing) { await UPDATE('pharmacore.Materials', existing.ID).with(data); updated++ }
        else { await INSERT.into('pharmacore.Materials').entries({ ID: cds.utils.uuid(), ...data }); created++ }
      }
      await audit(req, 'Materials', 'S4', 'SYNC_FROM_S4', { created, updated })
      return `Synced from S/4HANA: ${created} created, ${updated} updated`
    })

    return super.init()
  }
}
