/**
 * End-to-end GMP lifecycle:
 * PO → goods receipt (quarantine) → QC usage decision → production release (FEFO reservation)
 * → confirmation (genealogy + FG batch in quarantine) → QC release → delivery (FEFO, shelf life) → recall.
 */
const cds = require('@sap/cds')
const { test, describe, before } = require('node:test')
const assert = require('node:assert')

const { GET, POST, PATCH } = cds.test(__dirname + '/..', '--with-mocks')
const as = user => ({ auth: { username: user, password: user } })
const expectFail = async (p, status, re) => {
  try { await p; assert.fail('expected request to fail') }
  catch (e) { assert.equal(e.response?.status ?? e.status, status, e.message); if (re) assert.match(e.response.data.error.message, re) }
}

// create + activate a draft-enabled document
async function createDoc(svc, set, data, user) {
  const { data: d } = await POST(`/odata/v4/${svc}/${set}`, data, as(user))
  const { data: a } = await POST(`/odata/v4/${svc}/${set}(ID=${d.ID},IsActiveEntity=false)/${svc === 'procurement' ? 'ProcurementService' : svc === 'manufacturing' ? 'ManufacturingService' : 'SalesService'}.draftActivate`, {}, as(user))
  return a
}

async function recordResultsAndDecide(lotID, values, decision, user = 'priya') {
  const Q = '/odata/v4/quality'
  await POST(`${Q}/InspectionLots(ID=${lotID},IsActiveEntity=true)/QualityService.draftEdit`, { PreserveChanges: true }, as(user))
  const { data } = await GET(`${Q}/InspectionLots(ID=${lotID},IsActiveEntity=false)/results`, as(user))
  for (const r of data.value) {
    const v = values(r)
    await PATCH(`${Q}/InspectionResults(ID=${r.ID},IsActiveEntity=false)`, { value: v }, as(user))
  }
  await POST(`${Q}/InspectionLots(ID=${lotID},IsActiveEntity=false)/QualityService.draftActivate`, {}, as(user))
  return POST(`${Q}/InspectionLots(ID=${lotID},IsActiveEntity=true)/QualityService.usageDecision`, { decision, reason: 'Results reviewed, complies with spec' }, as(user))
}
const inSpec = r => (Number(r.lowerLimit) + Number(r.upperLimit)) / 2

