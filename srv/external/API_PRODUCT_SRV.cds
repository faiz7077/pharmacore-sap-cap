/**
 * Subset of the SAP S/4HANA Cloud "Product Master" API (API_PRODUCT_SRV, OData V2).
 * Full EDMX: https://api.sap.com/api/API_PRODUCT_SRV — import with `cds import API_PRODUCT_SRV.edmx`.
 * Locally the service is mocked by CAP (data in srv/external/data); with the [sandbox]
 * profile it calls the real SAP Business Accelerator Hub sandbox.
 */
@cds.external
service API_PRODUCT_SRV {
  entity A_Product {
    key Product         : String(40);
        ProductType     : String(4);
        BaseUnit        : String(3);
        ProductGroup    : String(9);
        CreationDate    : Date;
  }
  entity A_ProductDescription {
    key Product            : String(40);
    key Language           : String(2);
        ProductDescription : String(40);
  }
}
