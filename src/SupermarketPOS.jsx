import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Printer, SplitSquareHorizontal,
  Home, ChevronLeft
} from "lucide-react";

/**
 * Square/Toast-style Supermarket POS
 * - Left: scan/search + product tiles (touch friendly)
 * - Right: cart for the active split (A–D)
 * - Sticky footer: totals + checkout actions
 * - Alcohol levy handled separately; VAT applied to the taxable base
 * - Works standalone at #/supermarket without affecting your restaurant UI
 *
 * Tailwind only. No router libs. No backend calls (you can wire later).
 */

/* --------------------------- Demo catalog ---------------------------- */
/* You can later replace this with items coming from your BC proxy. */
const CATALOG = [
  { sku: "6161100000012", name: "Milk 500ml",     price: 85 },
  { sku: "6161100000029", name: "Bread Loaf 400g", price: 120 },
  { sku: "6161100000043", name: "Cooking Oil 1L",  price: 520 },
  { sku: "6161100000050", name: "Sugar 1kg",       price: 230 },
  { sku: "6161100000098", name: "Lager Beer 500ml", price: 220, alcohol: true },
  { sku: "6161100000099", name: "House Red Wine 750ml", price: 950, alcohol: true },
];

/* --------------------------- Helpers ---------------------------- */
const K = {
  VAT_RATE: 0.16,            // 16%
  ALCOHOL_LEVY: 0.10,        // 10% (adjust to your local rule)
};
const fmt = (n) => `KSh ${Number(n || 0).toLocaleString()}`;

function calcTotals(lines) {
  const sub = lines.reduce((s, l) => s + l.price * l.qty, 0);

  const alcoholBase = lines
    .filter(l => l.alcohol)
    .reduce((s, l) => s + l.price * l.qty, 0);

  const alcoholLevy = Math.round(alcoholBase * K.ALCOHOL_LEVY);

  // VAT applied on (subtotal + alcohol levy) for taxable goods
  const vatBase = sub + alcoholLevy;
  const vat = Math.round(vatBase * K.VAT_RATE);

  const grand = sub + alcoholLevy + vat;
  return { sub, alcoholLevy, vat, grand };
}

/* --------------------------- UI Bits ---------------------------- */
const Badge = ({ children }) => (
  <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">{children}</span>
);

const Tile = ({ name, sku, price, hint, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left p-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white shadow-sm hover:shadow transition"
  >
    <div className="font-semibold text-slate-900">{name}</div>
    <div className="text-xs text-slate-500">{sku}</div>
    <div className="mt-2 font-semibold">{fmt(price)}</div>
    {hint && <div className="mt-2 text-xs text-rose-600">{hint}</div>}
  </button>
);

function SplitTabs({ active, setActive, visible, setVisible }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-sm text-slate-500 flex items-center gap-2">
        <SplitSquareHorizontal className="w-4 h-4" />
        <span>Active split:</span>
      </div>
      {["A", "B", "C", "D"].map((k) => (
        <button
          key={k}
          onClick={() => setActive(k)}
          className={`w-8 h-8 rounded-full text-sm font-semibold border ${
            active === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
          }`}
        >
          {k}
        </button>
      ))}
      <button
        onClick={() => setVisible(!visible)}
        className="ml-2 px-3 py-1.5 rounded-full border text-sm"
      >
        {visible ? "Hide splits" : "Show splits"}
      </button>
    </div>
  );
}