describe('PharmaCore lifecycle', () => {
  let fgBatch, order

  test('only GMP-approved suppliers can receive purchase orders', async () => {
    await expectFail(createDoc('procurement', 'PurchaseOrders', {
      supplier_ID: 'b0000000-0000-0000-0000-000000000003',
      items: [{ material_ID: 'a0000000-0000-0000-0000-000000000001', quantity: 10, price: 400 }]
    }, 'amit'), 400, /GMP approved vendor/)
  })

  test('goods receipt puts stock in quarantine and opens an inspection lot', async () => {
    const po = await createDoc('procurement', 'PurchaseOrders', {
      supplier_ID: 'b0000000-0000-0000-0000-000000000001',
      items: [{ material_ID: 'a0000000-0000-0000-0000-000000000001', quantity: 25, price: 410 }]
    }, 'amit')
    assert.match(po.poNumber, /^PO-\d{6}$/)
    await POST(`/odata/v4/procurement/PurchaseOrders(ID=${po.ID},IsActiveEntity=true)/ProcurementService.postGoodsReceipt`, {}, as('amit'))
    const { data } = await GET(`/odata/v4/quality/InspectionLots?$filter=origin eq '01'&$expand=batch`, as('priya'))
    assert.equal(data.value.length, 1)
    assert.equal(data.value[0].batch.status_code, 'Q')
    assert.equal(Number(data.value[0].batch.availableQty), 0)
  })

  test('QC cannot accept an out-of-spec lot, but can reject it', async () => {
    const { data } = await GET(`/odata/v4/quality/InspectionLots?$filter=origin eq '01'`, as('priya'))
    const lotID = data.value[0].ID
    await expectFail(recordResultsAndDecide(lotID, r => r.characteristic === 'Assay' ? 96.1 : inSpec(r), 'ACC'), 409, /out-of-specification: Assay/)
    await POST(`/odata/v4/quality/InspectionLots(ID=${lotID},IsActiveEntity=true)/QualityService.usageDecision`, { decision: 'REJ', reason: 'Assay OOS' }, as('priya'))
    const { data: lot } = await GET(`/odata/v4/quality/InspectionLots(ID=${lotID},IsActiveEntity=true)?$expand=batch`, as('priya'))
    assert.equal(lot.status_code, 'REJ'); assert.equal(lot.batch.status_code, 'X')
  })

  test('production release reserves released stock FEFO', async () => {
    order = await createDoc('manufacturing', 'ProductionOrders', { product_ID: 'a0000000-0000-0000-0000-000000000010', plannedQty: 100000 }, 'raj')
    await POST(`/odata/v4/manufacturing/ProductionOrders(ID=${order.ID},IsActiveEntity=true)/ManufacturingService.release`, {}, as('raj'))
    const { data } = await GET(`/odata/v4/manufacturing/ProductionOrders(ID=${order.ID},IsActiveEntity=true)/reservations?$expand=batch&$orderby=batch/expiryDate`, as('raj'))
    // 50 kg paracetamol needed: 30 from B26-000901 (expires first) + 20 from B26-000902; rejected GR batch not used
    const pcm = data.value.filter(r => r.material_ID === 'a0000000-0000-0000-0000-000000000001').map(r => [r.batch.batchNo, Number(r.quantity)])
    assert.deepEqual(pcm, [['B26-000901', 30], ['B26-000902', 20]])
    // MCC: near-expiry batch B26-000906 (Dec 2026) is consumed before B26-000903
    const mcc = data.value.filter(r => r.material_ID === 'a0000000-0000-0000-0000-000000000002').map(r => r.batch.batchNo)
    assert.deepEqual(mcc, ['B26-000906'])
  })

  test('release fails with a clear shortage message', async () => {
    const big = await createDoc('manufacturing', 'ProductionOrders', { product_ID: 'a0000000-0000-0000-0000-000000000010', plannedQty: 1000000 }, 'raj')
    await expectFail(POST(`/odata/v4/manufacturing/ProductionOrders(ID=${big.ID},IsActiveEntity=true)/ManufacturingService.release`, {}, as('raj')), 409, /insufficient released stock/)
  })

  test('confirmation creates a quarantined FG batch with genealogy', async () => {
    await POST(`/odata/v4/manufacturing/ProductionOrders(ID=${order.ID},IsActiveEntity=true)/ManufacturingService.confirm`, { yieldQty: 98500 }, as('raj'))
    const { data: o } = await GET(`/odata/v4/manufacturing/ProductionOrders(ID=${order.ID},IsActiveEntity=true)?$expand=outputBatch($expand=madeFrom)`, as('raj'))
    fgBatch = o.outputBatch
    assert.equal(o.status_code, 'CNF'); assert.equal(fgBatch.status_code, 'Q'); assert.equal(Number(fgBatch.quantity), 98500)
    assert.equal(fgBatch.madeFrom.length, 5)
  })

  test('unreleased finished goods cannot be delivered', async () => {
    const so = await createDoc('sales', 'SalesOrders', { customer_ID: 'c0000000-0000-0000-0000-000000000001', items: [{ material_ID: 'a0000000-0000-0000-0000-000000000010', quantity: 20000 }] }, 'amit')
    await expectFail(POST(`/odata/v4/sales/SalesOrders(ID=${so.ID},IsActiveEntity=true)/SalesService.createDelivery`, {}, as('amit')), 409, /QC-released/)
  })

  test('QC release, then FEFO delivery records the batch shipped', async () => {
    const { data } = await GET(`/odata/v4/quality/InspectionLots?$filter=batch_ID eq ${fgBatch.ID}`, as('priya'))
    await recordResultsAndDecide(data.value[0].ID, inSpec, 'ACC')
    const so = await createDoc('sales', 'SalesOrders', { customer_ID: 'c0000000-0000-0000-0000-000000000002', items: [{ material_ID: 'a0000000-0000-0000-0000-000000000010', quantity: 30000 }] }, 'amit')
    await POST(`/odata/v4/sales/SalesOrders(ID=${so.ID},IsActiveEntity=true)/SalesService.createDelivery`, {}, as('amit'))
    const { data: b } = await GET(`/odata/v4/sales/Batches(${fgBatch.ID})`, as('amit'))
    assert.equal(Number(b.quantity), 68500)
  })

  test('segregation of duties: confirmer cannot release', async () => {
    // admin confirms a second order, then admin tries to release its batch
    const o2 = await createDoc('manufacturing', 'ProductionOrders', { product_ID: 'a0000000-0000-0000-0000-000000000010', plannedQty: 10000 }, 'admin')
    await POST(`/odata/v4/manufacturing/ProductionOrders(ID=${o2.ID},IsActiveEntity=true)/ManufacturingService.release`, {}, as('admin'))
    await POST(`/odata/v4/manufacturing/ProductionOrders(ID=${o2.ID},IsActiveEntity=true)/ManufacturingService.confirm`, {}, as('admin'))
    const { data: o } = await GET(`/odata/v4/manufacturing/ProductionOrders(ID=${o2.ID},IsActiveEntity=true)`, as('admin'))
    const { data } = await GET(`/odata/v4/quality/InspectionLots?$filter=batch_ID eq ${o.outputBatch_ID}`, as('admin'))
    await expectFail(recordResultsAndDecide(data.value[0].ID, inSpec, 'ACC', 'admin'), 403, /Segregation of duties/)
  })

  test('recall of a raw material batch traces forward to customers', async () => {
    const { data: trace } = await GET(`/odata/v4/quality/Batches(10000000-0000-0000-0000-000000000001)/QualityService.trace()`, as('priya'))
    assert.ok(trace.value.some(n => n.direction === 'FORWARD' && n.batchNo === fgBatch.batchNo))
    const { data: recall } = await POST(`/odata/v4/quality/Batches(10000000-0000-0000-0000-000000000001)/QualityService.initiateRecall`, { reason: 'Supplier reported nitrosamine impurity' }, as('priya'))
    assert.match(recall.affectedCustomers, /Apollo Pharmacy/)
    const { data: b } = await GET(`/odata/v4/quality/Batches(${fgBatch.ID})`, as('priya'))
    assert.equal(b.status_code, 'C')
  })

  test('role-based access: warehouse user cannot record a usage decision', async () => {
    await expectFail(GET('/odata/v4/quality/InspectionLots', as('amit')), 403)
  })

  test('every critical step is in the audit trail', async () => {
    const { data } = await GET(`/odata/v4/admin/AuditLog?$select=action`, as('admin'))
    const actions = new Set(data.value.map(a => a.action))
    for (const a of ['GOODS_RECEIPT', 'UD_REJECTED', 'RELEASED', 'CONFIRMED', 'UD_ACCEPTED', 'DELIVERED', 'RECALL']) assert.ok(actions.has(a), a)
  })

  test('S/4HANA product master sync (mocked API_PRODUCT_SRV)', async () => {
    const { data } = await POST('/odata/v4/procurement/syncMaterialsFromS4', {}, as('amit'))
    assert.match(data.value, /3 created/)
  })
})
