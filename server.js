/**
 * Custom bootstrap: adds lightweight KPI endpoints for the Fiori launchpad's dynamic tiles.
 */
const cds = require('@sap/cds')
const { SELECT } = cds.ql

const plusDays = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
const KPIS = {
  quarantine: { unit: 'batches', info: 'awaiting QC release', state: 'Critical',
    q: () => SELECT.one`count(1) as n`.from('pharmacore.Batches').where({ status_code: 'Q' }) },
  openLots: { unit: 'lots', info: 'results / usage decision due', state: 'Critical',
    q: () => SELECT.one`count(1) as n`.from('pharmacore.InspectionLots').where({ status_code: { in: ['OPEN', 'RREC'] } }) },
  expiring: { unit: 'batches', info: 'expire within 90 days', state: 'Error',
    q: () => SELECT.one`count(1) as n`.from('pharmacore.Batches').where({ status_code: 'R', quantity: { '>': 0 }, expiryDate: { '<=': plusDays(90) } }) },
  openOrders: { unit: 'orders', info: 'created or released', state: 'Neutral',
    q: () => SELECT.one`count(1) as n`.from('pharmacore.ProductionOrders').where({ status_code: { in: ['CRTD', 'REL'] } }) },
  recalls: { unit: 'recalls', info: 'recall cases', state: 'Error',
    q: () => SELECT.one`count(1) as n`.from('pharmacore.Recalls') }
}

cds.on('bootstrap', app => {
  app.get('/', (_, res) => res.redirect('/index.html'))   // open the Fiori launchpad by default
  app.get('/kpi/:name', async (req, res) => {
    const k = KPIS[req.params.name]
    if (!k) return res.status(404).end()
    const { n } = await cds.db.run(k.q())
    res.set('Cache-Control', 'no-store').json({ d: { number: String(n), numberUnit: k.unit, info: k.info, infoState: n > 0 ? k.state : 'Positive' } })
  })
})

module.exports = cds.server