/* --------------------------- Main Component ---------------------------- */
export default function SupermarketPOS() {
  const [query, setQuery] = useState("");
  const [activeSplit, setActiveSplit] = useState("A");
  const [showSplitBar, setShowSplitBar] = useState(true);

  // Four independent carts (A–D)
  const [carts, setCarts] = useState({
    A: [],
    B: [],
    C: [],
    D: [],
  });

  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addToCart = (item) => {
    setCarts((prev) => {
      const lines = prev[activeSplit] || [];
      const found = lines.find((l) => l.sku === item.sku);
      const next = found
        ? lines.map((l) => (l.sku === item.sku ? { ...l, qty: l.qty + 1 } : l))
        : [...lines, { ...item, qty: 1 }];
      return { ...prev, [activeSplit]: next };
    });
  };

  const changeQty = (sku, delta) => {
    setCarts((prev) => {
      const lines = prev[activeSplit] || [];
      const next = lines
        .map((l) => (l.sku === sku ? { ...l, qty: Math.max(1, l.qty + delta) } : l))
        .filter((l) => l.qty > 0);
      return { ...prev, [activeSplit]: next };
    });
  };

  const removeLine = (sku) => {
    setCarts((prev) => {
      const lines = prev[activeSplit] || [];
      const next = lines.filter((l) => l.sku !== sku);
      return { ...prev, [activeSplit]: next };
    });
  };

  const clearCart = () => {
    if (!confirm(`Clear split ${activeSplit}?`)) return;
    setCarts((p) => ({ ...p, [activeSplit]: [] }));
  };

  const handleEnter = () => {
    const q = query.trim();
    if (!q) return;

    // barcode first
    const barcodeHit = CATALOG.find((p) => p.sku === q);
    if (barcodeHit) {
      addToCart(barcodeHit);
      setQuery("");
      return;
    }
    // name fragment
    const lc = q.toLowerCase();
    const nameHit = CATALOG.filter(
      (p) => p.name.toLowerCase().includes(lc) || p.sku.includes(q)
    );
    if (nameHit.length === 1) {
      addToCart(nameHit[0]);
      setQuery("");
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATALOG;
    return CATALOG.filter(
      (p) => p.sku.includes(query) || p.name.toLowerCase().includes(q)
    );
  }, [query]);

  const lines = carts[activeSplit] || [];
  const totals = useMemo(() => calcTotals(lines), [lines]);

  const printReceipt = () => {
    // demo
    alert(`Printing split ${activeSplit} – total ${fmt(totals.grand)}`);
  };

  const checkout = () => {
    if (lines.length === 0) {
      alert("Cart is empty.");
      return;
    }
    // In production: call your backend to post to BC (Sales Invoice/Order).
    alert(`Checkout split ${activeSplit} – ${fmt(totals.grand)} (demo)`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white grid place-items-center font-bold">SM</div>
            <div>
              <div className="font-semibold text-lg">Supermarket POS</div>
              <div className="text-xs text-slate-500">Standalone — barcode scan & split bill</div>
            </div>
          </div>

          <div className="hidden md:block">
            <SplitTabs
              active={activeSplit}
              setActive={setActiveSplit}
              visible={showSplitBar}
              setVisible={setShowSplitBar}
            />
          </div>

          <a
            href="#/"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm hover:bg-slate-50"
            title="Back to Restaurant"
          >
            <ChevronLeft className="w-4 h-4" />
            Restaurant
          </a>
        </div>

        {showSplitBar && (
          <div className="md:hidden border-t border-slate-200 px-4 py-2">
            <SplitTabs
              active={activeSplit}
              setActive={setActiveSplit}
              visible={showSplitBar}
              setVisible={setShowSplitBar}
            />
          </div>
        )}
      </header>

      {/* Body */}
      <main className="max-w-7xl mx-auto p-4 grid lg:grid-cols-[1fr_420px] gap-6">
        {/* Left: scan + catalog */}
        <section className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="mb-2 text-slate-600 font-medium">Scan / Search</div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={inputRef}
                className="w-full pl-9 pr-3 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="e.g. 6161100000012 or 'milk'"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEnter()}
              />
            </div>
            <button
              onClick={handleEnter}
              className="px-4 rounded-xl bg-slate-900 text-white"
            >
              Add
            </button>
          </div>

          <div className="mt-6 grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((p) => (
              <Tile
                key={p.sku}
                name={p.name}
                sku={p.sku}
                price={p.price}
                hint={p.alcohol ? "Alcohol levy applies" : ""}
                onClick={() => addToCart(p)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="text-sm text-slate-500 col-span-full">
                No matches.
              </div>
            )}
          </div>
        </section>

        {/* Right: cart */}
        <aside className="bg-white border border-slate-200 rounded-2xl p-4 sticky top-[88px] h-max">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Cart</div>
            <div className="flex items-center gap-2">
              <button
                onClick={printReceipt}
                className="px-2.5 py-1.5 rounded-xl border text-sm hover:bg-slate-50"
                title="Print"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button
                onClick={clearCart}
                className="px-2.5 py-1.5 rounded-xl border text-sm hover:bg-slate-50"
                title="Clear"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {lines.map((l) => (
              <div
                key={l.sku}
                className="border border-slate-200 rounded-xl p-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-slate-500">{l.sku}</div>
                  <div className="text-xs text-slate-500">Standard VAT</div>
                  {l.alcohol && (
                    <div className="text-xs text-rose-600 mt-1">Alcohol levy applies</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="border rounded-lg px-2 py-1 text-sm"
                    title="Split seat (visual only)"
                    defaultValue="A"
                    onChange={() => {}}
                  >
                    <option>A</option>
                    <option>B</option>
                    <option>C</option>
                    <option>D</option>
                  </select>
                  <button onClick={() => changeQty(l.sku, -1)} className="px-2 py-1 rounded-lg border">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center">{l.qty}</span>
                  <button onClick={() => changeQty(l.sku, +1)} className="px-2 py-1 rounded-lg border">
                    <Plus className="w-4 h-4" />
                  </button>
                  <div className="w-24 text-right font-semibold">{fmt(l.price * l.qty)}</div>
                  <button onClick={() => removeLine(l.sku)} className="px-2 py-1 rounded-lg border ml-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {lines.length === 0 && (
              <div className="text-sm text-slate-500">Cart is empty.</div>
            )}
          </div>

          {/* Totals */}
          <div className="mt-4 border-t pt-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{fmt(totals.sub)}</span>
            </div>
            <div className="flex justify-between">
              <span>Alcohol levy</span>
              <span>{fmt(totals.alcoholLevy)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT (16%)</span>
              <span>{fmt(totals.vat)}</span>
            </div>
            <div className="flex justify-between text-lg font-semibold pt-1">
              <span>Grand</span>
              <span>{fmt(totals.grand)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="rounded-xl border py-2 flex items-center justify-center gap-2 hover:bg-slate-50">
              <Home className="w-4 h-4" />
              Suspend
            </button>
            <button
              onClick={checkout}
              className="rounded-xl bg-slate-900 text-white py-2 flex items-center justify-center gap-2"
            >
              <ShoppingCart className="w-4 h-4" />
              Checkout
            </button>
          </div>
        </aside>
      </main>

      {/* Footer bar (mobile sticky summary) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="text-sm">
            <div className="font-semibold">Total</div>
            <div className="text-slate-600">{fmt(totals.grand)}</div>
          </div>
          <button
            onClick={checkout}
            className="rounded-xl bg-slate-900 text-white px-5 py-2"
          >
            Checkout
          </button>
        </div>
      </div>
    </div>
  );
}
