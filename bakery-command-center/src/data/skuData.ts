// SKU / product performance data — ported from Streamlit's sku_data.py.
// ============================ DEMO DATA ============================
// Marked as such in the source too ("DEMO DATA" module docstring,
// _PRIOR_PERIOD comment "DEMO VALUES"). Division order drives cluster
// order in the bubble chart and accordion order in the SKU table, so the
// seasonal line stays last — matches sku_data.py's DIVISIONS order exactly.
//
// No per-SKU cost, margin, or wastage field exists in the source — only
// units sold and sales value. Nothing here should be extended with those
// unless real data actually supports it.

export const DIVISIONS = ['Baklava', 'French Bakery', 'Arabic Bread', 'Viennoiserie', 'Tahina', 'Seasonal Collection'] as const;
export type Division = (typeof DIVISIONS)[number];

export const SEASONAL_DIVISION: Division = 'Seasonal Collection';
// The seasonal line rotates — only these two values change when the collection is swapped (e.g. to a winter range).
export const SEASONAL_COLLECTION = 'Mango Summer Collection';
export const SEASONAL_AVAILABILITY = 'May – Sep 2024';

/** Previous period totals, used only to compute the KPI trend lines. DEMO VALUES — sku_data.py's own label. */
export const PRIOR_PERIOD = {
  totalSales: 2_620_000,
  totalUnits: 210_400,
  activeSkus: 104,
};

export interface RawProduct {
  sku: string;
  product: string;
  division: Division;
  units: number;
  salesAed: number;
}

