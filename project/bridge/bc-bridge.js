// project/bridge/bc-bridge.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { io as socketioClient } from "socket.io-client";

dotenv.config();

/* ------------------------ Basic app + HTTP + Socket.IO ------------------------ */

const app = express();
const PORT = process.env.PORT || process.env.BRIDGE_PORT || 5050;
const PRINTER_WS_URL = process.env.PRINTER_WS_URL || "http://localhost:4000";


// CORS: allow any http://localhost:* origin (for Vite dev ports)
const corsOriginFn = (origin, cb) => {
  if (!origin) return cb(null, true); // same-origin / curl
  if (origin.startsWith("http://localhost:")) return cb(null, true);
  return cb(null, true); // relaxed for your dev
};

app.use(
  cors({
    origin: corsOriginFn,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use(cookieParser());

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: corsOriginFn,
    credentials: true,
  },
  path: "/socket.io",
});

/* ------------------------ Printer WS client (forwarder) ------------------------ */

let printerIO = null;
function connectPrinter() {
  try {
    printerIO?.close();
  } catch {}
  printerIO = socketioClient(PRINTER_WS_URL, { transports: ["websocket"] });
  printerIO.on("connect", () =>
    console.log(`[printer] connected → ${PRINTER_WS_URL}`)
  );
  printerIO.on("disconnect", () => console.log(`[printer] disconnected`));
  printerIO.on("connect_error", (e) =>
    console.warn(
      `[printer] connect_error:`,
      (e && e.message) || e || "unknown"
    )
  );
}
connectPrinter();

/* ------------------------ Auth (DEV: plain passwords) ------------------------ */

const JWT_SECRET = process.env.JWT_SECRET || "change-me-dev";

const USERS = [
  {
    id: "u1",
    name: "Admin",
    username: "admin",
    role: "admin",
    password: "1234",
  },
  {
    id: "u2",
    name: "Anne (Waiter)",
    username: "anne",
    role: "waiter",
    password: "1234",
  },
];

const issueToken = (u) =>
  jwt.sign({ uid: u.id, name: u.name, role: u.role }, JWT_SECRET, {
    expiresIn: "7d",
  });

function readToken(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  return req.cookies?.sid || null;
}

function requireAuth(req, res, next) {
  try {
    const tok = readToken(req);
    if (!tok) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    req.user = jwt.verify(tok, JWT_SECRET);
    next();
  } catch (e) {
    console.error("[auth] token error:", e?.message || e);
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
}

// LOGIN
app.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};

  console.log("[auth] login attempt body =", req.body);

  if (!username || !password) {
    return res
      .status(400)
      .json({ ok: false, error: "Username and password are required" });
  }

  const normalized = String(username).trim().toLowerCase();
  const u = USERS.find((x) => x.username.toLowerCase() === normalized);

  if (!u || String(password) !== String(u.password)) {
    console.warn(
      "[auth] invalid credentials:",
      "username=",
      normalized,
      "password=",
      password
    );
    return res
      .status(401)
      .json({ ok: false, error: "Invalid username or password" });
  }

  const token = issueToken(u);

  res.cookie("sid", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // dev
  });

  console.log("[auth] login ok for", u.username);

  res.json({
    ok: true,
    user: {
      id: u.id,
      name: u.name,
      role: u.role,
      username: u.username,
    },
  });
});

// WHO AM I
app.get("/auth/me", (req, res) => {
  try {
    const tok = readToken(req);
    if (!tok) return res.status(401).json({ ok: false });
    const p = jwt.verify(tok, JWT_SECRET);
    res.json({
      ok: true,
      user: { id: p.uid, name: p.name, role: p.role },
    });
  } catch {
    res.status(401).json({ ok: false });
  }
});

// LOGOUT
app.post("/auth/logout", (req, res) => {
  res.clearCookie("sid");
  res.json({ ok: true });
});

/* ------------------------ BC helpers ------------------------ */

