// bc-bridge.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { io as socketioClient } from "socket.io-client";

dotenv.config();

/* ------------------------ App + HTTP + Socket.IO ------------------------ */
const app = express();

//* ------------------------ CORS (Netlify + local) ------------------------ */
/* ------------------------ CORS (Netlify + local) ------------------------ */
// ---------- CORS (Netlify + local) – manual, strict ----------
const allowedOrigins = [
  "http://localhost:5173",
  "https://posrobertos.netlify.app",
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
  }

  // Let preflight requests end here
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // handle preflight
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use(cookieParser());


const PORT = Number(process.env.BRIDGE_PORT || process.env.PORT || 5050);
const PRINTER_WS_URL = process.env.PRINTER_WS_URL || "http://localhost:4000";

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: allowedOrigins, credentials: true },
  path: "/socket.io",
});

/* ------------------------ Printer WS client (forwarder) ------------------------ */
let printerIO = null;
function connectPrinter() {
  try { printerIO?.close(); } catch {}
  printerIO = socketioClient(PRINTER_WS_URL, { transports: ["websocket"] });
  printerIO.on("connect", () => console.log(`[printer] connected → ${PRINTER_WS_URL}`));
  printerIO.on("disconnect", () => console.log(`[printer] disconnected`));
  printerIO.on("connect_error", (e) => console.warn(`[printer] connect_error:`, e?.message || e));
}
connectPrinter();

/* ------------------------ Data dir + POS state persistence ------------------------ */
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const STATE_FILE = path.join(DATA_DIR, "pos-state.json");

/* ------------------------ Auth (DEV: plain passwords) ------------------------ */
const JWT_SECRET = process.env.JWT_SECRET || "change-me-dev";
let USERS = [
  { id: "u1", name: "Admin", username: "admin", role: "admin", password: "1234" },
  { id: "u2", name: "Anne (Waiter)", username: "anne", role: "waiter", password: "1234" },
];
const issueToken = (u) => jwt.sign({ uid: u.id, name: u.name, role: u.role }, JWT_SECRET, { expiresIn: "7d" });
function readToken(req) { const h = req.headers.authorization || ""; if (h.startsWith("Bearer ")) return h.slice(7); return req.cookies?.sid || null; }
function requireAuth(req, res, next) { try { const tok = readToken(req); if (!tok) return res.status(401).json({ ok:false, error:"unauthorized" }); req.user = jwt.verify(tok, JWT_SECRET); next(); } catch { return res.status(401).json({ ok:false, error:"unauthorized" }); } }

app.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  console.log("[auth] login attempt", username, password ? "****" : "(no password)");

  // 🔐 Simple, hard-coded demo user
  const VALID_USER = {
    username: "admin",
    password: "1234",
    fullName: "Restaurant Admin",
    role: "admin",
  };

  if (username !== VALID_USER.username || password !== VALID_USER.password) {
    console.log("[auth] invalid credentials");
    return res
      .status(401)
      .json({ ok: false, message: "Invalid username or password" });
  }

  // ✅ Create JWT
  const token = jwt.sign(
    { uid: VALID_USER.username, name: VALID_USER.fullName, role: VALID_USER.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  console.log("[auth] login success for", username);

  // 🔑 VERY IMPORTANT: set cookie for cross-origin (Netlify → Render)
  res.cookie("sid", token, {
    httpOnly: true,
    secure: true,        // required for SameSite=None
    sameSite: "None",    // allow cross-site XHR from Netlify to Render
    path: "/",
  });

  return res.json({
    ok: true,
    user: {
      id: VALID_USER.username,
      name: VALID_USER.fullName,
      role: VALID_USER.role,
    },
  });
});





app.get("/auth/me", (req, res) => { try { const tok = readToken(req); if (!tok) return res.status(401).json({ ok:false }); const p = jwt.verify(tok, JWT_SECRET); res.json({ ok:true, user:{ id:p.uid, name:p.name, role:p.role } }); } catch { res.status(401).json({ ok:false }); } });
app.post("/auth/logout", (req, res) => {
  res.clearCookie("sid", {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
  });
  res.json({ ok: true });
});


/* ------------------------ Health ------------------------ */
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "bc-bridge",
    printerConnected: !!(printerIO && printerIO.connected),
    env: process.env.BC_ENV || "Production",
    time: new Date().toISOString(),
  });
});

