# Design Plan: Reports & Financial Analytics Tab Improvements

## 1. Context & Scope
- **Audited Surface**: `/admin/reports` — `ReportsComponent` (`src/app/features/admin/reports/reports.component.ts`)
- **Design Sources**: `docs/DESIGN_SYSTEM.md`, `src/styles/_tokens.scss`
- **Objective**: De-slop interface copy, eliminate generic Tailwind/Bootstrap color overrides, resolve brand relic in CSV export, and organize the 12-card metric wall into structured, readable summary bands.

---

## 2. Identified Findings

### Finding 1: Design Token Drift and Palette Discrepancies
- **Problem**: `reports.component.ts` uses generic hex color overrides (`#e5e7eb`, `#1f2937`, `#6b7280`, `#4b5563`, `#10b981`, `#f0fdf4`, `#d97706`, `#fffbeb`, `#ef4444`, `#fef2f2`, `#059669`, `#dc2626`) and inline styling rather than consuming the authoritative design tokens.
- **Correction**: Replace all ad-hoc hex values with standard design tokens (`var(--color-surface)`, `var(--color-border)`, `var(--color-text-primary)`, `var(--color-text-muted)`, `var(--color-success)`, `var(--color-crimson)`, `var(--color-gold-subtle)`).

### Finding 2: Unsegmented 12-Card Flat Metric Wall
- **Problem**: 12 metric cards are rendered in an unsegmented 5-column grid without category hierarchy, forcing managers to hunt across disparate numbers (Gross Sales, Discounts, Net Sales, Collections, Refunds, Net Collections, Receivables, COGS, Profit, Margin, Wastage, Tax).
- **Correction**: Segment cards into 3 distinct functional bands:
  1. **Sales & Collections Performance** (Gross Sales, Promotional Discounts, Net Sales, Collected Revenue, Completed Refunds, Net Collections, Outstanding Receivables)
  2. **Food Cost & Profitability (COGS)** (Recipe COGS, Gross Profit, Gross Margin %)
  3. **Compliance & Wastage** (Total GST Collected, Inventory Wastage)

### Finding 3: Brand Relic in CSV Export & Section Heading Redundancy
- **Problem**: Line 1797 exports the report with filename `TheRoyalSpice_Sales_Report_...` (legacy brand relic) instead of `GuruKripa_Dhaba_Sales_Report_...`, and section title uses robotic AI jargon (`Auditable Inventory Wastage Analysis`).
- **Correction**: Update export filename to `GuruKripa_Dhaba_Sales_Report_${timestamp}.csv` and streamline title to `Inventory Wastage Analysis`.

---

## 3. Implementation Steps
1. In `src/app/features/admin/reports/reports.component.ts`:
   - Group the KPI section in the template into 3 structured sub-grids with clean section labels.
   - Replace generic `#e5e7eb` / `#1f2937` / `#10b981` / `#ef4444` in `.reports-page` styles with official design tokens.
   - Update `exportReport()` to use `GuruKripa_Dhaba_Sales_Report_${new Date().toISOString().slice(0, 10)}.csv`.
   - Simplify heading from `"Auditable Inventory Wastage Analysis"` to `"Inventory Wastage Analysis"`.
2. Run `npm run build` and `npm test -- --watch=false` to verify zero regression across financial calculation tests.