const BC_AUTH = (process.env.BC_AUTH || "oauth").toLowerCase();
const BC_ENV = process.env.BC_ENV || "Production";
const BC_REGION = process.env.BC_REGION || "api.businesscentral.dynamics.com";
const BC_LOCATION_CODE = process.env.BC_LOCATION_CODE || "";

const tokenCache = { token: null, exp: 0 };

async function getAuthHeader() {
  if (!process.env.BC_TENANT_ID) return null; // demo mode: no BC

  if (BC_AUTH === "basic") {
    const user = process.env.BC_USERNAME;
    const pass = process.env.BC_PASSWORD;
    if (!user || !pass)
      throw new Error("Missing BC_USERNAME/BC_PASSWORD for basic auth");
    return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  }

  const tenant = process.env.BC_TENANT_ID;
  const clientId = process.env.BC_CLIENT_ID;
  const clientSecret = process.env.BC_CLIENT_SECRET;
  const now = Date.now();

  if (!tenant || !clientId || !clientSecret) return null;

  if (tokenCache.token && now < tokenCache.exp - 60_000) {
    return `Bearer ${tokenCache.token}`;
  }

  const r = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://api.businesscentral.dynamics.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!r.ok) throw new Error(`OAuth token error ${r.status}`);

  const j = await r.json();
  tokenCache.token = j.access_token;
  tokenCache.exp = now + Number(j.expires_in || 3600) * 1000;

  return `Bearer ${tokenCache.token}`;
}

function bcBase() {
  const tenant = process.env.BC_TENANT_ID;
  if (!tenant) return null;
  return `https://${BC_REGION}/v2.0/${tenant}/${BC_ENV}/api/v2.0`;
}

function companyPath() {
  const companyId = process.env.BC_COMPANY_ID;
  if (!companyId) return null;
  return `companies(${companyId})`;
}

async function bcFetch(pathStr, init = {}) {
  const base = bcBase();
  const comp = companyPath();
  const auth = await getAuthHeader();
  if (!base || !comp || !auth) return null; // demo mode
  return fetch(`${base}/${pathStr}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers || {}),
      Authorization: auth,
    },
  });
}

async function bcPagedGet(pathWithQuery) {
  const base = bcBase();
  const auth = await getAuthHeader();
  if (!base || !auth) return null;

  let next = `${base}/${pathWithQuery}`;
  const out = [];

  while (next) {
    const r = await fetch(next, {
      headers: { Accept: "application/json", Authorization: auth },
    });
    if (!r.ok) {
      throw new Error(`BC GET ${r.status} ${await r.text()}`);
    }
    const j = await r.json();
    if (Array.isArray(j.value)) out.push(...j.value);
    next = j["@odata.nextLink"] || null;
  }

  return out;
}

const odataQuote = (s = "") => `'${String(s).replace(/'/g, "''")}'`;

async function resolveItemIdByNumber(itemNumber) {
  const comp = companyPath();
  if (!comp) return null;
  const q = `${comp}/items?$top=1&$select=id,number&$filter=number eq ${odataQuote(
    itemNumber
  )}`;
  const rows = await bcPagedGet(q);
  return (Array.isArray(rows) && rows[0] && rows[0].id) || null;
}

/* ------------------------ Menu & stock (demo fallback) ------------------------ */