/* ------------------------ BC helpers ------------------------ */
const BC_AUTH = (process.env.BC_AUTH || "oauth").toLowerCase();
const BC_ENV = process.env.BC_ENV || "Production";
const BC_REGION = process.env.BC_REGION || "api.businesscentral.dynamics.com";
const BC_LOCATION_CODE = process.env.BC_LOCATION_CODE || "";

const tokenCache = { token: null, exp: 0 };
async function getAuthHeader() {
  if (!process.env.BC_TENANT_ID) return null; // demo mode
  if (BC_AUTH === "basic") {
    const user = process.env.BC_USERNAME, pass = process.env.BC_PASSWORD;
    if (!user || !pass) throw new Error("Missing BC_USERNAME/BC_PASSWORD");
    return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  }
  const tenant = process.env.BC_TENANT_ID, clientId = process.env.BC_CLIENT_ID, clientSecret = process.env.BC_CLIENT_SECRET;
  const now = Date.now(); if (!tenant || !clientId || !clientSecret) return null;
  if (tokenCache.token && now < tokenCache.exp - 60_000) return `Bearer ${tokenCache.token}`;
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: "https://api.businesscentral.dynamics.com/.default", grant_type: "client_credentials" }),
  });
  if (!r.ok) throw new Error(`OAuth token error ${r.status}`);
  const j = await r.json(); tokenCache.token = j.access_token; tokenCache.exp = now + Number(j.expires_in || 3600) * 1000;
  return `Bearer ${tokenCache.token}`;
}
function bcBase() { const tenant = process.env.BC_TENANT_ID; if (!tenant) return null; return `https://${BC_REGION}/v2.0/${tenant}/${BC_ENV}/api/v2.0`; }
function companyPath() { const companyId = process.env.BC_COMPANY_ID; if (!companyId) return null; return `companies(${companyId})`; }
async function bcFetch(pathStr, init = {}) {
  const base = bcBase(); const comp = companyPath(); const auth = await getAuthHeader();
  if (!base || !comp || !auth) return null; // demo mode
  return fetch(`${base}/${pathStr}`, { ...init, headers: { Accept: "application/json", ...(init.headers || {}), Authorization: auth } });
}
async function bcPagedGet(pathWithQuery) {
  const base = bcBase(); const auth = await getAuthHeader(); if (!base || !auth) return null;
  let next = `${base}/${pathWithQuery}`; const out = [];
  while (next) {
    const r = await fetch(next, { headers: { Accept: "application/json", Authorization: auth } });
    if (!r.ok) throw new Error(`BC GET ${r.status} ${await r.text()}`);
    const j = await r.json(); out.push(...(Array.isArray(j.value) ? j.value : []));
    next = j["@odata.nextLink"] || null;
  }
  return out;
}
const odataQuote = (s = "") => `'${String(s).replace(/'/g, "''")}'`;
async function resolveItemIdByNumber(itemNumber) {
  const comp = companyPath(); if (!comp) return null;
  const q = `${comp}/items?$top=1&$select=id,number&$filter=number eq ${odataQuote(itemNumber)}`;
  const rows = await bcPagedGet(q); return (Array.isArray(rows) && rows[0]?.id) || null;
}

