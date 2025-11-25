// src/App.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { io } from "socket.io-client";
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
  AlertTriangle,
  Trash2,
} from "lucide-react";
// ========================= Bridge API helper =========================
// Put this near the top of App.jsx, after the imports

// Base URL of the bridge.
// - In dev: leave VITE_BRIDGE_URL empty → calls go to http://localhost:5050
// - In prod (Netlify): set VITE_BRIDGE_URL to "https://pos-bridge.onrender.com"

const BRIDGE_URL =
  import.meta.env.VITE_BRIDGE_URL ||
  (window.location.hostname.endsWith("netlify.app")
    ? "https://robertos-pos.onrender.com"   // Render bridge
    : "http://localhost:5050");             // Local dev


// Build a full URL to the bridge
export function bridgeUrl(path) {
  if (!BRIDGE_URL) return path;              // dev mode → relative URL
  if (path.startsWith("http")) return path;  // already full
  return `${BRIDGE_URL}${path}`;
}

// Small convenience wrapper for fetch that always goes via the bridge
export function apiFetch(path, options = {}) {
  return fetch(bridgeUrl(path), {
    credentials: options.credentials ?? "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
}



/* ========================= UI helpers ========================= */
const Badge = ({ children, intent = "default" }) => (
  <span
    className={
      "px-2 py-1 text-xs rounded-full whitespace-nowrap " +
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
  <div
    className={
      "bg-white/90 backdrop-blur border border-slate-100 shadow-sm rounded-2xl p-4 " +
      className
    }
  >
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

const Pill = ({ active, onClick, icon, label, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={
      "flex items-center gap-2 px-4 py-2 rounded-full border text-sm transition " +
      (disabled
        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
        : active
        ? "bg-slate-900 text-white border-slate-900 shadow"
        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")
    }
  >
    {icon}
    <span>{label}</span>
  </button>
);

const Row = ({ left, right }) => (
  <div className="flex justify-between">
    <span>{left}</span>
    <span>{right}</span>
  </div>
);

/* ========================= Money & Tax ========================= */
const R_SERVICE = 0.05;
const R_CATERING = 0.02;
const VAT = 0.16;
const fmt = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE")}`;

/* ========================= Tables ========================= */
const initialTables = Array.from({ length: 16 }).map((_, i) => ({
  id: i + 1,
  name: `T${i + 1}`,
  seats: (i % 4) + 2,
  status: "free",
  waiter: undefined,
  total: 0,
  cart: [],
  splits: ["Main"],
  defaultPayer: "Main",
}));

/* ========================= Helpers ========================= */
function calcRestaurantTotals(cart) {
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const service = Math.round(sub * R_SERVICE);
  const catering = Math.round(sub * R_CATERING);
  const vatBase = sub + service + catering;
  const vat = Math.round(vatBase * VAT);
  const total = sub + service + catering + vat;
  return { sub, service, catering, vat, total };
}
function groupByPayer(lines) {
  const map = new Map();
  const ensure = (p) => {
    if (!map.has(p)) map.set(p, []);
    return map.get(p);
  };
  (lines || []).forEach((l) => ensure(l.payer || "Main").push(l));
  return map;
}
const genSaleNo = () => String(Date.now()).slice(-8);

/* ---- Idempotency helpers (avoid double posting) ---- */
const SENT_KEY = "pos.sentSales";
function getSent() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SENT_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function saveSent(set) {
  try {
    const arr = Array.from(set).slice(-100); // keep last 100
    sessionStorage.setItem(SENT_KEY, JSON.stringify(arr));
  } catch {}
}

const PrintStyles = () => (
  <style>
    {`
    @media print {
      #print-receipt-root {
        width: 80mm;
        padding: 8px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 11px;
      }
    }
  `}
  </style>
);


function PrintableReceipt({ receipt }) {
  if (!receipt) return null;
  const { saleNo, dateISO, method, tableName, customer, restaurantLines, rTotals } =
    receipt;

  return (
    <div id="print-receipt-root">
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: "bold" }}>GOURMET MASTER</div>
        <div style={{ fontSize: 10 }}>Dining Hall</div>
      </div>

      <div style={{ fontSize: 10, marginBottom: 8 }}>
        <div>Receipt: {saleNo}</div>
        <div>Date: {new Date(dateISO).toLocaleString()}</div>
        {tableName && <div>Table: {tableName}</div>}
        {customer?.name && <div>Customer: {customer.name}</div>}
      </div>

      <hr />
      <table style={{ width: "100%", fontSize: 10, marginTop: 4 }}>
        <tbody>
          {restaurantLines.map((l, idx) => (
            <tr key={idx}>
              <td style={{ width: "60%" }}>
                {l.name}
                {l.qty > 1 ? ` x${l.qty}` : ""}
              </td>
              <td style={{ textAlign: "right", width: "40%" }}>
                {fmt(l.price * l.qty)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />

      <div style={{ fontSize: 10, marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Subtotal</span>
          <span>{fmt(rTotals.sub)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Service (5%)</span>
          <span>{fmt(rTotals.service)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Catering (2%)</span>
          <span>{fmt(rTotals.catering)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>VAT (16%)</span>
          <span>{fmt(rTotals.vat)}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 4,
            fontWeight: "bold",
          }}
        >
          <span>Total</span>
          <span>{fmt(rTotals.total)}</span>
        </div>
        <div style={{ marginTop: 6 }}>Paid via: {method || "(proforma)"}</div>
      </div>

      <div style={{ marginTop: 8, textAlign: "center", fontSize: 9 }}>
        Thank you &amp; welcome again.
      </div>
    </div>
  );
}


/* ========================= Category icon mapper ========================= */
const catIcon = (name) => {
  const key = String(name || "").toLowerCase();
  if (key.includes("pizza")) return <Pizza className="w-4 h-4" />;
  if (key.includes("coffee") || key.includes("tea"))
    return <Coffee className="w-4 h-4" />;
  if (key.includes("soup")) return <Soup className="w-4 h-4" />;
  if (key.includes("sandwich")) return <Sandwich className="w-4 h-4" />;
  if (key.includes("drink") || key.includes("wine") || key.includes("bar"))
    return <Martini className="w-4 h-4" />;
  return <UtensilsCrossed className="w-4 h-4" />;
};

/* ============ Normalizer for BC items ============ */
function normalizeItem(it) {
  const category =
    it.categoryId ??
    it.category ??
    it.itemCategoryCode ??
    it.categoryCode ??
    it.itemCategory ??
    "UNCATEGORIZED";
  const rawStock =
    it.inventory ??
    it.Inventory ??
    it.stock ??
    it.qty ??
    it.quantity ??
    it.inStock ??
    it.remainingQuantity;

  return {
    id: it.id || it.number || it.no || it.No || String(it.code || it.name),
    name: it.name || it.displayName || it.description || it.number || it.id,
    price: Number(it.unitPrice ?? it.price ?? 0),
    categoryId: String(category),
    gtin: it.gtin || it.GTIN || it.barcode || "",
    stock: rawStock == null ? null : Number(rawStock),
    hasStockData: rawStock != null,
    mods: it.mods || [],
    bcItemId: it.bcItemId || it.itemId || null,
  };
}

/* ========================= Default BC Customer storage ========================= */
const getSavedDefaultCustomerNo = () => {
  try {
    return localStorage.getItem("bc.defaultCustomerNo") || "";
  } catch {
    return "";
  }
};
const setSavedDefaultCustomerNo = (no) => {
  try {
    localStorage.setItem("bc.defaultCustomerNo", (no || "").trim());
  } catch {}
};

/* =========================================================
   Auth Gate
========================================================= */
export default function POSApp() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(bridgeUrl("/auth/me"), { credentials: "include" });
        if (r.ok) {
          const j = await r.json();
          setUser(j.user);
        }
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  if (!authReady) return <div style={{ padding: 20 }}>Loading…</div>;
  if (!user) return <LoginScreen onLoggedIn={setUser} />;

  return <AuthedPOSApp user={user} onLogout={() => setUser(null)} />;
}

/* =========================================================
   MAIN APP
========================================================= */
function AuthedPOSApp({ user, onLogout }) {
  const [online, setOnline] = useState(true);
  const [bcConnected, setBcConnected] = useState(true);
  const [location, setLocation] = useState("Main Branch – Dining Hall");
  const [screen, setScreen] = useState("POS"); // SINGLE main page

  const [categories, setCategories] = useState([]);
  const [menu, setMenu] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [menuError, setMenuError] = useState("");

  const [cat, setCat] = useState(null);

  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: "", phone: "", bcNo: "" });

  const [tickets, setTickets] = useState([]);
  const [tables, setTables] = useState(initialTables);
  const [activeTable, setActiveTable] = useState(null);

  // Printer status (real bridge->printer check)
  const [printerConnected, setPrinterConnected] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);

  // Prevent double posting
  const [isPaying, setIsPaying] = useState(false);

  // Splits
  const [splits, setSplits] = useState(["Main"]);
  const [defaultPayer, setDefaultPayer] = useState("Main");

  // Search
  const [q, setQ] = useState("");
  const searchRef = useRef(null);

  // Socket.IO (browser <-> bridge)
  const socketRef = useRef(null);
  const [socketOk, setSocketOk] = useState(false);

  /* -------- Load persisted POS state -------- */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(bridgeUrl("/pos/state"), { credentials: "include" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const s = await r.json();
        setTables(s.tables || initialTables);
        setTickets(s.tickets || []);
      } catch (e) {
        console.warn("Failed to load POS state:", e);
      }
    })();
  }, []);

  /* -------- Load BC categories + items -------- */
  useEffect(() => {
    let alive = true;
    async function loadMenu() {
      setLoadingMenu(true);
      setMenuError("");
      try {
        let r = await fetch(bridgeUrl("/bc/menu"), { credentials: "include" });
        let items = [];
        let cats = [];

        if (r.ok) {
          const raw = await r.json();
          if (raw?.items && raw?.categories) {
            items = raw.items.map(normalizeItem);
            cats = (raw.categories || []).map((c) => ({
              id: String(c.id || c.code),
              name: c.name || c.displayName || c.code,
            }));
          }
        } else if (r.status === 404) {
          // Fallback: /bc/items
          r = await fetch(bridgeUrl("/bc/items"), { credentials: "include" });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const raw = await r.json();
          const bcItems = Array.isArray(raw)
            ? raw
            : Array.isArray(raw?.value)
            ? raw.value
            : [];
          const catMap = new Map();
          items = bcItems.map((it) => {
            const x = normalizeItem({
              ...it,
              name: it.displayName || it.description || it.number,
              id: it.number,
            });
            if (!catMap.has(x.categoryId))
              catMap.set(x.categoryId, {
                id: String(x.categoryId),
                name: String(x.categoryId),
              });
            return x;
          });
          cats = Array.from(catMap.values());
        } else {
          throw new Error(`Menu load failed (HTTP ${r.status})`);
        }

        // Fetch live stock (best-effort)
        let stockMap = {};
        try {
          const s = await fetch(bridgeUrl("/bc/stock"), { credentials: "include" });
          if (s.ok) stockMap = await s.json();
        } catch (e) {
          console.warn("BC stock error:", e);
        }

        const catsWithIcons = (cats || []).map((c) => ({
          ...c,
          icon: catIcon(c.name),
        }));
        const merged = items.map((it) => {
          const key = it.id || it.number || it.no || it.No;
          const qty = Number(
            stockMap[key] ?? stockMap[it.id] ?? stockMap[it.number] ?? NaN
          );
          const hasStockData = Number.isFinite(qty);
          return {
            ...it,
            stock: hasStockData ? qty : it.stock,
            hasStockData: hasStockData || it.hasStockData,
          };
        });

        if (!alive) return;
        setCategories(catsWithIcons);
        setMenu(merged);
        if (!cat && catsWithIcons.length) setCat(catsWithIcons[0].id);
        setBcConnected(true);
      } catch (e) {
        if (!alive) return;
        console.error(e);
        setMenuError(String(e?.message || e));
        setBcConnected(false);
      } finally {
        if (alive) setLoadingMenu(false);
      }
    }
    loadMenu();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

/* -------- Socket connect -------- */
useEffect(() => {
  const s = io(BRIDGE_URL || window.location.origin, {
    path: "/socket.io",
    transports: ["websocket"],
    withCredentials: true,
  });
  socketRef.current = s;

  s.on("connect", () => setSocketOk(true));
  s.on("disconnect", () => setSocketOk(false));

  s.on("pos/state", (snap) => {
    if (snap?.tables) setTables(snap.tables);
    if (snap?.tickets) setTickets(snap.tickets);
  });

  s.on("print-status", (m) => console.log("Print status:", m));

  return () => {
    s.close();
    socketRef.current = null;
  };
}, []);

 



  /* -------- Poll printer status from bridge -------- */
  useEffect(() => {
    let stop = false;
    async function ping() {
      try {
        const r = await fetch(bridgeUrl("/health"), { credentials: "include" });
        if (r.ok) {
          const j = await r.json();
          if (!stop) setPrinterConnected(!!j.printerConnected || socketOk);
        }
      } catch {}
      if (!stop) setTimeout(ping, 3000);
    }
    ping();
    return () => {
      stop = true;
    };
  }, [socketOk]);

  /* -------- Derived -------- */
  const searching = q.trim().length > 0;

  const filteredMenu = useMemo(() => {
    if (!searching) {
      return menu.filter((it) => (it.categoryId ?? it.category) === cat);
    }
    const needle = q.trim().toLowerCase();
    const nCompact = needle.replace(/\s+/g, "");
    return menu.filter((it) => {
      const name = String(it.name || "").toLowerCase();
      const id = String(it.id || "").toLowerCase();
      const gtin = String(it.gtin || "").toLowerCase();
      return (
        name.includes(needle) ||
        id.includes(needle) ||
        gtin.replace(/\s+/g, "").includes(nCompact)
      );
    });
  }, [menu, cat, q, searching]);

  const rTotals = useMemo(() => calcRestaurantTotals(cart), [cart]);

  /* -------- Cart ops -------- */
  const addToCart = (item) => {
    if (item.hasStockData && (item.stock ?? 0) <= 0) {
      alert("This item is out of stock.");
      return;
    }
    setCart((prev) => {
      const existing = prev.find(
        (c) =>
          c.id === item.id &&
          c.modsKey === "" &&
          (c.payer || "Main") === defaultPayer
      );
      if (existing)
        return prev.map((c) =>
          c === existing ? { ...c, qty: c.qty + 1 } : c
        );
      return [
        ...prev,
        {
          ...item,
          qty: 1,
          mods: [],
          modsKey: "",
          payer: defaultPayer,
          bcItemId: item.bcItemId || null,
        },
      ];
    });

    // When you start adding items on a free table, mark it occupied
    if (activeTable && activeTable.status === "free") {
      setTables((prev) =>
        prev.map((t) =>
          t.id === activeTable.id ? { ...t, status: "occupied" } : t
        )
      );
    }
  };
  const setItemMods = (idx, mods) => {
    const modsKey = [...mods].sort().join("|");
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, mods, modsKey } : c)));
  };
  const removeFromCart = (idx) =>
    setCart((prev) => prev.filter((_, i) => i !== idx));
  const changeQty = (idx, delta) =>
    setCart((prev) =>
      prev.map((c, i) =>
        i === idx ? { ...c, qty: Math.max(1, c.qty + delta) } : c
      )
    );
  const setRestaurantPayer = (idx, payer) =>
    setCart((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, payer } : c))
    );

  /* -------- KDS / Printing -------- */
  const sendToKitchen = async () => {
    if (!activeTable && cart.length > 0 && !customer.name) {
      alert("Select a table or enter a customer name before sending to kitchen.");
      return;
    }
    if (cart.length === 0) {
      alert("Cart is empty");
      return;
    }

    const items = cart.map((c) => ({
      name: c.name,
      qty: c.qty,
      mods: c.mods || [],
    }));
    const ticket = {
      id: `${Date.now()}`,
      table: activeTable?.name || customer.name || "Walk-in",
      createdAt: new Date().toISOString(),
      status: "NEW",
      items,
      note: "",
    };

    try {
      const r = await fetch(bridgeUrl("/pos/ticket"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ticket),
  
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      alert(`Order sent to KDS & printer (items: ${cart.length})`);
    } catch (e) {
      console.warn("ticket create failed, falling back to local:", e);
      setTickets((prev) => [ticket, ...prev]);
    }

    if (activeTable) {
      setTables((prev) =>
        prev.map((t) =>
          t.id === activeTable.id
            ? { ...t, status: "occupied", waiter: "Anne", total: rTotals.total }
            : t
        )
      );
    }
  };

    const printNow = (payloadSnapshot, { previewOnly = false } = {}) => {
    const data =
      payloadSnapshot || {
        saleNo: genSaleNo(),
        dateISO: new Date().toISOString(),
        method: "(Proforma)",
        tableName: activeTable?.name || "",
        customer,
        restaurantLines: cart,
        rTotals,
        grand: rTotals.total,
      };

    // Save for preview / browser print
    setLastReceipt(data);

    if (previewOnly) {
      // Just open preview modal; no physical printer
      setShowReceiptPreview(true);
      return;
    }

    if (!socketRef.current || !socketRef.current.connected) {
      alert("Printer server not connected. Check the Node bridge URL or network.");
      return;
    }

    socketRef.current?.emit("print-receipt", data, (ack) => {
      console.log("print-receipt ack:", ack);
      if (!ack?.ok) alert(`Receipt print error: ${ack?.error || "no ack"}`);
    });
  };


  /* -------- Resolve BC Customer No -------- */
  async function resolveCustomerNoOrFail(cust) {
    const typed = String(cust?.bcNo || "").trim();
    if (typed) return typed;

    const saved = getSavedDefaultCustomerNo();
    if (saved) return saved;

    const envDefault = String(import.meta.env.VITE_DEFAULT_CUSTOMER || "").trim();
    if (envDefault) return envDefault;

    throw new Error(
      "Missing valid BC Customer No. Set 'BC Customer No' on the customer, or configure VITE_DEFAULT_CUSTOMER (or save one in Settings)."
    );
  }

  /* -------- Post sale to BC -------- */
  async function postSaleToBC(paidSnap) {
    try {
      const customerNo = await resolveCustomerNoOrFail(paidSnap.customer);

      const lines = (paidSnap.restaurantLines || []).map((l) => ({
        lineType: "Item",
        itemId: l.bcItemId ? String(l.bcItemId) : undefined,
        number: !l.bcItemId ? String(l.id) : undefined,
        quantity: Number(l.qty || 1),
        unitPrice: Number(l.price || 0),
      }));

      const payload = {
        customerNo,
        externalDocumentNumber: paidSnap.saleNo,
        postingDate: new Date().toISOString().slice(0, 10),
        lines,
        posMeta: {
          method: paidSnap.method,
          tableName: paidSnap.tableName || "",
          totals: paidSnap.rTotals || {},
        },
      };

      const r = await fetch(bridgeUrl("/bc/invoice?post=true"), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify(payload),
});

      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text}`);
      }

      const j = await r.json();
      setBcConnected(true);
      return { ok: true, data: j };
    } catch (e) {
      setBcConnected(false);
      return { ok: false, error: String(e?.message || e) };
    }
  }

  /* -------- Stock refresh from BC -------- */
  async function refreshStockIntoMenu() {
    try {
      const s = await apiFetch("/bc/stock");
      if (!s.ok) return;
      const stockMap = await s.json();
      setMenu((prev) =>
        prev.map((it) => {
          const key = it.id || it.number || it.no || it.No;
          const qty = Number(
            stockMap[key] ??
              stockMap[it.id] ??
              stockMap[it.number] ??
              NaN
          );
          const hasStockData = Number.isFinite(qty);
          return {
            ...it,
            stock: hasStockData ? qty : it.stock,
            hasStockData: hasStockData || it.hasStockData,
          };
        })
      );
    } catch (e) {
      console.warn("stock refresh failed:", e);
    }
  }

    /* -------- Checkout (ALL) -------- */
  const checkoutAll = async (method) => {
    if (isPaying) return;
    if (!activeTable && !customer.name) {
      alert("Select a table or enter customer name/phone.");
      return;
    }
    if (cart.length === 0) {
      alert("No items to pay.");
      return;
    }

    const saleNo = genSaleNo();
    const sent = getSent();
    if (sent.has(saleNo)) {
      alert("This sale was already submitted.");
      return;
    }

    const paidSnap = {
      saleNo,
      dateISO: new Date().toISOString(),
      method,
      tableName: activeTable?.name || "",
      customer,
      restaurantLines: cart,
      rTotals,
      grand: rTotals.total,
    };

    setIsPaying(true);
    const bc = await postSaleToBC(paidSnap);

    if (!bc.ok) {
      // We still want to close the table locally
      alert(
        `Failed to post sale to Business Central (table will still be closed locally):\n${bc.error}`
      );
    }

    // mark sale number as used so we don't send it again
    sent.add(saleNo);
    saveSent(sent);

    // Only refresh stock from BC if posting actually worked
    if (bc.ok) {
      await refreshStockIntoMenu();
    }

    // Print receipt (even if BC failed, for internal records)
    printNow(paidSnap);

    // --- RESET LOCAL STATE ---
    setCart([]);
    setCustomer({ name: "", phone: "", bcNo: "" });

    if (activeTable) {
      setTables((prev) =>
        prev.map((t) =>
          t.id === activeTable.id
            ? {
                ...t,
                status: "free",
                waiter: undefined,
                total: 0,
                cart: [],
                splits: ["Main"],
                defaultPayer: "Main",
              }
            : t
        )
      );

      setActiveTable(null);
      setSplits(["Main"]);
      setDefaultPayer("Main");
    }

    setIsPaying(false);
    setScreen("Tables"); // back to tables view
  };

  /* -------- Checkout (SPLIT) -------- */
  const checkoutSplit = async (payer, method) => {
    if (isPaying) return;

    const rLines = cart.filter((c) => (c.payer || "Main") === payer);
    if (rLines.length === 0) {
      alert(`No items on split "${payer}".`);
      return;
    }

    const rT = calcRestaurantTotals(rLines);
    const saleNo = genSaleNo();

    const sent = getSent();
    if (sent.has(saleNo)) {
      alert("This split was already submitted.");
      return;
    }

    const paidSnap = {
      saleNo,
      dateISO: new Date().toISOString(),
      method,
      tableName: activeTable?.name || "",
      customer,
      restaurantLines: rLines,
      rTotals: rT,
      grand: rT.total,
    };

    setIsPaying(true);
    const bc = await postSaleToBC(paidSnap);

    if (!bc.ok) {
      alert(
        `Failed to post split to Business Central (split will still be closed locally):\n${bc.error}`
      );
    }

    sent.add(saleNo);
    saveSent(sent);

    if (bc.ok) {
      await refreshStockIntoMenu();
    }

    printNow(paidSnap);

    const remainingR = cart.filter((c) => (c.payer || "Main") !== payer);
    setCart(remainingR);

    if (activeTable) {
      const isEmpty = remainingR.length === 0;

      setTables((prev) =>
        prev.map((t) => {
          if (t.id !== activeTable.id) return t;

          if (isEmpty) {
            return {
              ...t,
              status: "free",
              waiter: undefined,
              total: 0,
              cart: [],
              splits: ["Main"],
              defaultPayer: "Main",
            };
          }

          return {
            ...t,
            cart: remainingR,
            splits,
            defaultPayer,
            total: calcRestaurantTotals(remainingR).total,
          };
        })
      );

      if (isEmpty) {
        setActiveTable(null);
        setSplits(["Main"]);
        setDefaultPayer("Main");
        setScreen("Tables");
      }
    }

    setIsPaying(false);
  };
  /* -------- Keep table state in sync with cart -------- */
  useEffect(() => {
    if (!activeTable) return;
    setTables((prev) =>
      prev.map((tx) =>
        tx.id === activeTable.id
          ? {
              ...tx,
              cart,
              splits,
              defaultPayer,
              total: calcRestaurantTotals(cart).total,
            }
          : tx
      )
    );
  }, [activeTable, cart, splits, defaultPayer]);


  /* -------- Push snapshot to bridge -------- */
  const pushSnapshotRef = useRef(null);
  useEffect(() => {
    if (pushSnapshotRef.current) clearTimeout(pushSnapshotRef.current);
    pushSnapshotRef.current = setTimeout(() => {
      fetch(bridgeUrl("/pos/snapshot"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tables, tickets }),
  }).catch((e) => console.warn("snapshot save failed:", e));
    }, 250);
    return () => clearTimeout(pushSnapshotRef.current);
  }, [tables, tickets]);

const screens = [
  {
    key: "Tables",
    label: "Tables",
    icon: <TableProperties className="w-4 h-4" />,
  },
  {
    key: "Order",
    label: "Order",
    icon: <UtensilsCrossed className="w-4 h-4" />,
    disabled: !activeTable, // can't open Order if no table selected
  },
  {
    key: "Payments",
    label: "Checkout",
    icon: <CreditCard className="w-4 h-4" />,
  },
  {
    key: "KDS",
    label: "Kitchen (KDS)",
    icon: <UtensilsCrossed className="w-4 h-4" />,
  },
  {
    key: "Settings",
    label: "Settings",
    icon: <Settings className="w-4 h-4" />,
  },
];


  const StatusBar = () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge intent="info">{location}</Badge>
      {online ? (
        <Badge intent="success">
          <span className="inline-flex items-center gap-1">
            <Cloud className="w-4 h-4" /> Online
          </span>
        </Badge>
      ) : (
        <Badge intent="danger">
          <span className="inline-flex items-center gap-1">
            <CloudOff className="w-4 h-4" /> Offline
          </span>
        </Badge>
      )}
      <Badge intent={printerConnected ? "success" : "warning"}>
        {printerConnected ? "Printer WS Connected" : "Printer WS Down"}
      </Badge>
      {bcConnected ? (
        <Badge intent="success">
          <span className="inline-flex items-center gap-1">
            <CloudUpload className="w-4 h-4" /> BC Sync OK
          </span>
        </Badge>
      ) : (
        <Badge intent="warning">
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> BC Disconnected
          </span>
        </Badge>
      )}
    </div>
  );
  const handleSystemPrint = () => {
    // Uses @media print styles to show only the receipt
    window.print();
  };
    return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800 print:hidden">

      {/* Hidden on screen, visible only when printing */}
      <div
        id="print-container"
        className="hidden print:block"
      >
        <PrintStyles />
        <PrintableReceipt receipt={lastReceipt} />
      </div>


      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="text-xs text-slate-600 px-4 py-2 flex items-center justify-between">
          <div>
            Signed in as <b>{user.name}</b> ({user.role})
          </div>
          <button
            className="text-rose-600 underline"
            onClick={async () => {
              try {
                await fetch(bridgeUrl("/auth/logout"), {
                method: "POST",
                credentials: "include",
              });
              } catch {}
              sessionStorage.clear();
              onLogout();
              window.location.href = "/"; // HARD logout
            }}
          >
            Logout
          </button>
        </div>

        <div className="max-w-7xl mx-auto px-4 pb-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold">
                Restaurant POS (BC-powered)
              </h1>
              <p className="text-xs text-slate-500">
                Single screen: Tables + Menu + Cart. Kitchen & Payments on top
                navigation.
              </p>
            </div>
          </div>
          <StatusBar />
        </div>

        {/* Nav */}
        <div className="border-t border-slate-200 overflow-x-auto">
          <div className="max-w-7xl mx-auto px-2 py-2 flex gap-2">
            {screens.map((s) => (
  <Pill
    key={s.key}
    active={screen === s.key}
    onClick={() => setScreen(s.key)}
    icon={s.icon}
    label={s.label}
    disabled={isPaying || s.disabled}
  />
))}

          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* POS MAIN PAGE (tables + menu + cart all together) */}
        {screen === "Tables" && (
  <div className="grid lg:grid-cols-[minmax(0,1fr)] gap-6">
    <Card
      title="Table Map"
      icon={<TableProperties className="w-5 h-5" />}
      right={
        <Badge>
          {tables.filter((t) => t.status !== "free").length} active
        </Badge>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        {tables.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              // save current active table state (if any)
              setTables((prev) => {
                if (!activeTable) return prev;
                const updated = prev.map((tx) =>
                  tx.id === activeTable.id
                    ? {
                        ...tx,
                        cart,
                        splits,
                        defaultPayer,
                        total: calcRestaurantTotals(cart).total,
                      }
                    : tx
                );
                return updated;
              });

              // switch to this table
              setActiveTable(t);
              setCart(t.cart ?? []);
              setSplits(t.splits ?? ["Main"]);
              setDefaultPayer(t.defaultPayer ?? "Main");

              // go to Order page
              setScreen("Order");
            }}
            className={
              "rounded-2xl p-3 text-left border transition shadow-sm hover:shadow " +
              (t.status === "occupied"
                ? "bg-rose-50 border-rose-200"
                : t.status === "reserved"
                ? "bg-amber-50 border-amber-200"
                : "bg-white border-slate-200")
            }
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t.name}</span>
              <Badge
                intent={
                  t.status === "occupied"
                    ? "danger"
                    : t.status === "reserved"
                    ? "warning"
                    : "default"
                }
              >
                {t.status}
              </Badge>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Seats: {t.seats}
            </div>
            {t.total > 0 && (
              <div className="text-sm mt-2 font-medium">
                {fmt(t.total)}
              </div>
            )}
          </button>
        ))}
      </div>
    </Card>
  </div>
)}
{screen === "Order" && (
  activeTable ? (
    <div className="grid lg:grid-cols-[220px_minmax(0,1.6fr)_300px] gap-6">
      {/* LEFT: Table info + Customer */}
      <div className="grid gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Active table</div>
              <div className="font-semibold text-slate-800">
                {activeTable.name}
              </div>
              <div className="text-xs text-slate-500">
                Seats: {activeTable.seats} • Status: {activeTable.status}
              </div>
            </div>
            <button
              onClick={() => setScreen("Tables")}
              className="px-3 py-1.5 text-xs rounded-full border border-slate-300"
            >
              ← Back to tables
            </button>
          </div>
        </Card>

        <Card title="Customer (for this table)" icon={<Users2 className="w-5 h-5" />}>
          <div className="grid gap-2 text-sm">
            <label className="grid gap-1">
              <span>Name</span>
              <input
                className="border rounded-xl px-3 py-2"
                placeholder="Customer name"
                value={customer.name}
                onChange={(e) =>
                  setCustomer({ ...customer, name: e.target.value })
                }
              />
            </label>
            <label className="grid gap-1">
              <span>Phone</span>
              <input
                className="border rounded-xl px-3 py-2"
                placeholder="07..."
                value={customer.phone}
                onChange={(e) =>
                  setCustomer({ ...customer, phone: e.target.value })
                }
              />
            </label>
            <label className="grid gap-1">
              <span>BC Customer No (optional override)</span>
              <input
                className="border rounded-xl px-3 py-2"
                placeholder="e.g., C000123"
                value={customer.bcNo}
                onChange={(e) =>
                  setCustomer({ ...customer, bcNo: e.target.value })
                }
              />
            </label>
          </div>
        </Card>
      </div>

            {/* CENTER: Menu (categories on the side) */}
      <div className="grid gap-4">
        <Card title="Menu" icon={<UtensilsCrossed className="w-5 h-5" />}>
          <div className="grid md:grid-cols-[190px_minmax(0,1fr)] gap-4">
            {/* LEFT: vertical categories */}
            <div className="border rounded-2xl p-2 bg-slate-50 max-h-[460px] overflow-y-auto">
              <div className="text-xs font-semibold text-slate-500 px-1 mb-2">
                Categories
              </div>
              <div className="flex flex-col gap-1">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCat(c.id)}
                    className={
                      "w-full inline-flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs " +
                      (cat === c.id
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100")
                    }
                  >
                    <span className="inline-flex items-center gap-2">
                      {c.icon}
                      <span className="truncate">{c.name}</span>
                    </span>
                  </button>
                ))}
                {categories.length === 0 && (
                  <span className="text-xs text-slate-500 px-1">
                    No categories – check BC menu sync.
                  </span>
                )}
              </div>
            </div>
                        {/* RIGHT: search + items */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center gap-2">
                <input
                  ref={searchRef}
                  className="border rounded-full px-3 py-1.5 text-sm w-full md:w-72"
                  placeholder="Search by name / code / barcode…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>

              {/* Menu list – compact like BC */}
              {loadingMenu && (
                <div className="text-sm text-slate-500">
                  Loading menu from BC…
                </div>
              )}

              {menuError && !loadingMenu && (
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Failed to load menu: {menuError}</span>
                </div>
              )}

              {!loadingMenu && filteredMenu.length === 0 && (
                <div className="text-sm text-slate-500">
                  No items match this filter / search.
                </div>
              )}

              {filteredMenu.length > 0 && (
                <div className="mt-2 border rounded-2xl overflow-hidden">
                  {/* header row */}
                  <div className="grid grid-cols-[90px_minmax(0,1fr)_90px_70px] bg-slate-50 text-xs text-slate-600 font-medium px-3 py-2">
                    <div>Code</div>
                    <div>Item</div>
                    <div className="text-right">Price</div>
                    <div className="text-right">Stock</div>
                  </div>

                  {/* rows */}
                  <div className="max-h-[480px] overflow-y-auto">
                    {filteredMenu.map((it) => (
                      <button
                        key={it.id}
                        onClick={() => addToCart(it)}
                        className="w-full grid grid-cols-[90px_minmax(0,1fr)_90px_70px] items-center px-3 py-2 text-sm border-t text-left hover:bg-slate-100"
                      >
                        {/* code */}
                        <span className="font-mono text-xs text-sky-700">
                          {it.id}
                        </span>

                        {/* name */}
                        <span className="truncate">{it.name}</span>

                        {/* price */}
                        <span className="text-right font-semibold">
                          {fmt(it.price || 0)}
                        </span>

                        {/* stock */}
                        <span
                          className={
                            "text-right text-xs " +
                            (it.hasStockData
                              ? it.stock > 0
                                ? "text-emerald-600 font-medium"
                                : "text-rose-600 font-medium"
                              : "text-slate-400")
                          }
                        >
                          {it.hasStockData ? it.stock ?? 0 : "—"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </Card>
      </div>


      {/* RIGHT: Cart */}
      <div className="grid gap-4">
        <Card
          title={`Cart ${activeTable ? `— ${activeTable.name}` : ""}`}
          icon={<Receipt className="w-5 h-5" />}
          right={
            cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="inline-flex items-center gap-1 text-xs text-rose-600"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            )
          }
        >
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {cart.map((c, idx) => (
              <div
                key={`${c.id}-${idx}`}
                className="flex items-center justify-between gap-2 border rounded-xl px-2 py-2 text-sm bg-white"
              >
                <div className="flex-1">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {fmt(c.price)} • Split: {c.payer || "Main"}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => changeQty(idx, -1)}
                    className="px-2 py-1 rounded-lg border text-xs"
                  >
                    −
                  </button>
                  <div className="w-7 text-center text-xs">{c.qty}</div>
                  <button
                    onClick={() => changeQty(idx, +1)}
                    className="px-2 py-1 rounded-lg border text-xs"
                  >
                    +
                  </button>
                </div>
                <div className="text-xs font-semibold w-16 text-right">
                  {fmt(c.price * c.qty)}
                </div>
                <button
                  onClick={() => removeFromCart(idx)}
                  className="ml-1 text-slate-400 hover:text-rose-600"
                >
                  ×
                </button>
              </div>
            ))}

            {cart.length === 0 && (
              <div className="text-sm text-slate-500">
                Cart is empty. Tap items in the menu to add.
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="mt-4 border-t pt-3 text-sm space-y-1">
            <Row left="Subtotal" right={fmt(rTotals.sub)} />
            <Row left="Service (5%)" right={fmt(rTotals.service)} />
            <Row left="Catering (2%)" right={fmt(rTotals.catering)} />
            <Row left="VAT (16%)" right={fmt(rTotals.vat)} />
            <div className="flex justify-between text-base font-semibold pt-1">
              <span>Total</span>
              <span>{fmt(rTotals.total)}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <button
              onClick={sendToKitchen}
              className="w-full rounded-xl bg-slate-900 text-white py-2 text-sm"
            >
              Send to Kitchen
            </button>
            <button
              onClick={() => setScreen("Payments")}
              className="w-full rounded-xl border border-slate-300 py-2 text-sm"
            >
              Go to Checkout
            </button>
          </div>
        </Card>
      </div>
    </div>
  ) : (
    <Card title="No table selected">
      <div className="text-sm text-slate-600">
        Choose a table first on the <b>Tables</b> tab, then come back to
        <b> Order</b>.
      </div>
      <button
        onClick={() => setScreen("Tables")}
        className="mt-3 px-3 py-2 rounded-xl border border-slate-300 text-sm"
      >
        Go to Tables
      </button>
    </Card>
  )
)}



        {/* Kitchen Screen */}
        {screen === "KDS" && (
          <KitchenScreen tickets={tickets} setTickets={setTickets} />
        )}

        {/* Payments Screen */}
        {screen === "Payments" && (
          <PaymentsScreen
            cart={cart}
            splits={splits}
            setSplits={setSplits}
            setRestaurantPayer={(i, p) => setRestaurantPayer(i, p)}
            changeQty={changeQty}
            removeFromCart={removeFromCart}
            rTotals={rTotals}
            checkoutAll={checkoutAll}
            checkoutSplit={checkoutSplit}
            printNow={printNow}
            activeTable={activeTable}
            customer={customer}
            setCustomer={setCustomer}
          />
        )}

        {/* Settings Screen */}
        {screen === "Settings" && (
          <SettingsAdmin
            online={online}
            setOnline={setOnline}
            bcConnected={bcConnected}
            setBcConnected={setBcConnected}
            location={location}
            setLocation={setLocation}
          />
        )}

        {/* Architecture */}
        {screen === "Architecture" && <Architecture />}
                {/* Receipt Preview Modal */}
        {showReceiptPreview && lastReceipt && (
          <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-slate-800">
                  Receipt preview
                </div>
                <button
                  onClick={() => setShowReceiptPreview(false)}
                  className="text-slate-500 text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="border rounded-xl p-3 max-h-[360px] overflow-auto text-xs">
                <div className="text-center mb-2">
                  <div className="font-semibold text-sm">GOURMET MASTER</div>
                  <div className="text-[11px] text-slate-500">Dining Hall</div>
                </div>
                <div className="text-[11px] mb-2 text-slate-600">
                  <div>Receipt: {lastReceipt.saleNo}</div>
                  <div>
                    Date: {new Date(lastReceipt.dateISO).toLocaleString()}
                  </div>
                  {lastReceipt.tableName && (
                    <div>Table: {lastReceipt.tableName}</div>
                  )}
                  {lastReceipt.customer?.name && (
                    <div>Customer: {lastReceipt.customer.name}</div>
                  )}
                </div>
                <hr />
                {lastReceipt.restaurantLines.map((l, i) => (
                  <div
                    key={i}
                    className="flex justify-between text-[11px] mt-1"
                  >
                    <span>
                      {l.name}
                      {l.qty > 1 ? ` x${l.qty}` : ""}
                    </span>
                    <span>{fmt(l.price * l.qty)}</span>
                  </div>
                ))}
                <hr className="mt-2" />
                <div className="mt-1 text-[11px]">
                  <Row left="Subtotal" right={fmt(lastReceipt.rTotals.sub)} />
                  <Row
                    left="Service (5%)"
                    right={fmt(lastReceipt.rTotals.service)}
                  />
                  <Row
                    left="Catering (2%)"
                    right={fmt(lastReceipt.rTotals.catering)}
                  />
                  <Row left="VAT (16%)" right={fmt(lastReceipt.rTotals.vat)} />
                  <div className="flex justify-between mt-1 font-semibold">
                    <span>Total</span>
                    <span>{fmt(lastReceipt.rTotals.total)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <button
                  onClick={handleSystemPrint}
                  className="rounded-xl bg-slate-900 text-white py-2"
                >
                  Print / Save as PDF
                </button>
                <button
                  onClick={() => setShowReceiptPreview(false)}
                  className="rounded-xl border border-slate-300 py-2"
                >
                  Close
                </button>
              </div>

              <div className="mt-2 text-[11px] text-slate-500">
                Tip: choose <b>&quot;Save as PDF&quot;</b> in the print dialog to
                download the receipt on the tablet.
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

/* ========================= Sub-screens ========================= */
function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
  
  const r = await fetch(bridgeUrl("/auth/login"), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({
    username: username.trim().toLowerCase(),
    password,
  }),
});

      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      const j = await r.json();
      onLoggedIn(j.user);
    } catch (e) {
      setErr("Invalid username or password");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form
        onSubmit={submit}
        className="bg-white p-6 rounded-2xl shadow border w-[340px]"
      >
        <div className="text-lg font-semibold mb-4">Sign in</div>
        {err && <div className="mb-3 text-sm text-rose-600">{err}</div>}
        <label className="grid gap-1 mb-3 text-sm">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border rounded-xl px-3 py-2"
            placeholder=""
          />
        </label>
        <label className="grid gap-1 mb-4 text-sm">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border rounded-xl px-3 py-2"
            placeholder="••••"
          />
        </label>
        <button className="w-full rounded-xl bg-slate-900 text-white py-2">
          Sign in
        </button>
        <div className="text-xs text-slate-500 mt-3"></div>
      </form>
    </div>
  );
}

function Architecture() {
  const Box = ({ title, children, className = "" }) => (
    <div
      className={
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm " +
        className
      }
    >
      <div className="font-semibold text-slate-800 mb-1">{title}</div>
      <div className="text-sm text-slate-600">{children}</div>
    </div>
  );
  return (
    <div className="grid gap-6">
      <div className="grid md:grid-cols-3 gap-6">
        <Box title="Frontline Devices">
          • Waiter Tablets (Web/PWA)
          <br />
          • KDS Screens (Kitchen/Bar)
          <br />
          • Payment Terminals (Card, NFC, M-Pesa)
        </Box>
        <Box title="API Gateway &amp; App Server">
          • REST/Socket for POS &amp; KDS
          <br />
          • Auth + Rate limiting
          <br />
          • Event bus for tickets
        </Box>
        <Box title="Business Central Connector">
          • Sync items, prices, taxes
          <br />
          • Post Sales (Orders/Journals)
          <br />
          • Inventory decrement
        </Box>
      </div>
    </div>
  );
}

function KitchenScreen({ tickets, setTickets }) {
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString();

  const advance = (id, to) =>
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status: to } : t)));

  const bump = (id) =>
    setTickets((prev) => prev.filter((t) => t.id !== id));

  const filtered = tickets.filter((t) => {
    const matchesStatus = filter === "ALL" || t.status === filter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      t.table.toLowerCase().includes(q) ||
      t.items.some((i) => i.name.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  const statusColor = (s) =>
    s === "NEW"
      ? "bg-amber-100 text-amber-700"
      : s === "IN_PROGRESS"
      ? "bg-sky-100 text-sky-700"
      : s === "READY"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-slate-100 text-slate-700";

  return (
    <div className="grid gap-4">
      <Card
        title="Kitchen Tickets"
        icon={<UtensilsCrossed className="w-5 h-5" />}
        right={
          <div className="flex items-center gap-2 text-sm">
            <select
              className="border rounded-full px-3 py-1"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="ALL">All</option>
              <option value="NEW">New</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="READY">Ready</option>
            </select>
            <input
              className="border rounded-full px-3 py-1"
              placeholder="Search table / item…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        }
      >
        {filtered.length === 0 ? (
          <div className="text-sm text-slate-500">
            No tickets yet. Use “Send to Kitchen”.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            {filtered.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">Table {t.table}</div>
                  <span
                    className={
                      "px-2 py-1 text-xs rounded-full " + statusColor(t.status)
                    }
                  >
                    {t.status.replace("_", " ")}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mb-2">
                  Created {fmtTime(t.createdAt)}
                </div>
                <div className="grid gap-2">
                  {t.items.map((it, idx) => (
                    <div key={idx} className="border rounded-xl p-2">
                      <div className="flex justify-between">
                        <div className="font-medium">{it.name}</div>
                        <div className="text-sm">×{it.qty}</div>
                      </div>
                      {it.mods && it.mods.length > 0 && (
                        <div className="text-xs text-slate-500 mt-1">
                          Mods: {it.mods.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {t.status === "NEW" && (
                    <button
                      className="rounded-xl border py-2"
                      onClick={() => advance(t.id, "IN_PROGRESS")}
                    >
                      Start
                    </button>
                  )}
                  {t.status === "IN_PROGRESS" && (
                    <button
                      className="rounded-xl border py-2"
                      onClick={() => advance(t.id, "READY")}
                    >
                      Ready
                    </button>
                  )}
                  {t.status === "READY" && (
                    <button
                      className="rounded-xl border py-2"
                      onClick={() => bump(t.id)}
                    >
                      Bump
                    </button>
                  )}
                  <button
                    className="rounded-xl border py-2 col-span-2"
                    onClick={() => bump(t.id)}
                  >
                    Bump / Clear
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}


function PaymentsScreen({
  cart,
  splits,
  setSplits,
  setRestaurantPayer,
  changeQty,
  removeFromCart,
  rTotals,
  checkoutAll,
  checkoutSplit,
  printNow,
  activeTable,
  customer,
  setCustomer,
}) {
  return (
    <div className="grid lg:grid-cols-[1fr_420px] gap-6">
      <Card title="Bill" icon={<CreditCard className="w-5 h-5" />}>
        {/* Combined table */}
        <div className="rounded-xl border overflow-hidden">
          <div className="grid grid-cols-[1fr_110px_120px_120px_170px_70px] bg-slate-50 text-xs text-slate-600 font-medium px-3 py-2">
            <div>Item</div>
            <div>Unit</div>
            <div className="text-center">Qty</div>
            <div className="text-right">Line Total</div>
            <div>Assign to split</div>
            <div className="text-right pr-1">&nbsp;</div>
          </div>
          {cart.map((r, idx) => (
            <div
              key={`${r.id}-${idx}`}
              className="grid grid-cols-[1fr_110px_120px_120px_170px_70px] items-center px-3 py-2 border-t"
            >
              <div className="font-medium">{r.name}</div>
              <div>{fmt(r.price)}</div>
              <div className="flex items-center justify-center gap-1">
                <button
                  onClick={() => changeQty(idx, -1)}
                  className="px-2 py-1 rounded-lg border"
                >
                  −
                </button>
                <div className="w-8 text-center">{r.qty}</div>
                <button
                  onClick={() => changeQty(idx, +1)}
                  className="px-2 py-1 rounded-lg border"
                >
                  +
                </button>
              </div>
              <div className="text-right font-semibold">
                {fmt(r.price * r.qty)}
              </div>
              <div>
                <select
                  value={r.payer || "Main"}
                  onChange={(e) => setRestaurantPayer(idx, e.target.value)}
                  className="border rounded-lg px-2 py-1 text-sm w-full"
                >
                  {splits.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-right">
                <button
                  onClick={() => removeFromCart(idx)}
                  className="px-2 py-1 rounded-lg border"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="text-sm text-slate-500 px-3 py-2">
              No items yet.
            </div>
          )}
        </div>

        {/* Split manager */}
        <div className="mt-4 border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Splits</div>
            <button
              className="px-2 py-1 border rounded-lg text-sm"
              onClick={() => {
                const base = "Guest ";
                let i = 1;
                let name = `${base}${i}`;
                while (splits.includes(name)) {
                  i += 1;
                  name = `${base}${i}`;
                }
                setSplits([...splits, name]);
              }}
            >
              + Add split
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {splits.map((s) => (
              <div
                key={s}
                className="flex items-center gap-2 border rounded-full px-3 py-1 text-sm bg-white"
              >
                <span>{s}</span>
                {s !== "Main" && (
                  <button
                    className="text-rose-600"
                    onClick={() => {
                      alert(
                        "Remove split: reassign lines first (not implemented)."
                      );
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="text-sm grid gap-1 mt-4">
          <Row left="Restaurant Total" right={fmt(rTotals.total)} />
          <div className="flex justify-between text-lg font-semibold pt-1 border-t mt-2">
            <span>Grand Total</span>
            <span>{fmt(rTotals.total)}</span>
          </div>
        </div>

        {/* Per-split checkout */}
        <div className="mt-4 grid gap-3">
          {[...groupByPayer(cart).entries()].map(([payer, lines]) => {
            const rT = calcRestaurantTotals(lines);
            return (
              <div key={payer} className="border rounded-xl p-3 bg-white">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Split: {payer}</div>
                  <div className="text-sm">
                    Total: <b>{fmt(rT.total)}</b>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
                  <button
                    onClick={() => checkoutSplit(payer, "M-Pesa (STK)")}
                    className="rounded-xl border p-3 text-left hover:bg-slate-50"
                  >
                    M-Pesa (STK Push)
                  </button>
                  <button
                    onClick={() => checkoutSplit(payer, "Card (NFC)")}
                    className="rounded-xl border p-3 text-left hover:bg-slate-50"
                  >
                    Card (NFC / Chip)
                  </button>
                  <button
                    onClick={() => checkoutSplit(payer, "Cash")}
                    className="rounded-xl border p-3 text-left hover:bg-slate-50"
                  >
                    Cash
                  </button>
                  <button
                    onClick={() => checkoutSplit(payer, "Voucher")}
                    className="rounded-xl border p-3 text-left hover:bg-slate-50"
                  >
                    Gift / Voucher
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* One-shot (all items) checkout */}
        <div className="grid sm:grid-cols-2 gap-2 mt-4">
          <button
            onClick={() => checkoutAll("M-Pesa (STK)")}
            className="rounded-xl border p-3 text-left hover:bg-slate-50"
          >
            M-Pesa (STK Push)
          </button>
          <button
            onClick={() => checkoutAll("Card (NFC)")}
            className="rounded-xl border p-3 text-left hover:bg-slate-50"
          >
            Card (NFC / Chip)
          </button>
          <button
            onClick={() => checkoutAll("Cash")}
            className="rounded-xl border p-3 text-left hover:bg-slate-50"
          >
            Cash
          </button>
          <button
            onClick={() => checkoutAll("Voucher")}
            className="rounded-xl border p-3 text-left hover:bg-slate-50"
          >
            Gift / Voucher
          </button>
        </div>


        {/* Proforma / Preview */}
        <div className="grid sm:grid-cols-2 gap-2 mt-3">
          <button
            onClick={() => printNow(undefined, { previewOnly: true })}
            className="rounded-xl border p-2 text-sm hover:bg-slate-50"
          >
            Preview / PDF
          </button>
          <button
            onClick={() => printNow()}
            className="rounded-xl border p-2 text-sm hover:bg-slate-50"
          >
            Print to Thermal
          </button>
        </div>


        <div className="text-xs text-slate-500 mt-3">
          Payments post to BC first; on success we print, refresh stock, and
          free the table.
        </div>
      </Card>

      <Card title="Customer" icon={<Users2 className="w-5 h-5" />}>
        <div className="grid gap-2 text-sm">
          <div className="text-xs text-slate-500">
            Table: <b>{activeTable?.name || "—"}</b>
          </div>
          <label className="grid gap-1">
            <span>Name</span>
            <input
              className="border rounded-xl px-3 py-2"
              placeholder="Customer name"
              value={customer.name}
              onChange={(e) =>
                setCustomer((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </label>
          <label className="grid gap-1 mt-2">
            <span>BC Customer No (override)</span>
            <input
              className="border rounded-xl px-3 py-2"
              placeholder="e.g., C000123 (optional)"
              value={customer.bcNo}
              onChange={(e) =>
                setCustomer((prev) => ({ ...prev, bcNo: e.target.value }))
              }
            />
          </label>
        </div>
      </Card>
    </div>
  );
}

function SettingsAdmin({
  online,
  setOnline,
  bcConnected,
  setBcConnected,
  location,
  setLocation,
}) {
  const [defaultNo, setDefaultNo] = useState(getSavedDefaultCustomerNo());

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card title="Locations & Devices" icon={<Building2 className="w-5 h-5" />}>
        <label className="grid gap-1 text-sm">
          <span>Active Location</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="border rounded-xl px-3 py-2"
          />
        </label>
        <div className="mt-3 flex items-center gap-2">
          <input
            id="online"
            type="checkbox"
            checked={online}
            onChange={(e) => setOnline(e.target.checked)}
          />
          <label htmlFor="online" className="text-sm">
            Online Mode (auto-sync)
          </label>
        </div>
      </Card>

      <Card title="Microsoft BC Integration" icon={<CloudUpload className="w-5 h-5" />}>
        <div className="text-sm mb-3">
          Status:{" "}
          {bcConnected ? (
            <Badge intent="success">Connected</Badge>
          ) : (
            <Badge intent="warning">Disconnected</Badge>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          <button
            className="rounded-xl border px-3 py-2"
            onClick={() => alert("Pinged BC OK (placeholder)")}
          >
            Test Connection
          </button>
          <button
            className="rounded-xl border px-3 py-2"
            onClick={() => alert("Synced menu/prices from BC (placeholder)")}
          >
            Sync Menu & Prices
          </button>
        </div>

        <div className="mt-4 border-t pt-3 grid gap-2">
          <label className="grid gap-1 text-sm">
            <span>Default BC Customer No (used when you don’t type one)</span>
            <input
              value={defaultNo}
              onChange={(e) => setDefaultNo(e.target.value)}
              onBlur={() => setSavedDefaultCustomerNo(defaultNo.trim())}
              className="border rounded-xl px-3 py-2"
              placeholder="e.g., C000123"
            />
          </label>
          <div className="text-xs text-slate-500">
            You can also set <code>VITE_DEFAULT_CUSTOMER</code> in your env. If
            you type a number in the customer panel during checkout, that
            overrides this default for that sale.
          </div>
        </div>

        <div className="text-xs text-slate-500 mt-3">
          Uses BC APIs (OData/REST).
        </div>
      </Card>
    </div>
  );
}
