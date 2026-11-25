/**
 * PharmaCore – domain model.
 * Concepts mirror SAP S/4HANA: material master (MM), batch management,
 * movement types, production orders (PP-PI), inspection lots & usage
 * decisions (QM), sales orders & deliveries (SD).
 */
namespace pharmacore;

using { cuid, managed, sap.common.CodeList } from '@sap/cds/common';

type Qty    : Decimal(15, 3);
type Amount : Decimal(15, 2);

// ---------------------------------------------------------------- code lists
entity MaterialTypes      : CodeList { key code : String(4);  }   // ROH raw, VERP packaging, FERT finished
entity BatchStatus        : CodeList { key code : String(1); criticality : Integer; }
entity POStatus           : CodeList { key code : String(4); criticality : Integer; }
entity ProdOrderStatus    : CodeList { key code : String(4); criticality : Integer; }
entity LotStatus          : CodeList { key code : String(4); criticality : Integer; }
entity SOStatus           : CodeList { key code : String(4); criticality : Integer; }
entity MovementTypes      : CodeList { key code : String(3);  }   // SAP movement types 101, 261, 321, 350, 601 ...

// ------------------------------------------------------------ number ranges
/** Like SAP number range objects (SNRO): gap-tolerant document numbering. */
entity NumberRanges {
  key object  : String(10);
      prefix  : String(6);
      current : Integer default 0;
}

// --------------------------------------------------------------- master data
@cds.autoexpose @cds.odata.valuelist
entity Materials : cuid, managed {
  materialNo                : String(18) @mandatory;
  name                      : String(80) @mandatory;
  type                      : Association to MaterialTypes;
  baseUnit                  : String(3) default 'KG';
  shelfLifeMonths           : Integer default 24;
  minRemainingShelfLifeDays : Integer default 0;   // customer-facing shelf-life requirement
  storageCondition          : String(60);
  standardPrice             : Amount;
  s4Product                 : String(40);          // link to S/4HANA product master
  batches                   : Association to many Batches on batches.material = $self;
}

@cds.autoexpose @cds.odata.valuelist
entity Suppliers : cuid, managed {
  supplierNo  : String(10) @mandatory;
  name        : String(80) @mandatory;
  city        : String(40);
  country     : String(3) default 'IN';
  gstin       : String(15);
  gmpApproved : Boolean default false;   // approved vendor list – only GMP-qualified suppliers may be ordered from
  qualifiedOn : Date;
}

@cds.autoexpose @cds.odata.valuelist
entity Customers : cuid, managed {
  customerNo    : String(10) @mandatory;
  name          : String(80) @mandatory;
  city          : String(40);
  drugLicenseNo : String(30);
}

// ---------------------------------------------------------------- procurement
entity PurchaseOrders : cuid, managed {
  poNumber  : String(12) @readonly;
  supplier  : Association to Suppliers @mandatory;
  orderDate : Date default $now;
  status    : Association to POStatus default 'CRTD' @readonly;
  items     : Composition of many PurchaseOrderItems on items.up_ = $self;
}

entity PurchaseOrderItems : cuid {
  up_         : Association to PurchaseOrders;
  material    : Association to Materials @mandatory;
  quantity    : Qty @mandatory;
  receivedQty : Qty default 0 @readonly;
  price       : Amount;
}

// --------------------------------------------------------------- inventory
@cds.autoexpose @cds.odata.valuelist
entity Batches : cuid, managed {
  batchNo         : String(14) @readonly;
  material        : Association to Materials @readonly;
  mfgDate         : Date @readonly;
  expiryDate      : Date @readonly;
  quantity        : Qty @readonly;     // physical stock
  availableQty    : Qty @readonly;     // unrestricted, not reserved
  reservedQty     : Qty default 0 @readonly;
  status          : Association to BatchStatus default 'Q' @readonly;
  origin          : String(4) @readonly;   // GR = goods receipt, PROD = production
  supplier        : Association to Suppliers @readonly;
  purchaseOrder   : Association to PurchaseOrders @readonly;
  productionOrder : Association to ProductionOrders @readonly;
  virtual daysToExpiry      : Integer;
  virtual expiryCriticality : Integer;
  madeFrom        : Association to many BatchGenealogy on madeFrom.childBatch = $self;
  usedIn          : Association to many BatchGenealogy on usedIn.parentBatch = $self;
  movements       : Association to many StockMovements on movements.batch = $self;
  inspectionLots  : Association to many InspectionLots on inspectionLots.batch = $self;
}