/* ------------------------ Menu & stock (demo fallback) ------------------------ */
app.get("/bc/items", async (_req, res) => {
  try {
    const comp = companyPath();
    const rows = comp
      ? await bcPagedGet(`${comp}/items?$select=id,number,displayName,unitPrice,itemCategoryCode,gtin,inventory`)
      : [{ id: "1", number: "PIZZA01", displayName: "Margherita", unitPrice: 800, itemCategoryCode: "PIZZA", gtin: "", inventory: 99 }];
    res.json({ value: rows || [] });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.get("/bc/menu", async (_req, res) => {
  try {
    const comp = companyPath();
    if (!comp) {
      return res.json({ ok: true, categories: [{ id: "PIZZA", name: "Pizza" }, { id: "DRINKS", name: "Drinks" }],
        items: [{ id: "PIZZA01", name: "Margherita", price: 800, categoryId: "PIZZA", inventory: 99, gtin: "", mods: [] },
                { id: "DRINK01", name: "Soda", price: 200, categoryId: "DRINKS", inventory: 999, gtin: "", mods: [] },]});
    }
    const [items, cats] = await Promise.all([
      bcPagedGet(`${comp}/items?$select=id,number,displayName,unitPrice,itemCategoryCode,gtin,inventory`),
      bcPagedGet(`${comp}/itemCategories?$select=code,displayName`),
    ]);
    const catMap = new Map((cats || []).map(c => [c.code, { id: c.code, name: c.displayName || c.code }]));
    const itemsOut = (items || []).filter(i => !!i.displayName).map(i => {
      const categoryId = i.itemCategoryCode || "UNCATEGORIZED";
      if (categoryId && !catMap.has(categoryId)) catMap.set(categoryId, { id: String(categoryId), name: String(categoryId) });
      return { id: i.number, bcItemId: i.id, name: i.displayName, price: Number(i.unitPrice || 0), categoryId: String(categoryId), inventory: Number(i.inventory ?? 0), gtin: i.gtin || null, mods: [] };
    });
    res.json({ ok: true, categories: Array.from(catMap.values()), items: itemsOut });
  } catch (err) { res.status(500).json({ ok:false, error:String(err?.message || err) }); }
});

app.get("/bc/stock", async (_req, res) => {
  try {
    const comp = companyPath(); if (!comp) return res.json({ PIZZA01: 99, DRINK01: 999 });
    const items = await bcPagedGet(`${comp}/items?$select=number,inventory`);
    const hasInventory = items?.some(r => Object.prototype.hasOwnProperty.call(r, "inventory"));
    if (hasInventory) {
      const map = {}; for (const r of items) map[r.number] = Number(r.inventory ?? 0);
      return res.json(map);
    }
    // Fallback via ledgers
    let filter = "remainingQuantity ne 0";
    if (BC_LOCATION_CODE) filter = `locationCode eq ${odataQuote(BC_LOCATION_CODE)} and remainingQuantity ne 0`;
    const ledgers = await bcPagedGet(`${comp}/itemLedgerEntries?$select=itemNumber,locationCode,remainingQuantity&$filter=${filter}`);
    const agg = new Map(); for (const r of ledgers || []) { const k = r.itemNumber; if (!k) continue; const q = Number(r.remainingQuantity ?? 0); agg.set(k, (agg.get(k) || 0) + q); }
    res.json(Object.fromEntries(agg.entries()));
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});

/* ------------------------ Invoice posting ------------------------ */
app.post("/bc/invoice", async (req, res) => {
  try {
    const base = bcBase(); const comp = companyPath();
    if (!base || !comp) return res.json({ ok: true, invoiceId: "DEMO-INVOICE", posted: true });

    const { customerNo = process.env.BC_DEFAULT_CUSTOMER || "CASH", externalDocumentNumber, lines = [], postingDate } = req.body || {};

    // 1) Create invoice
    const invR = await bcFetch(`${comp}/salesInvoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerNumber: customerNo,
        externalDocumentNumber: externalDocumentNumber || String(Date.now()).slice(-8),
        postingDate: postingDate || new Date().toISOString().slice(0, 10),
      }),
    });
    if (!invR?.ok) return res.status(502).json({ ok: false, step: "create", error: invR ? await invR.text() : "bridge off" });
    const invoice = await invR.json(); const invoiceId = invoice.id;

    // 2) Add lines (prefer itemId GUID)
    for (const L of lines) {
      let itemId = L.itemId || L.bcItemId || null;
      let number = L.number || L.no || L.itemNo || L.itemNumber || L.id || null;
      if (!itemId && number) { try { itemId = await resolveItemIdByNumber(String(number)); } catch {} }
      if (!itemId && !number) return res.status(400).json({ ok:false, step:"add-line", error:"line missing itemId/number" });

      const lineBody = {
        lineType: "Item",
        itemId: itemId || undefined,
        number: itemId ? undefined : String(number),
        quantity: Number(L.quantity || 1),
        unitPrice: L.unitPrice != null ? Number(L.unitPrice) : undefined,
      };

      const lineR = await bcFetch(`${comp}/salesInvoices(${invoiceId})/salesInvoiceLines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lineBody),
      });
      if (!lineR?.ok) return res.status(502).json({ ok:false, step:"add-line", error: await lineR.text(), lineBody });
    }

    // 3) Post the invoice (try both action routes)
    for (const candidate of [
      `${comp}/salesInvoices(${invoiceId})/post`,
      `${comp}/salesInvoices(${invoiceId})/Microsoft.NAV.post`,
    ]) {
      const postR = await bcFetch(candidate, { method: "POST" });
      if (postR?.ok) return res.json({ ok: true, invoiceId, posted: true });
      // only error out after trying both
      if (candidate.includes("Microsoft.NAV.post")) {
        const txt = postR ? await postR.text() : "no response";
        return res.status(502).json({ ok: false, step: "post", error: txt });
      }
    }
  } catch (err) {
    console.error("POST /bc/invoice error:", err);
    res.status(500).json({ ok:false, error:String(err?.message || err) });
  }
});

/* ------------------------ POS shared state ------------------------ */
const makeDefaultTables = (n = 16) =>
  Array.from({ length: n }).map((_, i) => ({ id:i+1, name:`T${i+1}`, seats:(i%4)+2, status:"free", waiter:null, total:0, cart:[], splits:["Main"], defaultPayer:"Main" }));
let posState = { tables: makeDefaultTables(), tickets: [], updatedAt: new Date().toISOString() };
try { if (fs.existsSync(STATE_FILE)) posState = { ...posState, ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) }; } catch (e) { console.warn("State load error:", e); }
const saveState = () => { posState.updatedAt = new Date().toISOString(); try { fs.writeFileSync(STATE_FILE, JSON.stringify(posState, null, 2)); } catch (e) { console.warn("State save error:", e); } };
app.get("/pos/state", requireAuth, (_req, res) => res.json(posState));
app.post("/pos/snapshot", requireAuth, (req, res) => { const { tables, tickets } = req.body || {}; if (Array.isArray(tables)) posState.tables = tables; if (Array.isArray(tickets)) posState.tickets = tickets; saveState(); io.emit("pos/state", posState); res.json({ ok:true }); });
app.post("/pos/ticket", requireAuth, (req, res) => { const t = { ...req.body, id: req.body?.id || String(Date.now()) }; posState.tickets = [t, ...posState.tickets]; saveState(); io.emit("pos/state", posState); res.json({ ok:true, id:t.id }); });
app.post("/pos/ticket/:id/status", requireAuth, (req, res) => { const { id } = req.params; const { status } = req.body || {}; const i = posState.tickets.findIndex(t => String(t.id) === String(id)); if (i < 0) return res.status(404).json({ ok:false, error:"not found" }); posState.tickets[i].status = status; saveState(); io.emit("pos/state", posState); res.json({ ok:true }); });
app.delete("/pos/ticket/:id", requireAuth, (req, res) => { const { id } = req.params; posState.tickets = posState.tickets.filter(t => String(t.id) !== String(id)); saveState(); io.emit("pos/state", posState); res.json({ ok:true }); });
app.post("/pos/table/:id", requireAuth, (req, res) => { const id = Number(req.params.id); const i = posState.tables.findIndex(t => t.id === id); if (i < 0) return res.status(404).json({ ok:false, error:"table not found" }); posState.tables[i] = { ...posState.tables[i], ...req.body }; saveState(); io.emit("pos/state", posState); res.json({ ok:true, table: posState.tables[i] }); });

