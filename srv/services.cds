using { pharmacore as db } from '../db/schema';

/** SAP MM – procurement & warehouse */
@path: '/odata/v4/procurement'
@requires: ['WarehouseManager', 'Admin']
@impl: 'srv/procurement-service.js'
service ProcurementService {
  @odata.draft.enabled entity Materials as projection on db.Materials;
  @odata.draft.enabled entity Suppliers as projection on db.Suppliers;
  @odata.draft.enabled entity PurchaseOrders as projection on db.PurchaseOrders actions {
    @(Common.SideEffects: { TargetEntities: ['in', 'in/items'] })
    action postGoodsReceipt() returns PurchaseOrders;
  };
  @readonly entity Batches        as projection on db.Batches;
  @readonly entity StockMovements as projection on db.StockMovements;

  /** Pull material master data from SAP S/4HANA (API_PRODUCT_SRV). */
  action syncMaterialsFromS4() returns String;
}

/** SAP PP-PI – process manufacturing */
@path: '/odata/v4/manufacturing'
@requires: ['ProductionManager', 'Admin']
@impl: 'srv/manufacturing-service.js'
service ManufacturingService {
  @odata.draft.enabled entity BOMs as projection on db.BOMs;
  @odata.draft.enabled entity ProductionOrders as projection on db.ProductionOrders actions {
    /** Explode BOM and reserve released component batches, first-expiry-first-out. */
    @(Common.SideEffects: { TargetEntities: ['in', 'in/reservations'] })
    action release() returns ProductionOrders;
    /** Consume reservations, create finished-goods batch in quarantine + inspection lot. */
    @(Common.SideEffects: { TargetEntities: ['in', 'in/reservations'] })
    action confirm(yieldQty : db.Qty) returns ProductionOrders;
  };
  @readonly entity Batches        as projection on db.Batches;
  @readonly entity BatchGenealogy as projection on db.BatchGenealogy;
}

/** SAP QM – quality management */
@path: '/odata/v4/quality'
@requires: ['QualityOfficer', 'Admin']
@impl: 'srv/quality-service.js'
service QualityService {
  @odata.draft.enabled entity InspectionLots as projection on db.InspectionLots actions {
    /** Usage decision: accept → batch released; reject → batch blocked. Reason is mandatory (e-signature). */
    @(Common.SideEffects: { TargetEntities: ['in'] })
    action usageDecision(
      decision : String(4) @(title: 'Decision (ACC / REJ)', Common.ValueListWithFixedValues, Common.ValueList: {
        CollectionPath: 'UsageDecisionCodes', Parameters: [{ $Type: 'Common.ValueListParameterInOut', LocalDataProperty: decision, ValueListProperty: 'code' }]
      }),
      reason   : String(255) @(title: 'Reason / e-signature comment', UI.MultiLineText)
    ) returns InspectionLots;
  };
  @readonly entity UsageDecisionCodes as projection on db.LotStatus where code = 'ACC' or code = 'REJ';
  @readonly entity Batches as projection on db.Batches actions {
    /** Forward-trace the batch through genealogy, block all affected batches, list affected customers. */
    @(Common.SideEffects: { TargetEntities: ['in'] })
    action initiateRecall(reason : String(255) @(title: 'Recall reason', UI.MultiLineText)) returns Recalls;
    /** Full genealogy tree: backward (made from) and forward (used in). */
    function trace() returns array of TraceNode;
  };
  @readonly entity BatchGenealogy as projection on db.BatchGenealogy;
  @readonly entity Recalls        as projection on db.Recalls;
  @readonly entity StockMovements as projection on db.StockMovements;
  @readonly entity Deliveries     as projection on db.Deliveries;

  type TraceNode {
    direction : String;   // ROOT, BACKWARD, FORWARD
    level     : Integer;
    batchNo   : String;
    material  : String;
    status    : String;
    quantity  : db.Qty;
    customer  : String;
  }
}

/** SAP SD – sales & distribution */
@path: '/odata/v4/sales'
@requires: ['WarehouseManager', 'Admin']
@impl: 'srv/sales-service.js'
service SalesService {
  @odata.draft.enabled entity Customers as projection on db.Customers;
  @odata.draft.enabled entity SalesOrders as projection on db.SalesOrders actions {
    /** FEFO picking from released batches honouring minimum remaining shelf life; posts goods issue (601). */
    @(Common.SideEffects: { TargetEntities: ['in', 'in/items', 'in/deliveries'] })
    action createDelivery() returns SalesOrders;
  };
  @readonly entity Deliveries as projection on db.Deliveries;
  @readonly entity Batches    as projection on db.Batches;
}

/** Cross-functional reporting & GMP audit trail */
@path: '/odata/v4/admin'
@requires: ['Admin', 'QualityOfficer']
@impl: 'srv/admin-service.js'
service AdminService {
  @readonly entity AuditLog       as projection on db.AuditLog;
  @readonly entity StockMovements as projection on db.StockMovements;
  @readonly entity Batches        as projection on db.Batches;
}
