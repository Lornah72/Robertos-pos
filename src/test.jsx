import React, { useMemo, useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  UtensilsCrossed,
  Receipt,
  CreditCard,
  Users2,
  Settings,
  TableProperties,
  Cloud,
  CloudOff,
  CloudUpload,
  Building2,
  Pizza,
  Coffee,
  Soup,
  Sandwich,
  Martini,
  Wine,
  Plus,
  Edit3,
  Trash2,
  AlertTriangle,
  ShoppingCart,
  RefreshCw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* =========================================================
   BC-integrated POS prototype
   - Items (Restaurant & Market) fetched from Business Central
   - One payment; posting splits into two BC documents
   - Printing (80mm) remains client-side
========================================================= */

// ---------- Sample chart data (unchanged) ----------
const sampleSales = [
  { name: "Mon", sales: 560, orders: 45 },
  { name: "Tue", sales: 720, orders: 58 },
  { name: "Wed", sales: 830, orders: 64 },
  { name: "Thu", sales: 610, orders: 49 },
  { name: "Fri", sales: 1210, orders: 91 },
  { name: "Sat", sales: 1390, orders: 104 },
  { name: "Sun", sales: 990, orders: 77 },
];

const topItems = [
  { name: "Margherita Pizza", value: 26 },
  { name: "Chicken Burger", value: 21 },
  { name: "Caesar Salad", value: 18 },
  { name: "Americano", value: 14 },
  { name: "Lemonade", value: 21 },
];

const COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

// UI categories (purely visual tabs for menu view)
const categories = [
  { id: "pizza", name: "Pizza", icon: <Pizza className="w-4 h-4" /> },
  { id: "coffee", name: "Coffee", icon: <Coffee className="w-4 h-4" /> },
  { id: "soup", name: "Soups", icon: <Soup className="w-4 h-4" /> },
  { id: "sandwich", name: "Sandwiches", icon: <Sandwich className="w-4 h-4" /> },
  { id: "bar", name: "Bar", icon: <Martini className="w-4 h-4" /> },
];

// Tables
const initialTables = Array.from({ length: 16 }).map((_, i) => ({
  id: i + 1,
  name: `T${i + 1}`,
  seats: (i % 4) + 2,
  status: i % 5 === 0 ? "occupied" : i % 3 === 0 ? "reserved" : "free",
  waiter: i % 5 === 0 ? "Anne" : undefined,
  total: i % 5 === 0 ? 500 + i * 30 : 0,
}));

// ---------- Utility ----------
const Badge = ({ children, intent = "default", title }) => (
  <span
    title={title}
    className={
      `px-2 py-1 text-xs rounded-full whitespace-nowrap ` +
      (intent === "success"
        ? "bg-emerald-100 text-emerald-700"
        : intent === "warning"
        ? "bg-amber-100 text-amber-700"
        : intent === "danger"
        ? "bg-rose-100 text-rose-700"
        : intent === "info"
        ? "bg-sky-100 text-sky-700"
        : "bg-slate-100 text-slate-700")
    }
  >
    {children}
  </span>
);

const Card = ({ title, icon, right, children, className = "" }) => (
  <div className={`bg-white/90 backdrop-blur border border-slate-100 shadow-sm rounded-2xl p-4 ${className}`}>
    {(title || icon || right) && (
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          {title && <h3 className="font-semibold text-slate-800">{title}</h3>}
        </div>
        {right}
      </div>
    )}
    <div>{children}</div>
  </div>
);

const Pill = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={
      `flex items-center gap-2 px-4 py-2 rounded-full border text-sm transition ` +
      (active ? "bg-slate-900 text-white border-slate-900 shadow" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")
    }
  >
    {icon}
    <span>{label}</span>
  </button>
);

const Row = ({ left, right }) => (
  <div className="flex justify-between"><span>{left}</span><span>{right}</span></div>
);

/** ======================= One-bill table ======================= */
function CombinedBillTable({
  restaurantLines,
  marketLines,
  onMinusRestaurant,
  onPlusRestaurant,
  onRemoveRestaurant,
  onMinusMarket,
  onPlusMarket,
  onRemoveMarket,
}) {
  const rows = [
    ...restaurantLines.map((r, idx) => ({
      key: `R-${idx}-${r.id}`,
      channel: "Restaurant",
      name: r.name,
      unit: r.price,
      qty: r.qty,
      total: r.price * r.qty,
      onMinus: () => onMinusRestaurant(idx),
      onPlus: () => onPlusRestaurant(idx),
      onRemove: () => onRemoveRestaurant(idx),
    })),
    ...marketLines.map((m) => ({
      key: `M-${m.sku}`,
      channel: "Market",
      name: m.name,
      unit: m.price,
      qty: m.qty,
      total: m.price * m.qty,
      onMinus: () => onMinusMarket(m.sku),
      onPlus: () => onPlusMarket(m.sku),
      onRemove: () => onRemoveMarket(m.sku),
    })),
  ];

  if (rows.length === 0) {
    return <div className="text-sm text-slate-500">No items yet. Add from menu or market.</div>;
  }

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="grid grid-cols-[120px_1fr_110px_120px_120px_70px] bg-slate-50 text-xs text-slate-600 font-medium px-3 py-2">
        <div>Channel</div>
        <div>Item</div>
        <div>Unit</div>
        <div className="text-center">Qty</div>
        <div className="text-right">Line Total</div>
        <div className="text-right pr-1">&nbsp;</div>
      </div>

      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[120px_1fr_110px_120px_120px_70px] items-center px-3 py-2 border-t">
          <div className="text-xs">
            <span className={`px-2 py-1 rounded-full text-xs ${r.channel==="Restaurant" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>
              {r.channel}
            </span>
          </div>
          <div className="font-medium">{r.name}</div>
          <div>KSh {r.unit}</div>
          <div className="flex items-center justify-center gap-1">
            <button onClick={r.onMinus} className="px-2 py-1 rounded-lg border">−</button>
            <div className="w-8 text-center">{r.qty}</div>
            <button onClick={r.onPlus} className="px-2 py-1 rounded-lg border">+</button>
          </div>
          <div className="text-right font-semibold">KSh {r.total.toLocaleString()}</div>
          <div className="text-right">
            <button onClick={r.onRemove} className="px-2 py-1 rounded-lg border">×</button>
          </div>
        </div>
      ))}
    </div>
  );
}
/** ================================================================== */

// ---------- Totals ----------
function calcRestaurantTotals(cart) {
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const service = Math.round(sub * 0.05);
  const vat = Math.round((sub + service) * 0.16);
  const total = sub + service + vat;
  return { sub, service, vat, total };
}

function calcMarketTotals(marketCart) {
  const sub = marketCart.reduce((s, i) => s + i.price * i.qty, 0);
  const vat = Math.round(sub * 0.16);
  const total = sub + vat;
  return { sub, vat, total };
}

function genSaleNo() {
  return String(Date.now()).slice(-8);
}
const fmt = (n) => `KSh ${Number(n || 0).toLocaleString()}`;

/* ============================ PRINTING ============================ */
function PrintableReceipt({ data }) {
  if (!data) return null;
  const {
    saleNo, dateISO, method, tableName,
    customer, restaurantLines, marketLines,
    rTotals, mTotals, grand
  } = data;

  return (
    <div id="receipt" style={{ width: "80mm", padding: "4mm", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14 }}>Robertos Cafe</div>
      <div style={{ textAlign: "center", fontSize: 11, marginBottom: 6 }}>Main Branch – Dining Hall</div>
      <div style={{ fontSize: 11 }}>
        <div>Receipt: {saleNo}</div>
        <div>Date: {new Date(dateISO).toLocaleString()}</div>
        {tableName ? <div>Table: {tableName}</div> : null}
        {customer?.name ? <div>Customer: {customer.name}</div> : null}
        {customer?.phone ? <div>Phone: {customer.phone}</div> : null}
        {method ? <div>Payment: {method}</div> : null}
      </div>

      <div style={{ borderTop: "1px dashed #555", margin: "6px 0" }} />

      {/* Lines */}
      <div style={{ fontSize: 11 }}>
        {[...(restaurantLines || [])].map((l, i) => (
          <div key={`R-${i}`} style={{ marginBottom: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>R • {l.name} x{l.qty}</span>
              <span>{fmt(l.price * l.qty)}</span>
            </div>
          </div>
        ))}
        {[...(marketLines || [])].map((l, i) => (
          <div key={`M-${i}`} style={{ marginBottom: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>M • {l.name} x{l.qty}</span>
              <span>{fmt(l.price * l.qty)}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px dashed #555", margin: "6px 0" }} />

      {/* Totals */}
      <div style={{ fontSize: 11 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>R • Subtotal</span><span>{fmt(rTotals.sub)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>R • Service (5%)</span><span>{fmt(rTotals.service)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>R • VAT (16%)</span><span>{fmt(rTotals.vat)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: 6 }}><span>R • Total</span><span>{fmt(rTotals.total)}</span></div>

        <div style={{ display: "flex", justifyContent: "space-between" }}><span>M • Subtotal</span><span>{fmt(mTotals.sub)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>M • VAT (16%)</span><span>{fmt(mTotals.vat)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>M • Total</span><span>{fmt(mTotals.total)}</span></div>

        <div style={{ borderTop: "1px dashed #555", margin: "6px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 12 }}>
          <span>GRAND TOTAL</span><span>{fmt(grand)}</span>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 10, fontSize: 11 }}>
        Thank you! — Powered by POS
      </div>
    </div>
  );
}
const PrintStyles = () => (
  <style>{`
    @media print {
      body * { visibility: hidden !important; }
      #print-container, #print-container * { visibility: visible !important; }
      #print-container { position: absolute; left: 0; top: 0; }
      @page { size: 80mm auto; margin: 0; }
    }
  `}</style>
);

/* ============================ BC HELPERS ============================ */

/**
 * IMPORTANT: In production, call your own backend proxy (to handle OAuth + CORS).
 * The sample below uses env vars directly for clarity.
 */
async function bcFetch(path, options = {}) {
  const base = import.meta?.env?.VITE_BC_BASE_URL || "";
  const tenant = import.meta?.env?.VITE_BC_TENANT_ID || "";
  const envName = import.meta?.env?.VITE_BC_ENV || "Production";
  const companyId = import.meta?.env?.VITE_BC_COMPANY_ID || "";
  const token = import.meta?.env?.VITE_BC_TOKEN || ""; // Bearer token from your proxy

  const url = `${base}/${tenant}/${envName}/api/v2.0/companies(${companyId})${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`BC ${options.method || "GET"} ${path} failed: ${res.status} ${res.statusText} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Change this if you use a different attribute to split channels */
function pickChannelFromItem(item) {
  const tag =
    (item.itemCategoryCode || item.itemCategoryId || item.itemCategoryDisplayName || "").toString().toLowerCase();

  if (tag.includes("market")) return "MARKET";
  if (tag.includes("restaurant")) return "RESTAURANT";

  // fallback: if service/non-inventory treat as restaurant; inventory goods to market — tweak as needed
  if ((item.type || "").toLowerCase() === "service") return "RESTAURANT";
  return "MARKET";
}

/** Map BC item to our UI item shapes */
function mapBcItem(item) {
  const channel = pickChannelFromItem(item);
  const price = Number(item.unitPrice || item.price || 0);
  const name = item.displayName || item.description || item.number || "Item";
  const bcId = item.id;
  const number = item.number;
  const sku = extractBarcode(item); // barcode or fallback to item number

  return {
    bcId,
    number,
    sku,
    name,
    price,
    channel,
    // UI helpers
    category: guessUiCategory(name),
    mods: [], // could be bound to BC Attributes later
  };
}

/** If you store barcodes in a custom table, wire them here. */
function extractBarcode(item) {
  // Prefer GTIN, else number
  const gtin = item.gtin || item.gtinCode || item.barcode || "";
  return (gtin && String(gtin)) || String(item.number || "");
}

/** Super-light classifier to place items into visual categories */
function guessUiCategory(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("pizza")) return "pizza";
  if (n.includes("coffee") || n.includes("americano") || n.includes("latte")) return "coffee";
  if (n.includes("soup")) return "soup";
  if (n.includes("sandwich") || n.includes("burger") || n.includes("panini")) return "sandwich";
  if (n.includes("wine") || n.includes("beer") || n.includes("vodka") || n.includes("whisky")) return "bar";
  return "pizza";
}

/** Load BC items and split into Restaurant vs Market lists */
async function loadBcItems() {
  // Pull paged items as needed. Keep it simple for demo:
  // GET /items
  const data = await bcFetch(`/items`);
  const items = (data?.value || []).map(mapBcItem);

  const restaurant = items.filter(i => i.channel === "RESTAURANT");
  const market = items.filter(i => i.channel === "MARKET");

  return { restaurant, market, raw: items };
}

/** Post two sales invoices to BC (Restaurant & Market) */
async function postSplitInvoicesToBC({ restaurant, market, customer, method, saleNo }) {
  // You can switch to salesOrders if you prefer, then post/invoice in BC via job queue.
  const common = {
    postingDate: new Date().toISOString().slice(0, 10),
    externalDocumentNumber: saleNo,
    // If you store mapping of customer.bcNo -> BC customer id, resolve it here:
    // For demo, allow user to type BC customer number in bcNo and we search it:
  };

  const customerId = await resolveCustomerId(customer?.bcNo);

  const mkLines = (lines) =>
    lines.map(l => ({
      description: l.name,
      itemId: l.bcId, // BC item id
      quantity: l.qty,
      unitPrice: l.price,
    }));

  const payloadRestaurant = {
    customerId,
    ...common,
    salesInvoiceLines: mkLines(restaurant.lines),
  };

  const payloadMarket = {
    customerId,
    ...common,
    salesInvoiceLines: mkLines(market.lines),
  };

  // POST /salesInvoices
  const r = await bcFetch(`/salesInvoices`, {
    method: "POST",
    body: JSON.stringify(payloadRestaurant),
  });

  const m = await bcFetch(`/salesInvoices`, {
    method: "POST",
    body: JSON.stringify(payloadMarket),
  });

  return { ok: true, rInv: r, mInv: m };
}

/** Resolve typed BC Customer No -> BC Customer ID (GUID) */
async function resolveCustomerId(bcNoOrEmpty) {
  if (!bcNoOrEmpty) {
    // use a default walk-in customer (configure this in BC and put its GUID here)
    const defaultId = import.meta?.env?.VITE_BC_WALKIN_CUSTOMER_ID || "";
    if (defaultId) return defaultId;

    // fallback: try to find a "WALKIN" by number
    const res = await bcFetch(`/customers?$filter=number eq 'WALKIN'`);
    const id = res?.value?.[0]?.id;
    if (!id) throw new Error("BC customer not found. Provide VITE_BC_WALKIN_CUSTOMER_ID or enter BC Customer No.");
    return id;
  }
  // find by number
  const res = await bcFetch(`/customers?$filter=number eq '${encodeURIComponent(bcNoOrEmpty)}'`);
  const id = res?.value?.[0]?.id;
  if (!id) throw new Error(`BC customer ${bcNoOrEmpty} not found.`);
  return id;
}

/* ============================ MAIN APP ============================ */
export default function POSPrototype() {
  const [online, setOnline] = useState(true);
  const [bcConnected, setBcConnected] = useState(true);

  const [location, setLocation] = useState("Main Branch – Dining Hall");
  const [screen, setScreen] = useState("Architecture");

  // KDS tickets (left from your earlier step if you added KDS)
  const [tickets, setTickets] = useState([]);

  // Restaurant UI
  const [cat, setCat] = useState("pizza");
  const [cart, setCart] = useState([]);             // restaurant lines
  const [marketCart, setMarketCart] = useState([]); // market lines
  const [attachMarket, setAttachMarket] = useState(true);
  const [customer, setCustomer] = useState({ name: "", phone: "", bcNo: "" });

  const [tables, setTables] = useState(initialTables);
  const [activeTable, setActiveTable] = useState(null);

  // BC items
  const [loadingBC, setLoadingBC] = useState(false);
  const [bcError, setBcError] = useState("");
  const [bcRestaurant, setBcRestaurant] = useState([]); // [{bcId, number, sku, name, price, category, ...}]
  const [bcMarket, setBcMarket] = useState([]);

  // Printing queue
  const [lastReceipt, setLastReceipt] = useState(null);
  const [isPrintQueued, setIsPrintQueued] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Market scanning
  const [marketQuery, setMarketQuery] = useState("");
  const scanRef = useRef(null);

  // Load BC items once (and on manual refresh)
  useEffect(() => {
    (async () => {
      try {
        setLoadingBC(true);
        setBcError("");

        // Try cache first
        const cache = localStorage.getItem("BC_ITEMS_CACHE_V1");
        if (cache) {
          const { restaurant, market } = JSON.parse(cache);
          setBcRestaurant(restaurant || []);
          setBcMarket(market || []);
        }

        const fresh = await loadBcItems();
        setBcRestaurant(fresh.restaurant);
        setBcMarket(fresh.market);
        localStorage.setItem("BC_ITEMS_CACHE_V1", JSON.stringify({ restaurant: fresh.restaurant, market: fresh.market }));
        setBcConnected(true);
      } catch (e) {
        console.error(e);
        setBcError(e.message || "Failed to load from BC");
        // stay with cache if available
        setBcConnected(false);
      } finally {
        setLoadingBC(false);
      }
    })();
  }, []);

  // Print queue handling
  useEffect(() => {
    if (!isPrintQueued || !lastReceipt) return;
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
        setIsPrintQueued(false);
      }, 0);
    });
  }, [isPrintQueued, lastReceipt]);

  const printNow = (payloadSnapshot) => {
    const rTotals = calcRestaurantTotals(cart);
    const mTotals = calcMarketTotals(marketCart);
    const grand = (attachMarket ? mTotals.total : 0) + rTotals.total;

    const data = payloadSnapshot || {
      saleNo: genSaleNo(),
      dateISO: new Date().toISOString(),
      method: "(Proforma)",
      tableName: activeTable?.name || "",
      customer,
      restaurantLines: cart,
      marketLines: attachMarket ? marketCart : [],
      rTotals,
      mTotals,
      grand,
    };
    setLastReceipt(data);
    setIsPrintQueued(true);
    setShowPreview(false);
  };

  // Focus scan input on Market screen
  useEffect(() => {
    if (screen === "Market" && scanRef.current) scanRef.current.focus();
  }, [screen]);

  // ====== Filtering restaurant menu for UI tabs (from BC Restaurant items) ======
  const filteredMenu = useMemo(() => {
    const items = bcRestaurant;
    return items.filter(m => m.category === cat);
  }, [bcRestaurant, cat]);

  // Totals
  const rTotals = useMemo(() => calcRestaurantTotals(cart), [cart]);
  const mTotals = useMemo(() => calcMarketTotals(marketCart), [marketCart]);
  const grand = (attachMarket ? mTotals.total : 0) + rTotals.total;

  // ---------- Restaurant cart ops ----------
  const addToCart = (bcItem) => {
    // bcItem: { bcId, name, price, ... }
    const key = bcItem.bcId + "|mods:"; // no mods for now
    const existingIndex = cart.findIndex(c => c._key === key);
    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex] = { ...newCart[existingIndex], qty: newCart[existingIndex].qty + 1 };
      setCart(newCart);
    } else {
      setCart([...cart, { _key: key, id: bcItem.number, bcId: bcItem.bcId, name: bcItem.name, price: bcItem.price, qty: 1, mods: [], modsKey: "" }]);
    }
  };
  const setItemMods = (idx, mods) => {
    const modsKey = mods.sort().join("|");
    setCart(cart.map((c, i) => (i === idx ? { ...c, mods, modsKey, _key: (c.bcId || c.id) + "|mods:" + modsKey } : c)));
  };
  const removeFromCart = (idx) => setCart(cart.filter((_, i) => i !== idx));
  const changeQty = (idx, delta) => setCart(cart.map((c, i) => (i === idx ? { ...c, qty: Math.max(1, c.qty + delta) } : c)));

  // ---------- Market ops (BC-based) ----------
  const addMarketItem = (bcItem) => {
    const sku = bcItem.sku;
    const existing = marketCart.find(l => l.sku === sku);
    if (existing) setMarketCart(marketCart.map(l => l.sku === sku ? { ...l, qty: l.qty + 1 } : l));
    else setMarketCart([...marketCart, { ...bcItem, qty: 1 }]);
  };
  const removeMarketItem = (sku) => setMarketCart(marketCart.filter(l => l.sku !== sku));
  const changeMarketQty = (sku, delta) =>
    setMarketCart(marketCart.map(l => l.sku === sku ? { ...l, qty: Math.max(1, l.qty + delta) } : l));

  // Market Enter: search barcode or name in BC market items
  const handleMarketEnter = () => {
    const q = marketQuery.trim();
    if (!q) return;

    // Try direct barcode match
    const barcodeHit = bcMarket.find(p => p.sku === q);
    if (barcodeHit) {
      addMarketItem(barcodeHit);
      setMarketQuery("");
      return;
    }
    // Fuzzy name/number
    const lc = q.toLowerCase();
    const candidates = bcMarket.filter(p =>
      (p.name || "").toLowerCase().includes(lc) || (p.number || "").toLowerCase().includes(lc) || (p.sku || "").includes(q)
    );
    if (candidates.length === 1) {
      addMarketItem(candidates[0]);
      setMarketQuery("");
    }
  };

  // Send to Kitchen (also push to KDS board if you added KDS screen)
  const sendToKitchen = () => {
    if (!activeTable) return alert("Select a table first");
    if (cart.length === 0) return alert("Cart is empty");

    const items = cart.map(c => ({
      name: c.name,
      qty: c.qty,
      mods: c.mods || [],
    }));

    const ticket = {
      id: `${Date.now()}`,
      table: activeTable.name,
      createdAt: new Date().toISOString(),
      status: "NEW",
      items,
      note: "",
    };
    setTickets([ticket, ...tickets]);

    alert(`Order for ${activeTable.name} sent to KDS (items: ${cart.length})`);
    setTables(tables.map(t => t.id === activeTable.id ? { ...t, status: "occupied", waiter: "Anne", total: rTotals.total } : t));
  };

  // --- Posting (SPLIT by channel, but pay together) ---
  const postToBCSplit = async ({ restaurant, market, saleNo, customer, method, grand }) => {
    // If offline or BC disconnected, bail out
    if (!online || !bcConnected) {
      return { ok: false, offline: true };
    }
    // Map our line items to what the posting helper expects
    return await postSplitInvoicesToBC({
      restaurant,
      market,
      customer,
      method,
      saleNo,
    });
  };

  const checkoutAll = async (method) => {
    if (!activeTable && !customer.name) {
      return alert("Select a table or enter customer name/phone.");
    }
    if (cart.length === 0 && (!attachMarket || marketCart.length === 0)) {
      return alert("No items to pay.");
    }
    const saleNo = genSaleNo();

    const payload = {
      restaurant: { lines: cart, totals: rTotals },
      market: { lines: attachMarket ? marketCart : [], totals: attachMarket ? mTotals : { sub: 0, vat: 0, total: 0 } },
      saleNo,
      customer,
      method,
      grand,
    };

    // Try BC
    try {
      const result = await postToBCSplit(payload);

      const paidSnap = {
        saleNo,
        dateISO: new Date().toISOString(),
        method,
        tableName: activeTable?.name || "",
        customer,
        restaurantLines: cart,
        marketLines: attachMarket ? marketCart : [],
        rTotals,
        mTotals,
        grand,
      };

      if (result.ok) {
        const printConfirm = confirm(
          `Paid ${fmt(grand)} via ${method}.\nSplit posted to BC.\n• Restaurant: ${fmt(rTotals.total)}\n• Market: ${attachMarket ? fmt(mTotals.total) : "KSh 0"}\n\nPrint receipt now?`
        );
        if (printConfirm) printNow(paidSnap);

        // clear carts + table state
        setCart([]);
        setMarketCart([]);
        if (activeTable) {
          setTables(tables.map(t => t.id === activeTable.id ? { ...t, status: "free", waiter: undefined, total: 0 } : t));
          setActiveTable(null);
        }
        return;
      }

      // Offline / disconnected path (or BC error thrown)
      const doPrint = confirm(`(Offline) Recorded payment ${fmt(grand)} via ${method}.\nPrint receipt now?`);
      if (doPrint) printNow(paidSnap);
      alert("(Offline) Will sync later.");
    } catch (e) {
      console.error(e);
      alert(`BC post failed: ${e.message}. Keeping payment local. You can print and sync later.`);
      // local snapshot + print prompt
      const paidSnap = {
        saleNo,
        dateISO: new Date().toISOString(),
        method,
        tableName: activeTable?.name || "",
        customer,
        restaurantLines: cart,
        marketLines: attachMarket ? marketCart : [],
        rTotals,
        mTotals,
        grand,
      };
      const doPrint = confirm(`(BC error) Recorded payment ${fmt(grand)} via ${method} locally.\nPrint receipt now?`);
      if (doPrint) printNow(paidSnap);
    }
  };

  // ---------- Screens ----------
  const screens = [
    { key: "Architecture", label: "Architecture", icon: <Building2 className="w-4 h-4" /> },
    { key: "Tables", label: "POS (Tables)", icon: <TableProperties className="w-4 h-4" /> },
    { key: "Order", label: "Order Entry", icon: <UtensilsCrossed className="w-4 h-4" /> },
    { key: "Market", label: "Market (Attach)", icon: <ShoppingCart className="w-4 h-4" /> },
    { key: "Payments", label: "Payments", icon: <CreditCard className="w-4 h-4" /> },
    { key: "Reports", label: "Admin › Reports", icon: <Receipt className="w-4 h-4" /> },
    { key: "Menu", label: "Admin › Menu", icon: <Pizza className="w-4 h-4" /> },
    { key: "Inventory", label: "Admin › Inventory", icon: <Wine className="w-4 h-4" /> },
    { key: "Staff", label: "Admin › Staff", icon: <Users2 className="w-4 h-4" /> },
    { key: "Settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
    // { key: "KDS", label: "Kitchen (KDS)", icon: <UtensilsCrossed className="w-4 h-4" /> }, // if you added KDS earlier
  ];

  const StatusBar = () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge intent="info">{location}</Badge>
      {online ? (
        <Badge intent="success" title="Online">
          <span className="inline-flex items-center gap-1"><Cloud className="w-4 h-4" /> Online</span>
        </Badge>
      ) : (
        <Badge intent="danger"><span className="inline-flex items-center gap-1"><CloudOff className="w-4 h-4" /> Offline</span></Badge>
      )}
      {bcConnected ? (
        <Badge intent="success"><span className="inline-flex items-center gap-1"><CloudUpload className="w-4 h-4" /> BC Sync OK</span></Badge>
      ) : (
        <Badge intent="warning"><span className="inline-flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> BC Disconnected</span></Badge>
      )}
      {loadingBC && <Badge intent="info"><span className="inline-flex items-center gap-1"><RefreshCw className="w-4 h-4 animate-spin" /> Loading BC</span></Badge>}
      {bcError && <Badge intent="danger" title={bcError}>BC Error</Badge>}
    </div>
  );

  const refreshBC = async () => {
    try {
      setLoadingBC(true);
      setBcError("");
      const fresh = await loadBcItems();
      setBcRestaurant(fresh.restaurant);
      setBcMarket(fresh.market);
      localStorage.setItem("BC_ITEMS_CACHE_V1", JSON.stringify({ restaurant: fresh.restaurant, market: fresh.market }));
      setBcConnected(true);
      alert("Loaded items from BC");
    } catch (e) {
      setBcConnected(false);
      setBcError(e.message || "Failed");
      alert(`Failed to refresh from BC: ${e.message}`);
    } finally {
      setLoadingBC(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800">
      {/* === PRINT CONTAINER (hidden on screen) === */}
      <div id="print-container" style={{ position: "absolute", left: -99999, top: -99999 }}>
        <PrintStyles />
        <PrintableReceipt data={lastReceipt} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white grid place-items-center font-bold">POS</div>
            <div>
              <h1 className="text-lg font-semibold">Robertos Cafe</h1>
              <p className="text-xs text-slate-500">Items & posting via Microsoft Business Central</p>
            </div>
          </div>
          <StatusBar />
        </div>
        {/* Nav */}
        <div className="border-t border-slate-200 overflow-x-auto">
          <div className="max-w-7xl mx-auto px-2 py-2 flex gap-2">
            {screens.map((s) => (
              <Pill key={s.key} active={screen === s.key} onClick={() => setScreen(s.key)} icon={s.icon} label={s.label} />
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {screen === "Architecture" && <Architecture />}

        {screen === "Tables" && (
          <div className="grid md:grid-cols-3 gap-6">
            <Card title="Table Map" icon={<TableProperties className="w-5 h-5" />} right={<Badge>{tables.filter(t => t.status !== "free").length} active</Badge>} className="md:col-span-2">
              <div className="grid grid-cols-4 gap-3">
                {tables.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setActiveTable(t); setScreen("Order"); }}
                    className={`rounded-2xl p-3 text-left border transition shadow-sm hover:shadow ` +
                      (t.status === "occupied" ? "bg-rose-50 border-rose-200" : t.status === "reserved" ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{t.name}</span>
                      <Badge intent={t.status === "occupied" ? "danger" : t.status === "reserved" ? "warning" : "default"}>{t.status}</Badge>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Seats: {t.seats}</div>
                    {t.total > 0 && <div className="text-sm mt-2 font-medium">{fmt(t.total)}</div>}
                  </button>
                ))}
              </div>
            </Card>

            <Card title="Customer (Walk-in / Table)" icon={<Users2 className="w-5 h-5" />}>
              <div className="grid gap-2 text-sm">
                <label className="grid gap-1">
                  <span>Name</span>
                  <input className="border rounded-xl px-3 py-2" placeholder="Customer name" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} />
                </label>
                <label className="grid gap-1">
                  <span>Phone</span>
                  <input className="border rounded-xl px-3 py-2" placeholder="07..." value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} />
                </label>
                <label className="grid gap-1">
                  <span>BC Customer No</span>
                  <input className="border rounded-xl px-3 py-2" placeholder="e.g., C000123 or WALKIN" value={customer.bcNo} onChange={e => setCustomer({ ...customer, bcNo: e.target.value })} />
                </label>
                <div className="flex items-center gap-2 mt-2">
                  <input id="attach" type="checkbox" checked={attachMarket} onChange={e => setAttachMarket(e.target.checked)} />
                  <label htmlFor="attach" className="text-sm">Attach Market bill to this customer</label>
                </div>
              </div>
            </Card>
          </div>
        )}

        {screen === "Order" && (
          <div className="grid lg:grid-cols-[220px_1fr_360px] gap-6">
            {/* Categories */}
            <Card title="Categories (BC Restaurant Items)" icon={<UtensilsCrossed className="w-5 h-5" />}>
              <div className="grid gap-2">
                {categories.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCat(c.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition ` +
                      (cat === c.id ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 hover:bg-slate-50")}
                  >
                    {c.icon}
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </Card>

            {/* Items from BC (Restaurant) */}
            <Card title={`Items – ${categories.find(x => x.id === cat)?.name ?? ""} (BC)`} icon={<UtensilsCrossed className="w-5 h-5" />}
              right={<button onClick={refreshBC} className="inline-flex items-center gap-1 text-xs border rounded-full px-2 py-1"><RefreshCw className="w-3 h-3" /> Sync</button>}
            >
              {loadingBC && <div className="text-sm text-slate-500 mb-2">Loading menu from BC…</div>}
              {bcError && <div className="text-sm text-rose-600 mb-2">Error: {bcError}</div>}

              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredMenu.map(item => (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    key={item.bcId}
                    onClick={() => addToCart(item)}
                    className="group border border-slate-200 hover:border-slate-300 rounded-2xl p-3 text-left bg-white hover:shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{item.name}</div>
                      <Badge>{fmt(item.price)}</Badge>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Tap to add</div>
                  </motion.button>
                ))}
                {filteredMenu.length === 0 && (
                  <div className="col-span-full text-sm text-slate-500">No items in this category from BC.</div>
                )}
              </div>
            </Card>

            {/* Restaurant Cart */}
            <Card title={`Restaurant Cart ${activeTable ? `— ${activeTable.name}` : ""}`} icon={<Receipt className="w-5 h-5" />}
                  right={<Badge intent="info">{cart.reduce((s, x) => s + x.qty, 0)} items</Badge>}>
              <div className="grid gap-3">
                {cart.length === 0 && <div className="text-sm text-slate-500">No items yet. Tap items to add.</div>}
                {cart.map((c, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{c.name}</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => changeQty(i, -1)} className="px-2 py-1 rounded-lg border">-</button>
                        <span>{c.qty}</span>
                        <button onClick={() => changeQty(i, +1)} className="px-2 py-1 rounded-lg border">+</button>
                        <button onClick={() => removeFromCart(i)} className="p-1 rounded-lg border"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">KSh {c.price} each</div>

                    {/* Example modifiers placeholder (not from BC yet) */}
                    {false && (
                      <>
                        <div className="mt-2 text-xs text-slate-600">Modifiers:</div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {(c.mods || []).map(mod => {
                            const selected = c.mods.includes(mod);
                            return (
                              <button
                                key={mod}
                                onClick={() => {
                                  const next = selected ? c.mods.filter(x => x !== mod) : [...c.mods, mod];
                                  setItemMods(i, next);
                                }}
                                className={`px-2 py-1 rounded-full border text-xs ` + (selected ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200")}
                              >{mod}</button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* Restaurant Totals */}
                <div className="border-t pt-3 text-sm grid gap-1">
                  <Row left="R • Subtotal" right={fmt(rTotals.sub)} />
                  <Row left="R • Service (5%)" right={fmt(rTotals.service)} />
                  <Row left="R • VAT (16%)" right={fmt(rTotals.vat)} />
                  <div className="flex justify-between font-semibold text-slate-900"><span>R • Total</span><span>{fmt(rTotals.total)}</span></div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button onClick={sendToKitchen} className="rounded-xl bg-slate-900 text-white py-2">Send to Kitchen</button>
                  <button onClick={() => setScreen("Payments")} className="rounded-xl border border-slate-300 py-2">Checkout</button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {screen === "Market" && (
          <div className="grid lg:grid-cols-[1fr_380px] gap-6">
            <Card
              title="Attach Market Items to Customer (BC)"
              icon={<ShoppingCart className="w-5 h-5" />}
              right={
                <div className="flex items-center gap-2">
                  <input id="attach2" type="checkbox" checked={attachMarket} onChange={e => setAttachMarket(e.target.checked)} />
                  <label htmlFor="attach2" className="text-sm">Attach to bill</label>
                </div>
              }
            >
              {/* Context: which table are we adding to */}
              <div className="mb-2">
                <Badge intent={activeTable ? "info" : "warning"}>
                  {activeTable ? `Adding to: ${activeTable.name}` : "No table selected — will attach to customer"}
                </Badge>
              </div>

              {/* Search / Scan (barcode or name) */}
              <div className="mb-3 grid gap-1">
                <label className="text-xs text-slate-500">Scan barcode or type item name/number, then press Enter</label>
                <input
                  ref={scanRef}
                  value={marketQuery}
                  onChange={(e) => setMarketQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleMarketEnter()}
                  className="border rounded-xl px-3 py-2"
                  placeholder="e.g. GTIN or 'milk'"
                />
              </div>

              {/* Quick results from BC market list */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(marketQuery
                  ? bcMarket.filter(p => {
                      const q = marketQuery.toLowerCase();
                      return (p.sku || "").includes(marketQuery) || (p.name || "").toLowerCase().includes(q) || (p.number || "").toLowerCase().includes(q);
                    })
                  : bcMarket
                ).map(p => (
                  <button key={p.bcId} onClick={() => addMarketItem(p)} className="border rounded-2xl p-3 text-left hover:bg-slate-50">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.sku || p.number}</div>
                    <div className="mt-1 font-semibold">{fmt(p.price)}</div>
                    <div className="text-[11px] text-slate-400 mt-1">Tap to add</div>
                  </button>
                ))}
                {marketQuery &&
                  bcMarket.filter(p =>
                    (p.sku || "").includes(marketQuery) ||
                    (p.name || "").toLowerCase().includes(marketQuery.toLowerCase()) ||
                    (p.number || "").toLowerCase().includes(marketQuery.toLowerCase())
                  ).length === 0 && (
                    <div className="text-sm text-slate-500 col-span-full">No matches from BC. Try another name or barcode.</div>
                )}
              </div>
            </Card>

            <Card title="Market Cart" icon={<Receipt className="w-5 h-5" />} right={<Badge intent="info">{marketCart.reduce((s, x) => s + x.qty, 0)} items</Badge>}>
              {marketCart.length === 0 && <div className="text-sm text-slate-500">No market items yet.</div>}
              <div className="grid gap-2">
                {marketCart.map(l => (
                  <div key={l.sku || l.bcId} className="border rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-slate-500">{l.sku || l.number}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeMarketQty(l.sku, -1)} className="px-2 py-1 rounded-lg border">-</button>
                      <span>{l.qty}</span>
                      <button onClick={() => changeMarketQty(l.sku, +1)} className="px-2 py-1 rounded-lg border">+</button>
                      <button onClick={() => removeMarketItem(l.sku)} className="px-2 py-1 rounded-lg border"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-3 mt-3 text-sm grid gap-1">
                <Row left="M • Subtotal" right={fmt(mTotals.sub)} />
                <Row left="M • VAT (16%)" right={fmt(mTotals.vat)} />
                <div className="flex justify-between font-semibold text-slate-900"><span>M • Total</span><span>{fmt(mTotals.total)}</span></div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button onClick={() => setMarketCart([])} className="rounded-xl border py-2">Clear</button>
                <button onClick={() => setScreen("Payments")} className="rounded-xl bg-slate-900 text-white py-2">Go to Checkout</button>
              </div>
            </Card>
          </div>
        )}

        {screen === "Payments" && (
          <div className="grid lg:grid-cols-[1fr_420px] gap-6">
            <Card title="Bill (Restaurant + Market)" icon={<CreditCard className="w-5 h-5" />}>
              <CombinedBillTable
                restaurantLines={cart}
                marketLines={attachMarket ? marketCart : []}
                onMinusRestaurant={(i) => changeQty(i, -1)}
                onPlusRestaurant={(i) => changeQty(i, +1)}
                onRemoveRestaurant={(i) => removeFromCart(i)}
                onMinusMarket={(sku) => changeMarketQty(sku, -1)}
                onPlusMarket={(sku) => changeMarketQty(sku, +1)}
                onRemoveMarket={(sku) => removeMarketItem(sku)}
              />

              <div className="text-sm grid gap-1 mt-4">
                <Row left="Restaurant Total" right={fmt(rTotals.total)} />
                <Row left="Market Attached" right={attachMarket ? fmt(mTotals.total) : "KSh 0"} />
                <div className="flex justify-between text-lg font-semibold pt-1 border-t mt-2">
                  <span>Grand Total</span><span>{fmt(grand)}</span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2 mt-4">
                <button onClick={() => checkoutAll("M-Pesa (STK)")} className="rounded-xl border p-3 text-left hover:bg-slate-50">
                  M-Pesa (STK Push)
                </button>
                <button onClick={() => checkoutAll("Card (NFC)")} className="rounded-xl border p-3 text-left hover:bg-slate-50">
                  Card (NFC / Chip)
                </button>
                <button onClick={() => checkoutAll("Cash")} className="rounded-xl border p-3 text-left hover:bg-slate-50">
                  Cash
                </button>
                <button onClick={() => checkoutAll("Voucher")} className="rounded-xl border p-3 text-left hover:bg-slate-50">
                  Gift / Voucher
                </button>
              </div>

              {/* Preview + Proforma print */}
              <div className="grid sm:grid-cols-2 gap-2 mt-3">
                <button onClick={() => setShowPreview((v) => !v)} className="rounded-xl border p-2 text-sm hover:bg-slate-50">
                  {showPreview ? "Hide Preview" : "Preview Receipt"}
                </button>
                <button onClick={() => printNow()} className="rounded-xl border p-2 text-sm hover:bg-slate-50">
                  Print Receipt (Proforma)
                </button>
              </div>

              {showPreview && (
                <div className="mt-3 border rounded-xl bg-white p-3">
                  <PrintableReceipt
                    data={{
                      saleNo: genSaleNo(),
                      dateISO: new Date().toISOString(),
                      method: "(Proforma)",
                      tableName: activeTable?.name || "",
                      customer,
                      restaurantLines: cart,
                      marketLines: attachMarket ? marketCart : [],
                      rTotals,
                      mTotals,
                      grand,
                    }}
                  />
                </div>
              )}

              <div className="text-xs text-slate-500 mt-3">
                Payment is one; posting to BC is split by channel (Restaurant vs Market).
              </div>
            </Card>

            <Card title="Customer" icon={<Users2 className="w-5 h-5" />}>
              <div className="grid gap-2 text-sm">
                <label className="grid gap-1">
                  <span>Name</span>
                  <input className="border rounded-xl px-3 py-2" placeholder="Customer name" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} />
                </label>
                <label className="grid gap-1">
                  <span>Phone</span>
                  <input className="border rounded-xl px-3 py-2" placeholder="07..." value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} />
                </label>
                <label className="grid gap-1">
                  <span>BC Customer No</span>
                  <input className="border rounded-xl px-3 py-2" placeholder="e.g., C000123 or WALKIN" value={customer.bcNo} onChange={e => setCustomer({ ...customer, bcNo: e.target.value })} />
                </label>
                <div className="flex items-center gap-2 mt-2">
                  <input id="attach3" type="checkbox" checked={attachMarket} onChange={e => setAttachMarket(e.target.checked)} />
                  <label htmlFor="attach3" className="text-sm">Attach Market bill to this customer</label>
                </div>
              </div>
            </Card>
          </div>
        )}

        {screen === "Reports" && <Reports />}
        {screen === "Menu" && <MenuAdmin bcRestaurant={bcRestaurant} />}
        {screen === "Inventory" && <InventoryAdmin />}
        {screen === "Staff" && <StaffAdmin />}
        {screen === "Settings" && (
          <SettingsAdmin
            online={online} setOnline={setOnline}
            bcConnected={bcConnected} setBcConnected={setBcConnected}
            location={location} setLocation={setLocation}
            refreshBC={refreshBC} loadingBC={loadingBC}
          />
        )}
      </main>
    </div>
  );
}

// ---------- Sub-screens ----------
function Architecture() {
  const Box = ({ title, children, className = "" }) => (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="font-semibold text-slate-800 mb-1">{title}</div>
      <div className="text-sm text-slate-600">{children}</div>
    </div>
  );

  return (
    <div className="grid gap-6">
      <div className="grid md:grid-cols-3 gap-6">
        <Box title="Frontline Devices">
          • Waiter Tablets (Web/PWA) – order entry, tableside payment
          <br />• KDS Screens (Kitchen/Bar)
          <br />• Payment Terminals (Card, NFC, M-Pesa STK push)
        </Box>
        <Box title="API Gateway & App Server">
          • GraphQL/REST for POS & KDS
          <br />• Auth (JWT/OAuth) + Rate limiting
          <br />• Event bus for tickets & status updates
        </Box>
        <Box title="Business Central Connector">
          • Items & prices from BC
          <br />• Split posting (Restaurant/Market)
          <br />• Inventory decrement & cost posting in BC
        </Box>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Box title="Datastore & Caching">
          • PostgreSQL (primary)
          <br />• Redis (sessions, hot cache)
          <br />• Object storage (receipts, exports)
        </Box>
        <Box title="Messaging & Realtime">
          • WebSockets/SSE for POS ↔ KDS
          <br />• Queue (e.g., NATS/RabbitMQ) for orders
          <br />• Outbox pattern for BC sync
        </Box>
        <Box title="Analytics Pipeline">
          • ETL to Warehouse (e.g., BigQuery/Snowflake)
          <br />• Dashboards (Looker/Power BI)
        </Box>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Box title="Online & Delivery">
          • QR/Table ordering & Web checkout
          <br />• Aggregators (UberEats/Glovo) integration
          <br />• Unified order queue → KDS
        </Box>
        <Box title="Security & Compliance">
          • RBAC & audit logs
          <br />• PCI DSS (payments), GDPR
          <br />• Offline mode with secure sync
        </Box>
        <Box title="Devices & Printing">
          • Receipt & kitchen printers
          <br />• Cash drawer control
          <br />• Label printers (takeaway)
        </Box>
      </div>

      <Card title="Data Flow (High Level)" icon={<Building2 className="w-5 h-5" />}>
        <div className="text-sm grid gap-2">
          <div>1) <b>Items & Prices</b> come from <b>Microsoft BC</b> → cached in POS for speed.</div>
          <div>2) <b>Restaurant Orders</b> created on tablet → KDS tickets.</div>
          <div>3) <b>Market Items</b> scanned/added under same customer, visible on one bill.</div>
          <div>4) On <b>checkout</b>, payment captured once → <b>two BC sales invoices</b> (Restaurant + Market).</div>
        </div>
      </Card>
    </div>
  );
}

function Reports() {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card title="Sales (Last 7 Days)" icon={<Receipt className="w-5 h-5" />}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sampleSales} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="sales" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Top Items" icon={<Pizza className="w-5 h-5" />}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={topItems} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                {topItems.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Orders vs Labor (hrs)" icon={<Users2 className="w-5 h-5" />} className="lg:col-span-2">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sampleSales}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="orders" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function MenuAdmin({ bcRestaurant = [] }) {
  // Show whatever is currently loaded from BC (read-only list)
  const items = bcRestaurant;

  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCat, setNewCat] = useState("pizza");

  const add = () => {
    alert("In BC mode, manage items inside Business Central. (You can wire this to POST /items)");
  };

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6">
      <Card title="Menu Items (from BC)" icon={<Pizza className="w-5 h-5" />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Name</th>
                <th>BC Number</th>
                <th>Price</th>
                <th className="text-right">Channel</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.bcId} className="border-b last:border-b-0">
                  <td className="py-2">{it.name}</td>
                  <td>{it.number}</td>
                  <td>{fmt(it.price)}</td>
                  <td className="text-right">{it.channel}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={4} className="py-3 text-slate-500">No BC items loaded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Add New Item (BC-managed)" icon={<Plus className="w-5 h-5" />}>
        <div className="grid gap-2 text-sm">
          <label className="grid gap-1">
            <span>Name</span>
            <input value={newName} onChange={e => setNewName(e.target.value)} className="border rounded-xl px-3 py-2" placeholder="Item name" />
          </label>
          <label className="grid gap-1">
            <span>Price</span>
            <input value={newPrice} onChange={e => setNewPrice(e.target.value)} type="number" className="border rounded-xl px-3 py-2" placeholder="0" />
          </label>
          <label className="grid gap-1">
            <span>Category (UI only)</span>
            <select value={newCat} onChange={e => setNewCat(e.target.value)} className="border rounded-xl px-3 py-2">
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button onClick={add} className="mt-2 rounded-xl bg-slate-900 text-white py-2">Save</button>
          <div className="text-xs text-slate-500">This demo is read-only from BC. Create/edit items in Business Central, then press “Sync”.</div>
        </div>
      </Card>
    </div>
  );
}

function InventoryAdmin() {
  const stock = [
    { sku: "ITM-001", name: "Pizza Dough (kg)", onHand: 18, par: 25 },
    { sku: "ITM-002", name: "Tomato Sauce (L)", onHand: 9, par: 15 },
    { sku: "ITM-003", name: "Mozzarella (kg)", onHand: 6, par: 12 },
    { sku: "ITM-004", name: "Chicken Breast (kg)", onHand: 4, par: 10 },
  ];
  return (
    <Card title="Inventory Levels (demo)" icon={<Wine className="w-5 h-5" />}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">SKU</th>
              <th>Item</th>
              <th>On Hand</th>
              <th>Par</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {stock.map(s => (
              <tr key={s.sku} className="border-b last:border-b-0">
                <td className="py-2">{s.sku}</td>
                <td>{s.name}</td>
                <td>{s.onHand}</td>
                <td>{s.par}</td>
                <td>{s.onHand < s.par ? <Badge intent="warning">Reorder</Badge> : <Badge intent="success">OK</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-500 mt-2">Wire this to BC item ledger entries if you want live on-hand.</div>
    </Card>
  );
}

function StaffAdmin() {
  const staff = [
    { name: "Anne", role: "Waiter", pin: "1023" },
    { name: "Brian", role: "Manager", pin: "7851" },
    { name: "Grace", role: "Chef", pin: "2244" },
  ];
  return (
    <Card title="Staff & Roles (RBAC)" icon={<Users2 className="w-5 h-5" />}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Name</th>
              <th>Role</th>
              <th>Login</th>
              <th>Permissions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.name} className="border-b last:border-b-0">
                <td className="py-2">{s.name}</td>
                <td>{s.role}</td>
                <td>PIN • {s.pin}</td>
                <td>{s.role === "Manager" ? "All" : s.role === "Chef" ? "KDS" : "Tables, Orders"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SettingsAdmin({ online, setOnline, bcConnected, setBcConnected, location, setLocation, refreshBC, loadingBC }) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card title="Locations & Devices" icon={<Building2 className="w-5 h-5" />}>
        <label className="grid gap-1 text-sm">
          <span>Active Location</span>
          <input value={location} onChange={e => setLocation(e.target.value)} className="border rounded-xl px-3 py-2" />
        </label>
        <div className="mt-3 flex items-center gap-2">
          <input id="online" type="checkbox" checked={online} onChange={e => setOnline(e.target.checked)} />
          <label htmlFor="online" className="text-sm">Online Mode (auto-sync)</label>
        </div>
      </Card>
      <Card title="Microsoft BC Integration" icon={<CloudUpload className="w-5 h-5" />}>
        <div className="text-sm">Status: {bcConnected ? <Badge intent="success">Connected</Badge> : <Badge intent="warning">Disconnected</Badge>}</div>
        <div className="grid sm:grid-cols-2 gap-2 mt-3">
          <button className="rounded-xl border px-3 py-2" onClick={() => alert("Pinged BC OK (stub)")}>Test Connection</button>
          <button className="rounded-xl border px-3 py-2" onClick={refreshBC} disabled={loadingBC}>
            {loadingBC ? "Syncing…" : "Sync Menu & Prices"}
          </button>
          <button className="rounded-xl border px-3 py-2" onClick={() => alert("Posted sample to BC (stub)")}>Post Sample Sales Day</button>
          <button className="rounded-xl border px-3 py-2" onClick={() => alert("Mapped taxes & GL codes (stub)")}>Map Taxes & GL Codes</button>
        </div>
        <div className="text-xs text-slate-500 mt-3">
          For production: route calls via your backend proxy (handles OAuth client credentials → Bearer token; avoids CORS).
        </div>
      </Card>
    </div>
  );
}