/* ------------------------ Socket.IO wiring ------------------------ */
io.on("connection", (socket) => {
  socket.emit("pos/state", posState);

  // Forward prints to printer server
  socket.on("print-order", (ticket, ack) => {
    if (!printerIO || !printerIO.connected) { const err="printer server not connected"; return ack?.({ ok:false, error: err }); }
    printerIO.emit("print-order", ticket, (resp) => { ack?.(resp); socket.emit("print-status", { type:"order", ...(resp?.ok ? { ok:true, id: ticket?.id } : { ok:false, error: resp?.error }) }); });
  });
  socket.on("print-receipt", (payload, ack) => {
    if (!printerIO || !printerIO.connected) { const err="printer server not connected"; return ack?.({ ok:false, error: err }); }
    printerIO.emit("print-receipt", payload, (resp) => { ack?.(resp); socket.emit("print-status", { type:"receipt", ...(resp?.ok ? { ok:true, saleNo: payload?.saleNo } : { ok:false, error: resp?.error }) }); });
  });

  socket.on("pos/snapshot", (snap) => { const { tables, tickets } = snap || {}; if (Array.isArray(tables)) posState.tables = tables; if (Array.isArray(tickets)) posState.tickets = tickets; saveState(); io.emit("pos/state", posState); });
});

/* ------------------------ Start ------------------------ */
server.listen(PORT, () => console.log(`[bc-bridge] listening on :${PORT}`));
