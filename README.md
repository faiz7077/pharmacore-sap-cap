# PharmaCore: SAP CAP pharmaceutical manufacturing & quality platform

A side-by-side extension for pharmaceutical manufacturing, built on the **SAP Cloud Application Programming Model (CAP)**.
It uses **CDS** domain models, **OData V4** services, **SAP Fiori Elements** apps in a **Fiori launchpad**, and an
**SAP S/4HANA API integration** (`API_PRODUCT_SRV`). It covers the GMP lifecycle of a tablet batch, from raw-material
purchase to the customer and back again when there's a recall.

**Live demo:** https://pharmacore-sap-cap.onrender.com (log in as `admin` / `admin`, or see the role users below)

> Demo instance on a free tier: the first load after idle can take about a minute, and the data resets to the seed set on every restart.

```
Purchase order ─► Goods receipt (101) ─► QUARANTINE ─► Inspection lot (01) ─► Usage decision ─► RELEASED
                                                                                        │
Production order ─► Release: BOM explosion + FEFO reservation of RELEASED batches ◄─────┘
      │
      └─► Confirm: consume (261) ─► FG batch in QUARANTINE (101) + genealogy ─► Inspection lot (04) ─► UD ─► RELEASED
                                                                                        │
Sales order ─► Delivery: FEFO pick, min. remaining shelf life, goods issue (601) ◄──────┘
                                                                                        │
Recall: forward-trace genealogy ─► block all downstream batches ─► list customers to notify
```

## SAP concepts implemented

| SAP area | What PharmaCore does | Where |
|---|---|---|
| **MM** material master, vendor master | Materials (ROH / VERP / FERT), GMP approved-vendor check on PO | `db/schema.cds`, `srv/procurement-service.js` |
| **MM** inventory, movement types | Every stock change is a material document: 101, 261, 321, 350, 601 | `StockMovements`, `srv/lib/common.js` |
| **Batch management** | Batch numbers, mfg/expiry from shelf life, stock types (quarantine / unrestricted / reserved / blocked) | `Batches` |
| **PP-PI** | BOM explosion, production order release with **FEFO** reservation, confirmation with yield | `srv/manufacturing-service.js` |
| **QM** | Inspection lots (origin 01 GR, 04 production), inspection plan per material type, results recording with spec limits, **usage decision** | `srv/quality-service.js` |
| **Batch where-used / traceability** | Backward and forward genealogy, recall with customer impact | `trace()`, `initiateRecall` |
| **SD** | Sales order, delivery with FEFO picking and customer minimum-remaining-shelf-life check | `srv/sales-service.js` |
| **Number ranges (SNRO)** | Document numbering for PO, PRD, batch, lot, SO, DLV, RCL | `NumberRanges` |
| **S/4HANA integration** | Remote OData V2 service `API_PRODUCT_SRV`, mocked locally, real SAP sandbox with the `sandbox` profile | `srv/external/` |
| **Fiori** | 12 Fiori Elements apps (List Report / Object Page) in a launchpad with live KPI tiles | `app/` |

## GMP / compliance rules enforced in code

- Material in **quarantine can't be reserved, consumed or shipped**. Only QC-released batches can.
- A lot **can't be accepted when a result is out of specification**. It has to be rejected.
- A **reason is mandatory** on usage decisions and recalls (electronic-signature style).
- **Segregation of duties**: whoever confirmed production can't release that batch.
- Purchase orders only go to **GMP-qualified suppliers**.
- Customers only get batches that still have the **minimum remaining shelf life** they require.
- A **GMP audit trail** records who did what, when and why for every critical step (`AuditLog`).
- **Role-based access**: one OData service per business role (`@requires`).

| User / password | Role | Can use |
|---|---|---|
| `amit` / `amit` | WarehouseManager | Procurement, Sales |
| `raj` / `raj` | ProductionManager | Manufacturing |
| `priya` / `priya` | QualityOfficer | Quality, Audit trail |
| `admin` / `admin` | Admin | everything |

## Run it

```bash
npm install
npm run watch          # http://localhost:4004  →  open /index.html (Fiori launchpad)
npm test               # 13 end-to-end lifecycle tests
```

To call the **real SAP S/4HANA sandbox** instead of the local mock, get a free API key at
[api.sap.com](https://api.sap.com/api/API_PRODUCT_SRV), then run:

```bash
SAP_API_KEY=<your key> npm run sandbox
```

### 5-minute demo script
1. Log in as **amit**. Open *Purchase Orders* → PO-000099 → **Post Goods Receipt**. The batch goes to quarantine and an inspection lot opens.
2. Log in as **priya**. Open *Inspection Lots* → the lot → **Edit**, enter results (try Assay = 96 to see the out-of-spec block) → Save → **Usage Decision**.
3. Log in as **raj**. Create a production order for *Paracetamol 500 mg Tablets*, qty 100000 → **Release** (FEFO reservations show up, near-expiry MCC is used first) → **Confirm**.
4. Log in as **priya**. Release the finished batch. Then open *Genealogy Explorer* and pick the tablet batch.
5. Log in as **amit**. Create a sales order → **Create Delivery (FEFO)**.
6. Log in as **priya**. Open *Batch Traceability* → a raw-material batch → **Initiate Recall**. Every downstream batch is blocked and the customers are listed.
7. Log in as **admin** and open the *Audit Trail*.

## Project layout

```
db/schema.cds              domain model (CDS)
db/data/*.csv              code lists, number ranges, seed master data & stock
srv/services.cds           5 role-based OData V4 services + actions
srv/*-service.js           business logic (CAP event handlers)
srv/external/              S/4HANA API_PRODUCT_SRV model + mock data
app/annotations.cds        Fiori Elements UI annotations
app/<app>/webapp           12 Fiori Elements apps
app/index.html             Fiori launchpad (sandbox) with live KPI tiles
app/genealogy/             batch genealogy explorer
test/lifecycle.test.js     end-to-end GMP lifecycle tests
```

## Roadmap
- Deploy to **SAP BTP Cloud Foundry** with SAP HANA Cloud and XSUAA (`cds add hana,xsuaa,mta`)
- Publish batch-released / recall events to **SAP Event Mesh**
- Outbound goods movements to S/4HANA (`API_MATERIAL_DOCUMENT_SRV`)
- An ABAP RAP version of the inspection-lot app on the BTP ABAP environment (trial)
