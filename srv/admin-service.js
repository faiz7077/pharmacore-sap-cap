const cds = require('@sap/cds')
const { decorateBatches } = require('./lib/common')
module.exports = class AdminService extends cds.ApplicationService {
  init() { this.after('READ', '*', rows => decorateBatches(rows)); return super.init() }
}
