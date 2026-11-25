using { pharmacore as db } from '../db/schema';
using from '../srv/services';

// ============================================================ labels & texts
annotate db.Materials with {
  ID @UI.Hidden @Common.Text: name @Common.TextArrangement: #TextOnly;
  materialNo @title: 'Material'; name @title: 'Description'; type @title: 'Material Type' @Common.Text: type.name @Common.TextArrangement: #TextFirst;
  baseUnit @title: 'Base Unit'; shelfLifeMonths @title: 'Shelf Life (months)'; minRemainingShelfLifeDays @title: 'Min. Remaining Shelf Life (days)';
  storageCondition @title: 'Storage Condition'; standardPrice @title: 'Standard Price (INR)'; s4Product @title: 'S/4HANA Product';
}
annotate db.Suppliers with {
  ID @UI.Hidden @Common.Text: name @Common.TextArrangement: #TextOnly;
  supplierNo @title: 'Supplier'; name @title: 'Name'; city @title: 'City'; country @title: 'Country'; gstin @title: 'GSTIN';
  gmpApproved @title: 'GMP Approved'; qualifiedOn @title: 'Qualified On';
}
annotate db.Customers with {
  ID @UI.Hidden @Common.Text: name @Common.TextArrangement: #TextOnly;
  customerNo @title: 'Customer'; name @title: 'Name'; city @title: 'City'; drugLicenseNo @title: 'Drug License No.';
}
annotate db.Batches with {
  ID @UI.Hidden @Common.Text: batchNo @Common.TextArrangement: #TextOnly;
  batchNo @title: 'Batch'; material @title: 'Material' @Common.Text: material.name @Common.TextArrangement: #TextOnly;
  mfgDate @title: 'Mfg. Date'; expiryDate @title: 'Expiry Date'; quantity @title: 'Quantity'; availableQty @title: 'Unrestricted';
  reservedQty @title: 'Reserved'; status @title: 'Status' @Common.Text: status.name @Common.TextArrangement: #TextOnly;
  origin @title: 'Origin'; supplier @title: 'Supplier' @Common.Text: supplier.name @Common.TextArrangement: #TextOnly;
  daysToExpiry @title: 'Days to Expiry' @Core.Computed; expiryCriticality @UI.Hidden @Core.Computed;
  purchaseOrder @title: 'Purchase Order' @Common.Text: purchaseOrder.poNumber @Common.TextArrangement: #TextOnly;
  productionOrder @title: 'Production Order' @Common.Text: productionOrder.orderNo @Common.TextArrangement: #TextOnly;
}
annotate db.StockMovements with {
  ID @UI.Hidden; movementType @title: 'Movement Type' @Common.Text: movementType.name @Common.TextArrangement: #TextFirst;
  batch @title: 'Batch' @Common.Text: batch.batchNo @Common.TextArrangement: #TextOnly;
  material @title: 'Material' @Common.Text: material.name @Common.TextArrangement: #TextOnly;
  quantity @title: 'Quantity'; reference @title: 'Reference'; createdAt @title: 'Posted At'; createdBy @title: 'Posted By';
}
annotate db.BatchGenealogy with {
  ID @UI.Hidden; quantity @title: 'Quantity';
  parentBatch @title: 'Input Batch' @Common.Text: parentBatch.batchNo @Common.TextArrangement: #TextOnly;
  childBatch @title: 'Output Batch' @Common.Text: childBatch.batchNo @Common.TextArrangement: #TextOnly;
  productionOrder @title: 'Production Order' @Common.Text: productionOrder.orderNo @Common.TextArrangement: #TextOnly;
}
annotate db.PurchaseOrders with {
  ID @UI.Hidden; poNumber @title: 'Purchase Order'; orderDate @title: 'Order Date';
  supplier @title: 'Supplier' @Common.Text: supplier.name @Common.TextArrangement: #TextOnly;
  status @title: 'Status' @Common.Text: status.name @Common.TextArrangement: #TextOnly;
}
annotate db.PurchaseOrderItems with {
  ID @UI.Hidden; material @title: 'Material' @Common.Text: material.name @Common.TextArrangement: #TextOnly;
  quantity @title: 'Quantity'; receivedQty @title: 'Received'; price @title: 'Unit Price';
}
annotate db.BOMs with {
  ID @UI.Hidden; product @title: 'Product' @Common.Text: product.name @Common.TextArrangement: #TextOnly;
  baseQuantity @title: 'Base Quantity'; description @title: 'Description';
}
annotate db.BOMItems with {
  ID @UI.Hidden; component @title: 'Component' @Common.Text: component.name @Common.TextArrangement: #TextOnly; quantity @title: 'Quantity per Base';
}
annotate db.ProductionOrders with {
  ID @UI.Hidden; orderNo @title: 'Order'; plannedQty @title: 'Planned Quantity'; plannedStart @title: 'Planned Start';
  product @title: 'Product' @Common.Text: product.name @Common.TextArrangement: #TextOnly;
  status @title: 'Status' @Common.Text: status.name @Common.TextArrangement: #TextOnly;
  outputBatch @title: 'Output Batch' @Common.Text: outputBatch.batchNo @Common.TextArrangement: #TextOnly; confirmedBy @title: 'Confirmed By';
}
annotate db.Reservations with {
  ID @UI.Hidden; material @title: 'Component' @Common.Text: material.name @Common.TextArrangement: #TextOnly;
  batch @title: 'Batch' @Common.Text: batch.batchNo @Common.TextArrangement: #TextOnly; quantity @title: 'Reserved Qty'; consumed @title: 'Consumed';
}
annotate db.InspectionLots with {
  ID @UI.Hidden; lotNo @title: 'Inspection Lot'; origin @title: 'Origin (01 GR / 04 Prod)';
  batch @title: 'Batch' @Common.Text: batch.batchNo @Common.TextArrangement: #TextOnly;
  status @title: 'Status' @Common.Text: status.name @Common.TextArrangement: #TextOnly;
  usageDecisionBy @title: 'Decided By'; usageDecisionAt @title: 'Decided At'; usageDecisionReason @title: 'Reason';
}
annotate db.InspectionResults with {
  ID @UI.Hidden; characteristic @title: 'Characteristic'; unit @title: 'Unit'; lowerLimit @title: 'Lower Limit'; upperLimit @title: 'Upper Limit';
  value @title: 'Measured Value'; result @title: 'Result'; resultCriticality @UI.Hidden @Core.Computed;
}
annotate db.Recalls with {
  ID @UI.Hidden; recallNo @title: 'Recall'; reason @title: 'Reason'; affectedBatches @title: 'Blocked Batches'; affectedCustomers @title: 'Customers to Notify';
  batch @title: 'Origin Batch' @Common.Text: batch.batchNo @Common.TextArrangement: #TextOnly; createdAt @title: 'Initiated At'; createdBy @title: 'Initiated By';
}
annotate db.SalesOrders with {
  ID @UI.Hidden; soNumber @title: 'Sales Order'; orderDate @title: 'Order Date';
  customer @title: 'Customer' @Common.Text: customer.name @Common.TextArrangement: #TextOnly;
  status @title: 'Status' @Common.Text: status.name @Common.TextArrangement: #TextOnly;
}
annotate db.SalesOrderItems with {
  ID @UI.Hidden; material @title: 'Material' @Common.Text: material.name @Common.TextArrangement: #TextOnly; quantity @title: 'Quantity'; deliveredQty @title: 'Delivered';
}
annotate db.Deliveries with { ID @UI.Hidden; deliveryNo @title: 'Delivery'; customer @title: 'Customer' @Common.Text: customer.name @Common.TextArrangement: #TextOnly; createdAt @title: 'Goods Issue At'; }
annotate db.DeliveryItems with {
  ID @UI.Hidden; material @title: 'Material' @Common.Text: material.name @Common.TextArrangement: #TextOnly;
  batch @title: 'Batch' @Common.Text: batch.batchNo @Common.TextArrangement: #TextOnly; quantity @title: 'Quantity';
}
annotate db.AuditLog with { ID @UI.Hidden; timestamp @title: 'Timestamp'; user @title: 'User'; entity @title: 'Object'; entityKey @title: 'Key'; action @title: 'Action'; reason @title: 'Reason'; details @title: 'Details'; }

// fixed-value dropdowns for code lists
annotate db.Materials with { type @Common.ValueListWithFixedValues; }

// ===================================================================== UI
annotate db.Materials with @UI: {
  HeaderInfo: { TypeName: 'Material', TypeNamePlural: 'Materials', Title: { Value: name }, Description: { Value: materialNo } },
  SelectionFields: [ materialNo, type_code ],
  LineItem: [ { Value: materialNo }, { Value: name }, { Value: type_code }, { Value: baseUnit }, { Value: shelfLifeMonths }, { Value: standardPrice }, { Value: s4Product } ],
  Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'General', Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', Label: 'Batches', Target: 'batches/@UI.LineItem' }
  ],
  FieldGroup#General: { Data: [ { Value: materialNo }, { Value: name }, { Value: type_code }, { Value: baseUnit }, { Value: shelfLifeMonths },
    { Value: minRemainingShelfLifeDays }, { Value: storageCondition }, { Value: standardPrice }, { Value: s4Product } ] }
};

