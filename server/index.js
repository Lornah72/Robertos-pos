import express from "express";
import fetch from "node-fetch";
import qs from "querystring";

const app = express();
app.use(express.json());

const BC_TENANT = process.env.BC_TENANT_ID;
const BC_ENV = process.env.BC_ENV; // e.g. Gourmet-Master-Test
const BC_COMPANY_ID = process.env.BC_COMPANY_ID; // Roberto's company GUID
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

async function getToken() {
  const url = `https://login.microsoftonline.com/${BC_TENANT}/oauth2/v2.0/token`;
  const body = qs.stringify({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://api.businesscentral.dynamics.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(url, { method: "POST", headers: {"Content-Type":"application/x-www-form-urlencoded"}, body });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json.access_token;
}

function bcBase() {
  return `https://api.businesscentral.dynamics.com/v2.0/${BC_ENV}/api/robertos/pos/v1.0/companies(${BC_COMPANY_ID})`;
}

app.get("/api/items", async (_req, res) => {
  try {
    const token = await getToken();
    const r = await fetch(`${bcBase()}/posItems?$top=1000`, { headers: { Authorization: `Bearer ${token}` }});
    const json = await r.json();
    res.json(json.value ?? []);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get("/api/tables", async (_req, res) => {
  try {
    const token = await getToken();
    const r = await fetch(`${bcBase()}/posTables?$orderby=sortOrder`, { headers: { Authorization: `Bearer ${token}` }});
    const json = await r.json();
    res.json(json.value ?? []);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post("/api/tables", async (req, res) => {
  try {
    const token = await getToken();
    const r = await fetch(`${bcBase()}/posTables`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type":"application/json" },
      body: JSON.stringify(req.body)
    });
    res.status(r.status).json(await r.json());
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.patch("/api/tables/:code", async (req, res) => {
  try {
    const token = await getToken();
    const url = `${bcBase()}/posTables(code='${encodeURIComponent(req.params.code)}')`;
    const r = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type":"application/json", "If-Match":"*" },
      body: JSON.stringify(req.body)
    });
    res.status(r.status).end();
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/** Posting split: the server will create two BC docs (Restaurant vs Market) */
app.post("/api/sales", async (req, res) => {
  // For now just echo; later we will create Sales Orders/Invoices via standard BC APIs
  res.json({ ok: true });
});

app.listen(4000, () => console.log("POS proxy running on :4000"));