// raw BC items (used as fallback by frontend)
app.get("/bc/items", async (_req, res) => {
  try {
    const comp = companyPath();
    const rows = comp
      ? await bcPagedGet(
          `${comp}/items?$select=id,number,displayName,unitPrice,itemCategoryCode,gtin,inventory`
        )
      : [
          {
            id: "1",
            number: "PIZZA01",
            displayName: "Margherita",
            unitPrice: 800,
            itemCategoryCode: "PIZZA",
            gtin: "",
            inventory: 99,
          },
        ];
    res.json({ value: rows || [] });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// nice menu (categories + items) — this is what the frontend calls first
app.get("/bc/menu", async (_req, res) => {
  try {
    const comp = companyPath();

    // Demo mode menu
    if (!comp) {
      return res.json({
        ok: true,
        categories: [
          { id: "PIZZA", name: "Pizza" },
          { id: "DRINKS", name: "Drinks" },
        ],
        items: [
          {
            id: "PIZZA01",
            name: "Margherita",
            price: 800,
            categoryId: "PIZZA",
            inventory: 99,
            gtin: "",
            mods: [],
          },
          {
            id: "DRINK01",
            name: "Soda",
            price: 200,
            categoryId: "DRINKS",
            inventory: 999,
            gtin: "",
            mods: [],
          },
        ],
      });
    }

    const [items, cats] = await Promise.all([
      bcPagedGet(
        `${comp}/items?$select=id,number,displayName,unitPrice,itemCategoryCode,gtin,inventory`
      ),
      bcPagedGet(`${comp}/itemCategories?$select=code,displayName`),
    ]);

    const catMap = new Map(
      (cats || []).map((c) => [
        c.code,
        { id: c.code, name: c.displayName || c.code },
      ])
    );

    const itemsOut = (items || [])
      .filter((i) => !!i.displayName)
      .map((i) => {
        const categoryId = i.itemCategoryCode || "UNCATEGORIZED";
        if (categoryId && !catMap.has(categoryId)) {
          catMap.set(categoryId, {
            id: String(categoryId),
            name: String(categoryId),
          });
        }
        return {
          id: i.number,
          bcItemId: i.id,
          name: i.displayName,
          price: Number(i.unitPrice || 0),
          categoryId: String(categoryId),
          inventory: Number(i.inventory ?? 0),
          gtin: i.gtin || null,
          mods: [],
        };
      });

    res.json({
      ok: true,
      categories: Array.from(catMap.values()),
      items: itemsOut,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// stock map { itemNumber: qty }
app.get("/bc/stock", async (_req, res) => {
  try {
    const comp = companyPath();
    if (!comp) {
      // demo stock
      return res.json({ PIZZA01: 99, DRINK01: 999 });
    }

    const items = await bcPagedGet(
      `${comp}/items?$select=number,inventory`
    );
    const hasInventory = items?.some((r) =>
      Object.prototype.hasOwnProperty.call(r, "inventory")
    );

    if (hasInventory) {
      const map = {};
      for (const r of items) {
        map[r.number] = Number(r.inventory ?? 0);
      }
      return res.json(map);
    }

    // Fallback via item ledger entries
    let filter = "remainingQuantity ne 0";
    if (BC_LOCATION_CODE) {
      filter = `locationCode eq ${odataQuote(
        BC_LOCATION_CODE
      )} and remainingQuantity ne 0`;
    }

    const ledgers = await bcPagedGet(
      `${comp}/itemLedgerEntries?$select=itemNumber,locationCode,remainingQuantity&$filter=${filter}`
    );

    const agg = new Map();
    for (const r of ledgers || []) {
      const k = r.itemNumber;
      if (!k) continue;
      const q = Number(r.remainingQuantity ?? 0);
      agg.set(k, (agg.get(k) || 0) + q);
    }

    res.json(Object.fromEntries(agg.entries()));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/* ------------------------ Invoice posting ------------------------ */

app.post("/bc/invoice", async (req, res) => {
  try {
    const base = bcBase();
    const comp = companyPath();

    // Demo mode: pretend success
    if (!base || !comp) {
      return res.json({
        ok: true,
        invoiceId: "DEMO-INVOICE",
        posted: true,
      });
    }

    const {
      customerNo = process.env.BC_DEFAULT_CUSTOMER || "CASH",
      externalDocumentNumber,
      lines = [],
      postingDate,
    } = req.body || {};

    // 1) Create invoice
    const invR = await bcFetch(`${comp}/salesInvoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerNumber: customerNo,
        externalDocumentNumber:
          externalDocumentNumber || String(Date.now()).slice(-8),
        postingDate: postingDate || new Date().toISOString().slice(0, 10),
      }),
    });

    if (!invR || !invR.ok) {
      return res.status(502).json({
        ok: false,
        step: "create",
        error: invR ? await invR.text() : "bridge off",
      });
    }

    const invoice = await invR.json();
    const invoiceId = invoice.id;

    // 2) Add lines
    for (const L of lines) {
      let itemId = L.itemId || L.bcItemId || null;
      let number =
        L.number || L.no || L.itemNo || L.itemNumber || L.id || null;

      if (!itemId && number) {
        try {
          itemId = await resolveItemIdByNumber(String(number));
        } catch {}
      }

      if (!itemId && !number) {
        return res.status(400).json({
          ok: false,
          step: "add-line",
          error: "line missing itemId/number",
        });
      }

      const lineBody = {
        lineType: "Item",
        itemId: itemId || undefined,
        number: itemId ? undefined : String(number),
        quantity: Number(L.quantity || 1),
        unitPrice:
          L.unitPrice != null ? Number(L.unitPrice) : undefined,
      };

      const lineR = await bcFetch(
        `${comp}/salesInvoices(${invoiceId})/salesInvoiceLines`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lineBody),
        }
      );

      if (!lineR || !lineR.ok) {
        return res.status(502).json({
          ok: false,
          step: "add-line",
          error: lineR ? await lineR.text() : "no response",
          lineBody,
        });
      }
    }

    // 3) Post the invoice
    const candidates = [
      `${comp}/salesInvoices(${invoiceId})/post`,
      `${comp}/salesInvoices(${invoiceId})/Microsoft.NAV.post`,
    ];

    for (let i = 0; i < candidates.length; i++) {
      const url = candidates[i];
      const postR = await bcFetch(url, { method: "POST" });
      if (postR && postR.ok) {
        return res.json({
          ok: true,
          invoiceId,
          posted: true,
        });
      }
      if (i === candidates.length - 1) {
        const txt = postR ? await postR.text() : "no response";
        return res.status(502).json({
          ok: false,
          step: "post",
          error: txt,
        });
      }
    }
  } catch (err) {
    console.error("POST /bc/invoice error:", err);
    res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  }
});

/* ------------------------ POS state (tables + tickets) ------------------------ */

// where to persist state between restarts
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const STATE_FILE = path.join(DATA_DIR, "pos-state.json");

const makeDefaultTables = (n = 16) =>
  Array.from({ length: n }).map((_, idx) => ({
    id: idx + 1,
    name: `T${idx + 1}`,
    seats: (idx % 4) + 2,
    status: "free", // "free" | "occupied" | "reserved"
    waiter: null,
    total: 0,
    cart: [],
    splits: ["Main"],
    defaultPayer: "Main",
  }));

let posState = {
  tables: makeDefaultTables(),
  tickets: [],
  updatedAt: new Date().toISOString(),
};

// load previous state if file exists
try {
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const saved = JSON.parse(raw);
    posState = {
      ...posState,
      ...saved,
      tables: Array.isArray(saved.tables) ? saved.tables : posState.tables,
      tickets: Array.isArray(saved.tickets) ? saved.tickets : posState.tickets,
    };
    console.log(
      `[pos] state loaded from ${STATE_FILE} with ${posState.tables.length} tables`
    );
  } else {
    console.log("[pos] no state file, using default tables");
  }
} catch (e) {
  console.warn("[pos] failed to load state:", e?.message || e);
}

function saveState() {
  try {
    posState.updatedAt = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(posState, null, 2));
  } catch (e) {
    console.warn("[pos] failed to save state:", e?.message || e);
  }
}

// GET POS STATE
app.get("/pos/state", requireAuth, (_req, res) => {
  res.json({
    tables: posState.tables,
    tickets: posState.tickets,
  });
});

// SNAPSHOT (tables + tickets)
app.post("/pos/snapshot", requireAuth, (req, res) => {
  const { tables, tickets } = req.body || {};
  if (Array.isArray(tables)) posState.tables = tables;
  if (Array.isArray(tickets)) posState.tickets = tickets;
  saveState();
  io.emit("pos/state", posState);
  res.json({ ok: true });
});

// CREATE TICKET (KDS)
app.post("/pos/ticket", requireAuth, (req, res) => {
  const t = {
    ...req.body,
    id: req.body?.id || String(Date.now()),
  };
  posState.tickets = [t, ...posState.tickets];
  saveState();
  io.emit("pos/state", posState);
  res.json({ ok: true, id: t.id });
});

// UPDATE ticket status
app.post("/pos/ticket/:id/status", requireAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const i = posState.tickets.findIndex(
    (t) => String(t.id) === String(id)
  );
  if (i < 0)
    return res.status(404).json({ ok: false, error: "not found" });
  posState.tickets[i].status = status;
  saveState();
  io.emit("pos/state", posState);
  res.json({ ok: true });
});

// DELETE ticket
app.delete("/pos/ticket/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  posState.tickets = posState.tickets.filter(
    (t) => String(t.id) !== String(id)
  );
  saveState();
  io.emit("pos/state", posState);
  res.json({ ok: true });
});

// PATCH TABLE (manual patch API)
app.post("/pos/table/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const idx = posState.tables.findIndex((t) => t.id === id);
  if (idx < 0) {
    return res
      .status(404)
      .json({ ok: false, error: "table not found" });
  }

  const patch = req.body || {};
  posState.tables[idx] = {
    ...posState.tables[idx],
    ...patch,
  };

  saveState();
  io.emit("pos/state", posState);

  res.json({
    ok: true,
    table: posState.tables[idx],
  });
});

/* ------------------------ Health ------------------------ */

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "bc-bridge-pos",
    time: new Date().toISOString(),
    tables: posState.tables.length,
    printerConnected: !!(printerIO && printerIO.connected),
    env: process.env.BC_ENV || "Production",
  });
});

/* ------------------------ Socket.IO wiring ------------------------ */

io.on("connection", (socket) => {
  console.log("[socket] client connected:", socket.id);
  socket.emit("pos/state", posState);

  socket.on("pos/snapshot", (snap) => {
    const { tables, tickets } = snap || {};
    if (Array.isArray(tables)) posState.tables = tables;
    if (Array.isArray(tickets)) posState.tickets = tickets;
    saveState();
    io.emit("pos/state", posState);
  });

  // KITCHEN order print
  socket.on("print-order", (ticket, ack) => {
    if (!printerIO || !printerIO.connected) {
      const err = "printer server not connected";
      ack?.({ ok: false, error: err });
      return;
    }
    printerIO.emit("print-order", ticket, (resp) => {
      ack?.(resp);
      socket.emit("print-status", {
        type: "order",
        ...(resp?.ok
          ? { ok: true, id: ticket?.id }
          : { ok: false, error: resp?.error }),
      });
    });
  });

  // RECEIPT print
  socket.on("print-receipt", (payload, ack) => {
    if (!printerIO || !printerIO.connected) {
      const err = "printer server not connected";
      ack?.({ ok: false, error: err });
      return;
    }
    printerIO.emit("print-receipt", payload, (resp) => {
      ack?.(resp);
      socket.emit("print-status", {
        type: "receipt",
        ...(resp?.ok
          ? { ok: true, saleNo: payload?.saleNo }
          : { ok: false, error: resp?.error }),
      });
    });
  });

  socket.on("disconnect", () => {
    console.log("[socket] client disconnected:", socket.id);
  });
});

/* ------------------------ Error safety ------------------------ */

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

/* ------------------------ Start server ------------------------ */

server.listen(PORT, () => {
  console.log(`[bc-bridge] POS bridge listening on :${PORT}`);
  console.log(
    `[bc-bridge] login with admin / 1234 at POST http://localhost:${PORT}/auth/login`
  );
  console.log(
    `[bc-bridge] initial tables: ${posState.tables.length}`
  );
});