annotate db.Suppliers with @UI: {
  HeaderInfo: { TypeName: 'Supplier', TypeNamePlural: 'Suppliers', Title: { Value: name }, Description: { Value: supplierNo } },
  SelectionFields: [ gmpApproved, city ],
  LineItem: [ { Value: supplierNo }, { Value: name }, { Value: city }, { Value: gstin }, { Value: gmpApproved }, { Value: qualifiedOn } ],
  Facets: [ { $Type: 'UI.ReferenceFacet', Label: 'General', Target: '@UI.FieldGroup#General' } ],
  FieldGroup#General: { Data: [ { Value: supplierNo }, { Value: name }, { Value: city }, { Value: country }, { Value: gstin }, { Value: gmpApproved }, { Value: qualifiedOn } ] }
};

annotate db.Customers with @UI: {
  HeaderInfo: { TypeName: 'Customer', TypeNamePlural: 'Customers', Title: { Value: name }, Description: { Value: customerNo } },
  LineItem: [ { Value: customerNo }, { Value: name }, { Value: city }, { Value: drugLicenseNo } ],
  Facets: [ { $Type: 'UI.ReferenceFacet', Label: 'General', Target: '@UI.FieldGroup#General' } ],
  FieldGroup#General: { Data: [ { Value: customerNo }, { Value: name }, { Value: city }, { Value: drugLicenseNo } ] }
};