// (sku, product, division, units sold, sales in AED) — full catalogue, 110 SKUs.
export const RAW_PRODUCTS: RawProduct[] = [
  // ------------------------- Baklava (22) -------------------------
  { sku: 'BKV-001', product: 'Pistachio Baklava Premium', division: 'Baklava', units: 6300, salesAed: 150000 },
  { sku: 'BKV-002', product: 'Walnut Baklava Standard', division: 'Baklava', units: 4700, salesAed: 104000 },
  { sku: 'BKV-003', product: 'Cashew Baklava', division: 'Baklava', units: 3900, salesAed: 78000 },
  { sku: 'BKV-004', product: 'Mixed Baklava Box', division: 'Baklava', units: 2100, salesAed: 62000 },
  { sku: 'BKV-005', product: 'Almond Baklava', division: 'Baklava', units: 2900, salesAed: 54000 },
  { sku: 'BKV-006', product: 'Chocolate Baklava', division: 'Baklava', units: 2700, salesAed: 48000 },
  { sku: 'BKV-007', product: 'Baklava Fingers', division: 'Baklava', units: 2600, salesAed: 40000 },
  { sku: 'BKV-008', product: 'Pistachio Burma', division: 'Baklava', units: 1700, salesAed: 34000 },
  { sku: 'BKV-009', product: 'Rose Baklava', division: 'Baklava', units: 1700, salesAed: 30000 },
  { sku: 'BKV-010', product: 'Baklava Bites', division: 'Baklava', units: 2200, salesAed: 26000 },
  { sku: 'BKV-011', product: 'Date Baklava', division: 'Baklava', units: 1400, salesAed: 22000 },
  { sku: 'BKV-012', product: 'Kunafa Baklava Roll', division: 'Baklava', units: 1150, salesAed: 20000 },
  { sku: 'BKV-013', product: 'Baklava Gift Tin', division: 'Baklava', units: 720, salesAed: 18000 },
  { sku: 'BKV-014', product: 'Hazelnut Baklava', division: 'Baklava', units: 900, salesAed: 16000 },
  { sku: 'BKV-015', product: 'Baklava Assorted 500g', division: 'Baklava', units: 620, salesAed: 14000 },
  { sku: 'BKV-016', product: 'Semolina Baklava', division: 'Baklava', units: 800, salesAed: 12000 },
  { sku: 'BKV-017', product: 'Honey Baklava Squares', division: 'Baklava', units: 750, salesAed: 11000 },
  { sku: 'BKV-018', product: 'Pistachio Baklava Mini', division: 'Baklava', units: 900, salesAed: 10000 },
  { sku: 'BKV-019', product: 'Walnut Baklava Tray', division: 'Baklava', units: 420, salesAed: 9000 },
  { sku: 'BKV-020', product: 'Baklava Sampler 6pc', division: 'Baklava', units: 560, salesAed: 8000 },
  { sku: 'BKV-021', product: 'Saffron Baklava', division: 'Baklava', units: 380, salesAed: 7000 },
  { sku: 'BKV-022', product: 'Baklava Seasonal Tin', division: 'Baklava', units: 300, salesAed: 7000 },

  // ---------------------- French Bakery (26) ----------------------
  { sku: 'FRB-001', product: 'Butter Croissant', division: 'French Bakery', units: 6200, salesAed: 82000 },
  { sku: 'FRB-002', product: 'Classic Baguette', division: 'French Bakery', units: 6300, salesAed: 56000 },
  { sku: 'FRB-003', product: 'Pain au Chocolat', division: 'French Bakery', units: 5400, salesAed: 54000 },
  { sku: 'FRB-004', product: 'Sourdough Loaf', division: 'French Bakery', units: 4500, salesAed: 50000 },
  { sku: 'FRB-005', product: 'Almond Croissant', division: 'French Bakery', units: 3500, salesAed: 46000 },
  { sku: 'FRB-006', product: 'Brioche Bun', division: 'French Bakery', units: 3300, salesAed: 40000 },
  { sku: 'FRB-007', product: 'Multigrain Loaf', division: 'French Bakery', units: 2100, salesAed: 36000 },
  { sku: 'FRB-008', product: 'Ciabatta', division: 'French Bakery', units: 2300, salesAed: 33000 },
  { sku: 'FRB-009', product: 'Country Sourdough', division: 'French Bakery', units: 2200, salesAed: 31000 },
  { sku: 'FRB-010', product: 'Focaccia', division: 'French Bakery', units: 2500, salesAed: 28000 },
  { sku: 'FRB-011', product: 'Rye Loaf', division: 'French Bakery', units: 2000, salesAed: 26000 },
  { sku: 'FRB-012', product: 'Baguette Tradition', division: 'French Bakery', units: 2000, salesAed: 24000 },
  { sku: 'FRB-013', product: 'Croissant Mini 6pk', division: 'French Bakery', units: 1800, salesAed: 22000 },
  { sku: 'FRB-014', product: 'Pain de Campagne', division: 'French Bakery', units: 2400, salesAed: 21000 },
  { sku: 'FRB-015', product: 'Petit Pain', division: 'French Bakery', units: 1900, salesAed: 19000 },
  { sku: 'FRB-016', product: 'Olive Fougasse', division: 'French Bakery', units: 1400, salesAed: 17000 },
  { sku: 'FRB-017', product: 'Seeded Roll', division: 'French Bakery', units: 1500, salesAed: 15000 },
  { sku: 'FRB-018', product: 'Milk Bread Loaf', division: 'French Bakery', units: 1600, salesAed: 14000 },
  { sku: 'FRB-019', product: 'Pain aux Raisins', division: 'French Bakery', units: 1100, salesAed: 13000 },
  { sku: 'FRB-020', product: 'Walnut Loaf', division: 'French Bakery', units: 900, salesAed: 12000 },
  { sku: 'FRB-021', product: 'Baguette Sesame', division: 'French Bakery', units: 1100, salesAed: 11000 },
  { sku: 'FRB-022', product: 'Ficelle', division: 'French Bakery', units: 1000, salesAed: 10000 },
  { sku: 'FRB-023', product: 'Pain Complet', division: 'French Bakery', units: 800, salesAed: 9000 },
  { sku: 'FRB-024', product: 'Épi Baguette', division: 'French Bakery', units: 700, salesAed: 8000 },
  { sku: 'FRB-025', product: 'Brioche Tressée', division: 'French Bakery', units: 450, salesAed: 7000 },
  { sku: 'FRB-026', product: 'Pain Viennois', division: 'French Bakery', units: 600, salesAed: 6000 },

  // ----------------------- Arabic Bread (16) ----------------------
  { sku: 'ARB-001', product: 'White Arabic Bread Large', division: 'Arabic Bread', units: 8200, salesAed: 62000 },
  { sku: 'ARB-002', product: 'Brown Arabic Bread', division: 'Arabic Bread', units: 6000, salesAed: 48000 },
  { sku: 'ARB-003', product: 'Pita Bread 6pk', division: 'Arabic Bread', units: 4000, salesAed: 42000 },
  { sku: 'ARB-004', product: 'Khubz Rugag', division: 'Arabic Bread', units: 2700, salesAed: 30000 },
  { sku: 'ARB-005', product: 'Saj Bread', division: 'Arabic Bread', units: 2800, salesAed: 26000 },
  { sku: 'ARB-006', product: 'Tannour Bread', division: 'Arabic Bread', units: 4800, salesAed: 24000 },
  { sku: 'ARB-007', product: 'Whole Wheat Arabic Bread', division: 'Arabic Bread', units: 2500, salesAed: 20000 },
  { sku: 'ARB-008', product: 'Arabic Bread Family Pack', division: 'Arabic Bread', units: 2300, salesAed: 18000 },
  { sku: 'ARB-009', product: 'Mini Pita 12pk', division: 'Arabic Bread', units: 2100, salesAed: 14000 },
  { sku: 'ARB-010', product: 'Zaatar Manakish', division: 'Arabic Bread', units: 1600, salesAed: 13000 },
  { sku: 'ARB-011', product: 'Cheese Manakish', division: 'Arabic Bread', units: 1400, salesAed: 12000 },
  { sku: 'ARB-012', product: 'Khubz Arabi Wholemeal', division: 'Arabic Bread', units: 1300, salesAed: 10000 },
  { sku: 'ARB-013', product: 'Markook Bread', division: 'Arabic Bread', units: 1200, salesAed: 9000 },
  { sku: 'ARB-014', product: 'Pita Pocket Large', division: 'Arabic Bread', units: 1000, salesAed: 8000 },
  { sku: 'ARB-015', product: 'Sesame Kaak', division: 'Arabic Bread', units: 500, salesAed: 2000 },
  { sku: 'ARB-016', product: 'Arabic Flatbread Mini', division: 'Arabic Bread', units: 400, salesAed: 2000 },

  // ----------------------- Viennoiserie (20) ----------------------
  { sku: 'VNS-001', product: 'Cheese Danish', division: 'Viennoiserie', units: 5200, salesAed: 53000 },
  { sku: 'VNS-002', product: 'Cinnamon Roll', division: 'Viennoiserie', units: 4500, salesAed: 54000 },
  { sku: 'VNS-003', product: 'Apple Turnover', division: 'Viennoiserie', units: 3700, salesAed: 44000 },
  { sku: 'VNS-004', product: 'Chocolate Danish', division: 'Viennoiserie', units: 3500, salesAed: 42000 },
  { sku: 'VNS-005', product: 'Raisin Swirl', division: 'Viennoiserie', units: 3000, salesAed: 36000 },
  { sku: 'VNS-006', product: 'Custard Danish', division: 'Viennoiserie', units: 2700, salesAed: 32000 },
  { sku: 'VNS-007', product: 'Almond Bear Claw', division: 'Viennoiserie', units: 2000, salesAed: 28000 },
  { sku: 'VNS-008', product: 'Berry Danish', division: 'Viennoiserie', units: 2000, salesAed: 24000 },
  { sku: 'VNS-009', product: 'Pecan Plait', division: 'Viennoiserie', units: 1400, salesAed: 20000 },
  { sku: 'VNS-010', product: 'Vanilla Croissant Roll', division: 'Viennoiserie', units: 1300, salesAed: 16000 },
  { sku: 'VNS-011', product: 'Apricot Danish', division: 'Viennoiserie', units: 1150, salesAed: 14000 },
  { sku: 'VNS-012', product: 'Chocolate Twist', division: 'Viennoiserie', units: 1000, salesAed: 12000 },
  { sku: 'VNS-013', product: 'Maple Pecan Danish', division: 'Viennoiserie', units: 800, salesAed: 11000 },
  { sku: 'VNS-014', product: 'Hazelnut Escargot', division: 'Viennoiserie', units: 750, salesAed: 10000 },
  { sku: 'VNS-015', product: 'Blueberry Danish', division: 'Viennoiserie', units: 720, salesAed: 9000 },
  { sku: 'VNS-016', product: 'Pistachio Roll', division: 'Viennoiserie', units: 500, salesAed: 7000 },
  { sku: 'VNS-017', product: 'Cream Cheese Braid', division: 'Viennoiserie', units: 420, salesAed: 6000 },
  { sku: 'VNS-018', product: 'Lemon Danish', division: 'Viennoiserie', units: 400, salesAed: 5000 },
  { sku: 'VNS-019', product: 'Cardamom Bun', division: 'Viennoiserie', units: 320, salesAed: 4000 },
  { sku: 'VNS-020', product: 'Almond Croissant Roll', division: 'Viennoiserie', units: 240, salesAed: 3000 },

  // -------------------------- Tahina (12) -------------------------
  { sku: 'THN-001', product: 'Premium Tahina 500g', division: 'Tahina', units: 5200, salesAed: 52000 },
  { sku: 'THN-002', product: 'Classic Tahina 250g', division: 'Tahina', units: 4000, salesAed: 40000 },
  { sku: 'THN-003', product: 'Organic Tahina 400g', division: 'Tahina', units: 2700, salesAed: 32000 },
  { sku: 'THN-004', product: 'Tahina Halva Swirl', division: 'Tahina', units: 1800, salesAed: 24000 },
  { sku: 'THN-005', product: 'Tahina 1kg Catering', division: 'Tahina', units: 1100, salesAed: 20000 },
  { sku: 'THN-006', product: 'Date Tahina Spread', division: 'Tahina', units: 1000, salesAed: 14000 },
  { sku: 'THN-007', product: 'Chocolate Tahina Spread', division: 'Tahina', units: 850, salesAed: 12000 },
  { sku: 'THN-008', product: 'Tahina Sachets 20pk', division: 'Tahina', units: 700, salesAed: 8000 },
  { sku: 'THN-009', product: 'Tahina Halva Bar', division: 'Tahina', units: 600, salesAed: 6000 },
  { sku: 'THN-010', product: 'Roasted Tahina 300g', division: 'Tahina', units: 420, salesAed: 5000 },
  { sku: 'THN-011', product: 'Tahina Gift Pack', division: 'Tahina', units: 250, salesAed: 4000 },
  { sku: 'THN-012', product: 'Tahina Dressing 250ml', division: 'Tahina', units: 300, salesAed: 3000 },

  // ------------- Seasonal Collection — Mango Summer (14) ----------
  { sku: 'SEA-M01', product: 'Mango Cheesecake', division: 'Seasonal Collection', units: 3600, salesAed: 72000 },
  { sku: 'SEA-M02', product: 'Mango Tiramisu', division: 'Seasonal Collection', units: 2700, salesAed: 54000 },
  { sku: 'SEA-M03', product: 'Mango Éclair', division: 'Seasonal Collection', units: 3700, salesAed: 44000 },
  { sku: 'SEA-M04', product: 'Mango Croissant', division: 'Seasonal Collection', units: 3300, salesAed: 40000 },
  { sku: 'SEA-M05', product: 'Mango Cream Tart', division: 'Seasonal Collection', units: 2100, salesAed: 34000 },
  { sku: 'SEA-M06', product: 'Mango Mousse Cup', division: 'Seasonal Collection', units: 2500, salesAed: 30000 },
  { sku: 'SEA-M07', product: 'Mango Pistachio Cake', division: 'Seasonal Collection', units: 1300, salesAed: 26000 },
  { sku: 'SEA-M08', product: 'Mango Danish', division: 'Seasonal Collection', units: 2000, salesAed: 20000 },
  { sku: 'SEA-M09', product: 'Mango Roll Cake', division: 'Seasonal Collection', units: 1100, salesAed: 16000 },
  { sku: 'SEA-M10', product: 'Mango Macaron Box', division: 'Seasonal Collection', units: 700, salesAed: 14000 },
  { sku: 'SEA-M11', product: 'Mango Panna Cotta', division: 'Seasonal Collection', units: 900, salesAed: 12000 },
  { sku: 'SEA-M12', product: 'Mango Puff Pastry', division: 'Seasonal Collection', units: 800, salesAed: 8000 },
  { sku: 'SEA-M13', product: 'Mango Sticky Rice Tart', division: 'Seasonal Collection', units: 400, salesAed: 6000 },
  { sku: 'SEA-M14', product: 'Mango Yoghurt Parfait', division: 'Seasonal Collection', units: 350, salesAed: 4000 },
];

// One gold ramp rather than six arbitrary hues — divisions stay separable without introducing colours the design system doesn't otherwise use.
export const SKU_DIVISION_COLORS: Record<Division, string> = {
  Baklava: '#F2CA50',
  'French Bakery': '#D4AF37',
  'Arabic Bread': '#B8942C',
  Viennoiserie: '#9C7A22',
  Tahina: '#7E621B',
  'Seasonal Collection': '#FFE088',
};