/** Every stock change is a document with an SAP movement type. */
entity StockMovements : cuid, managed {
  movementType : Association to MovementTypes;
  batch        : Association to Batches;
  material     : Association to Materials;
  quantity     : Qty;
  reference    : String(40);
}

// ------------------------------------------------------------- manufacturing
entity BOMs : cuid, managed {
  product      : Association to Materials @mandatory;
  baseQuantity : Qty default 1000 @mandatory;
  description  : String(80);
  items        : Composition of many BOMItems on items.up_ = $self;
}

entity BOMItems : cuid {
  up_       : Association to BOMs;
  component : Association to Materials @mandatory;
  quantity  : Qty @mandatory;           // per BOM base quantity
}

entity ProductionOrders : cuid, managed {
  orderNo      : String(12) @readonly;
  product      : Association to Materials @mandatory;
  plannedQty   : Qty @mandatory;
  plannedStart : Date default $now;
  status       : Association to ProdOrderStatus default 'CRTD' @readonly;
  outputBatch  : Association to Batches @readonly;
  confirmedBy  : String(255) @readonly;
  reservations : Composition of many Reservations on reservations.up_ = $self;
}

/** Component batch reserved for a production order (FEFO). */
entity Reservations : cuid {
  up_      : Association to ProductionOrders;
  material : Association to Materials @readonly;
  batch    : Association to Batches @readonly;
  quantity : Qty @readonly;
  consumed : Boolean default false @readonly;
}

/** Batch where-used / where-from links: the basis for traceability & recall. */
entity BatchGenealogy : cuid {
  parentBatch     : Association to Batches;   // input (e.g. API raw material)
  childBatch      : Association to Batches;   // output (e.g. tablet batch)
  quantity        : Qty;
  productionOrder : Association to ProductionOrders;
}

// ----------------------------------------------------------------- quality
entity InspectionLots : cuid, managed {
  lotNo               : String(12) @readonly;
  batch               : Association to Batches @readonly;
  origin              : String(2) @readonly;   // 01 = goods receipt, 04 = production
  status              : Association to LotStatus default 'OPEN' @readonly;
  usageDecisionBy     : String(255) @readonly;
  usageDecisionAt     : Timestamp @readonly;
  usageDecisionReason : String(255) @readonly;
  results             : Composition of many InspectionResults on results.up_ = $self;
}

entity InspectionResults : cuid {
  up_            : Association to InspectionLots;
  characteristic : String(40) @readonly;
  unit           : String(10) @readonly;
  lowerLimit     : Decimal(10, 3) @readonly;
  upperLimit     : Decimal(10, 3) @readonly;
  value          : Decimal(10, 3);
  result         : String(4) @readonly;   // PASS / FAIL
  virtual resultCriticality : Integer;
}

entity Recalls : cuid, managed {
  recallNo          : String(12) @readonly;
  batch             : Association to Batches @readonly;
  reason            : String(255) @readonly;
  affectedBatches   : String(1000) @readonly;
  affectedCustomers : String(1000) @readonly;
}

// ------------------------------------------------------------------- sales
entity SalesOrders : cuid, managed {
  soNumber  : String(12) @readonly;
  customer  : Association to Customers @mandatory;
  orderDate : Date default $now;
  status    : Association to SOStatus default 'OPEN' @readonly;
  items     : Composition of many SalesOrderItems on items.up_ = $self;
  deliveries: Association to many Deliveries on deliveries.salesOrder = $self;
}

entity SalesOrderItems : cuid {
  up_          : Association to SalesOrders;
  material     : Association to Materials @mandatory;
  quantity     : Qty @mandatory;
  deliveredQty : Qty default 0 @readonly;
}

entity Deliveries : cuid, managed {
  deliveryNo : String(12) @readonly;
  salesOrder : Association to SalesOrders;
  customer   : Association to Customers;
  items      : Composition of many DeliveryItems on items.up_ = $self;
}

entity DeliveryItems : cuid {
  up_      : Association to Deliveries;
  material : Association to Materials;
  batch    : Association to Batches;
  quantity : Qty;
}

// ------------------------------------------------------------------- audit
/** GMP / 21 CFR Part 11 style audit trail: who did what, when and why. */
entity AuditLog : cuid {
  timestamp : Timestamp;
  user      : String(255);
  entity    : String(60);
  entityKey : String(40);
  action    : String(40);
  reason    : String(255);
  details   : LargeString;
}