annotate db.Batches with @UI: {
  HeaderInfo: { TypeName: 'Batch', TypeNamePlural: 'Batches', Title: { Value: batchNo }, Description: { Value: material.name } },
  SelectionFields: [ batchNo, material_ID, status_code, expiryDate ],
  LineItem: [
    { Value: batchNo }, { Value: material_ID }, { Value: status_code, Criticality: status.criticality },
    { Value: quantity }, { Value: availableQty }, { Value: reservedQty }, { Value: mfgDate },
    { Value: expiryDate }, { Value: daysToExpiry, Criticality: expiryCriticality }, { Value: origin },
    { $Type: 'UI.DataFieldForAction', Action: 'QualityService.initiateRecall', Label: 'Initiate Recall' }
  ],
  HeaderFacets: [ { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Status' } ],
  FieldGroup#Status: { Data: [ { Value: status_code, Criticality: status.criticality }, { Value: daysToExpiry, Criticality: expiryCriticality } ] },
  Identification: [ { $Type: 'UI.DataFieldForAction', Action: 'QualityService.initiateRecall', Label: 'Initiate Recall', Criticality: #Negative } ],
  Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Batch Data', Target: '@UI.FieldGroup#Data' },
    { $Type: 'UI.ReferenceFacet', Label: 'Made From (backward genealogy)', Target: 'madeFrom/@UI.LineItem#Parents' },
    { $Type: 'UI.ReferenceFacet', Label: 'Used In (forward genealogy)', Target: 'usedIn/@UI.LineItem#Children' },
    { $Type: 'UI.ReferenceFacet', Label: 'Inspection Lots', Target: 'inspectionLots/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', Label: 'Stock Movements', Target: 'movements/@UI.LineItem' }
  ],
  FieldGroup#Data: { Data: [ { Value: material_ID }, { Value: quantity }, { Value: availableQty }, { Value: reservedQty }, { Value: mfgDate },
    { Value: expiryDate }, { Value: origin }, { Value: supplier_ID }, { Value: purchaseOrder_ID }, { Value: productionOrder_ID } ] }
};

annotate db.BatchGenealogy with @UI: {
  LineItem#Parents:  [ { Value: parentBatch_ID }, { Value: parentBatch.material.name, Label: 'Material' }, { Value: quantity }, { Value: productionOrder_ID } ],
  LineItem#Children: [ { Value: childBatch_ID },  { Value: childBatch.material.name,  Label: 'Material' }, { Value: quantity }, { Value: productionOrder_ID } ]
};

annotate db.StockMovements with @UI: {
  HeaderInfo: { TypeName: 'Material Document', TypeNamePlural: 'Material Documents', Title: { Value: reference } },
  SelectionFields: [ movementType_code, material_ID ],
  LineItem: [ { Value: createdAt }, { Value: movementType_code }, { Value: batch_ID }, { Value: material_ID }, { Value: quantity }, { Value: reference }, { Value: createdBy } ]
};

annotate db.PurchaseOrders with @UI: {
  HeaderInfo: { TypeName: 'Purchase Order', TypeNamePlural: 'Purchase Orders', Title: { Value: poNumber }, Description: { Value: supplier.name } },
  SelectionFields: [ supplier_ID, status_code ],
  LineItem: [ { Value: poNumber }, { Value: supplier_ID }, { Value: orderDate }, { Value: status_code, Criticality: status.criticality } ],
  Identification: [ { $Type: 'UI.DataFieldForAction', Action: 'ProcurementService.postGoodsReceipt', Label: 'Post Goods Receipt' } ],
  HeaderFacets: [ { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Status' } ],
  FieldGroup#Status: { Data: [ { Value: status_code, Criticality: status.criticality } ] },
  Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Header', Target: '@UI.FieldGroup#Header' },
    { $Type: 'UI.ReferenceFacet', Label: 'Items', Target: 'items/@UI.LineItem' }
  ],
  FieldGroup#Header: { Data: [ { Value: supplier_ID }, { Value: orderDate } ] }
};
annotate db.PurchaseOrderItems with @UI.LineItem: [ { Value: material_ID }, { Value: quantity }, { Value: price }, { Value: receivedQty } ];

annotate db.BOMs with @UI: {
  HeaderInfo: { TypeName: 'Bill of Materials', TypeNamePlural: 'Bills of Materials', Title: { Value: product.name }, Description: { Value: description } },
  LineItem: [ { Value: product_ID }, { Value: description }, { Value: baseQuantity } ],
  Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Header', Target: '@UI.FieldGroup#Header' },
    { $Type: 'UI.ReferenceFacet', Label: 'Components', Target: 'items/@UI.LineItem' }
  ],
  FieldGroup#Header: { Data: [ { Value: product_ID }, { Value: description }, { Value: baseQuantity } ] }
};
annotate db.BOMItems with @UI.LineItem: [ { Value: component_ID }, { Value: quantity } ];

annotate db.ProductionOrders with @UI: {
  HeaderInfo: { TypeName: 'Production Order', TypeNamePlural: 'Production Orders', Title: { Value: orderNo }, Description: { Value: product.name } },
  SelectionFields: [ product_ID, status_code ],
  LineItem: [ { Value: orderNo }, { Value: product_ID }, { Value: plannedQty }, { Value: plannedStart },
    { Value: status_code, Criticality: status.criticality }, { Value: outputBatch_ID } ],
  Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'ManufacturingService.release', Label: 'Release (reserve FEFO)' },
    { $Type: 'UI.DataFieldForAction', Action: 'ManufacturingService.confirm', Label: 'Confirm Production' }
  ],
  HeaderFacets: [ { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Status' } ],
  FieldGroup#Status: { Data: [ { Value: status_code, Criticality: status.criticality }, { Value: outputBatch_ID } ] },
  Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Order', Target: '@UI.FieldGroup#Header' },
    { $Type: 'UI.ReferenceFacet', Label: 'Batch Reservations', Target: 'reservations/@UI.LineItem' }
  ],
  FieldGroup#Header: { Data: [ { Value: product_ID }, { Value: plannedQty }, { Value: plannedStart }, { Value: confirmedBy } ] }
};
annotate db.Reservations with @UI.LineItem: [ { Value: material_ID }, { Value: batch_ID }, { Value: batch.expiryDate, Label: 'Batch Expiry' }, { Value: quantity }, { Value: consumed } ];

annotate db.InspectionLots with @UI: {
  HeaderInfo: { TypeName: 'Inspection Lot', TypeNamePlural: 'Inspection Lots', Title: { Value: lotNo }, Description: { Value: batch.material.name } },
  SelectionFields: [ status_code, origin ],
  LineItem: [ { Value: lotNo }, { Value: batch_ID }, { Value: batch.material.name, Label: 'Material' }, { Value: origin },
    { Value: status_code, Criticality: status.criticality }, { Value: usageDecisionBy }, { Value: createdAt, Label: 'Created At' } ],
  Identification: [ { $Type: 'UI.DataFieldForAction', Action: 'QualityService.usageDecision', Label: 'Usage Decision' } ],
  HeaderFacets: [ { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Status' } ],
  FieldGroup#Status: { Data: [ { Value: status_code, Criticality: status.criticality }, { Value: batch_ID } ] },
  Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Results Recording', Target: 'results/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', Label: 'Usage Decision', Target: '@UI.FieldGroup#UD' }
  ],
  FieldGroup#UD: { Data: [ { Value: usageDecisionBy }, { Value: usageDecisionAt }, { Value: usageDecisionReason } ] }
};
annotate db.InspectionResults with @UI.LineItem: [ { Value: characteristic }, { Value: lowerLimit }, { Value: upperLimit }, { Value: unit },
  { Value: value }, { Value: result, Criticality: resultCriticality } ];

annotate db.Recalls with @UI: {
  HeaderInfo: { TypeName: 'Recall', TypeNamePlural: 'Recalls', Title: { Value: recallNo }, Description: { Value: reason } },
  LineItem: [ { Value: recallNo }, { Value: batch_ID }, { Value: reason }, { Value: affectedBatches }, { Value: affectedCustomers }, { Value: createdAt }, { Value: createdBy } ],
  Facets: [ { $Type: 'UI.ReferenceFacet', Label: 'Recall', Target: '@UI.FieldGroup#R' } ],
  FieldGroup#R: { Data: [ { Value: batch_ID }, { Value: reason }, { Value: affectedBatches }, { Value: affectedCustomers }, { Value: createdAt }, { Value: createdBy } ] }
};

annotate db.SalesOrders with @UI: {
  HeaderInfo: { TypeName: 'Sales Order', TypeNamePlural: 'Sales Orders', Title: { Value: soNumber }, Description: { Value: customer.name } },
  SelectionFields: [ customer_ID, status_code ],
  LineItem: [ { Value: soNumber }, { Value: customer_ID }, { Value: orderDate }, { Value: status_code, Criticality: status.criticality } ],
  Identification: [ { $Type: 'UI.DataFieldForAction', Action: 'SalesService.createDelivery', Label: 'Create Delivery (FEFO)' } ],
  HeaderFacets: [ { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Status' } ],
  FieldGroup#Status: { Data: [ { Value: status_code, Criticality: status.criticality } ] },
  Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Header', Target: '@UI.FieldGroup#Header' },
    { $Type: 'UI.ReferenceFacet', Label: 'Items', Target: 'items/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', Label: 'Deliveries', Target: 'deliveries/@UI.LineItem' }
  ],
  FieldGroup#Header: { Data: [ { Value: customer_ID }, { Value: orderDate } ] }
};
annotate db.SalesOrderItems with @UI.LineItem: [ { Value: material_ID }, { Value: quantity }, { Value: deliveredQty } ];
annotate db.Deliveries with @UI: {
  HeaderInfo: { TypeName: 'Delivery', TypeNamePlural: 'Deliveries', Title: { Value: deliveryNo } },
  LineItem: [ { Value: deliveryNo }, { Value: customer_ID }, { Value: createdAt } ],
  Facets: [ { $Type: 'UI.ReferenceFacet', Label: 'Items', Target: 'items/@UI.LineItem' } ]
};
annotate db.DeliveryItems with @UI.LineItem: [ { Value: material_ID }, { Value: batch_ID }, { Value: quantity } ];

annotate db.AuditLog with @UI: {
  HeaderInfo: { TypeName: 'Audit Entry', TypeNamePlural: 'Audit Trail', Title: { Value: action }, Description: { Value: entityKey } },
  SelectionFields: [ entity, action, user ],
  PresentationVariant: { SortOrder: [ { Property: timestamp, Descending: true } ], Visualizations: [ '@UI.LineItem' ] },
  LineItem: [ { Value: timestamp }, { Value: user }, { Value: entity }, { Value: entityKey }, { Value: action }, { Value: reason }, { Value: details } ],
  Facets: [ { $Type: 'UI.ReferenceFacet', Label: 'Entry', Target: '@UI.FieldGroup#E' } ],
  FieldGroup#E: { Data: [ { Value: timestamp }, { Value: user }, { Value: entity }, { Value: entityKey }, { Value: action }, { Value: reason }, { Value: details } ] }
};

// ===================================== action enablement (buttons grey out)
annotate ProcurementService.PurchaseOrders actions {
  postGoodsReceipt @Core.OperationAvailable: { $edmJson: { $Ne: [ { $Path: 'in/status_code' }, 'RECV' ] } };
}
annotate ManufacturingService.ProductionOrders actions {
  release @Core.OperationAvailable: { $edmJson: { $Eq: [ { $Path: 'in/status_code' }, 'CRTD' ] } };
  confirm @Core.OperationAvailable: { $edmJson: { $Eq: [ { $Path: 'in/status_code' }, 'REL' ] } }
          (yieldQty @title: 'Actual Yield (leave empty = planned)');
}
annotate QualityService.InspectionLots actions {
  usageDecision @Core.OperationAvailable: { $edmJson: { $And: [
    { $Ne: [ { $Path: 'in/status_code' }, 'ACC' ] }, { $Ne: [ { $Path: 'in/status_code' }, 'REJ' ] }, { $Path: 'in/IsActiveEntity' } ] } };
}
annotate SalesService.SalesOrders actions {
  createDelivery @Core.OperationAvailable: { $edmJson: { $Eq: [ { $Path: 'in/status_code' }, 'OPEN' ] } };
}
