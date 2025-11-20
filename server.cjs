// server.cjs
// Simple Printer WS for the POS. Windows-friendly, loud logs, real ACKs.

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const morgan = require("morgan");
const cors = require("cors");
const os = require("os");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { print, getPrinters } = require("pdf-to-printer");

const PORT = Number(process.env.PRINTER_PORT || 4000);
const PRINTER_NAME = process.env.PRINTER_NAME || ""; // "" = OS default

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  path: "/socket.io",
});

function log(...a) { console.log("[printer]", ...a); }
function warn(...a) { console.warn("[printer]", ...a); }
function err(...a) { console.error("[printer]", ...a); }

// ---- utilities ----
function tmpPdfPath(prefix = "receipt") {
  const name = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`;
  return path.join(os.tmpdir(), name);
}

async function makeReceiptPDF(payload, filePath) {
  return new Promise((resolve, reject) => {
    try {
      // 80mm thermal ≈ 226.8 pt width; height is dynamic but PDFKit needs a number.
      // We'll over-estimate height and let the printer cut at the end.
      const doc = new PDFDocument({
        size: [226.8, 2000], // ~80mm wide
        margins: { top: 10, left: 10, right: 10, bottom: 10 }
      });

      const out = fs.createWriteStream(filePath);
      out.on("finish", resolve);
      out.on("error", reject);
      doc.pipe(out);

      const { saleNo, dateISO, method, tableName, customer, restaurantLines, rTotals, grand } = payload || {};

      doc.fontSize(12).text("RESTAURANT", { align: "center" });
      doc.moveDown(0.2);
      doc.fontSize(8).text("VAT Reg: 000000", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(8).text(new Date(dateISO || Date.now()).toLocaleString(), { align: "center" });
      doc.moveDown(0.2);
      if (tableName) doc.fontSize(9).text(`Table: ${tableName}`, { align: "center" });
      if (customer?.name) doc.fontSize(8).text(`Customer: ${customer.name}`, { align: "center" });
      if (method) doc.fontSize(8).text(`Method: ${method}`, { align: "center" });
      if (saleNo) doc.fontSize(8).text(`Sale #: ${saleNo}`, { align: "center" });

      doc.moveDown(0.6);
      doc.moveTo(10, doc.y).lineTo(216.8, doc.y).stroke();

      // lines
      doc.moveDown(0.2);
      (restaurantLines || []).forEach((l) => {
        const name = String(l.name || l.id || "").slice(0, 26);
        const qty = Number(l.qty || 1);
        const price = Number(l.price || 0);
        const line = price * qty;

        doc.fontSize(9).text(`${name}`);
        doc.fontSize(8).text(`x${qty}   @ ${price.toFixed(2)}   ${line.toFixed(2)}`, { align: "right" });
        if (l.mods && l.mods.length) {
          doc.fontSize(7).text(`Mods: ${l.mods.join(", ")}`);
        }
        doc.moveDown(0.2);
      });

      doc.moveDown(0.2);
      doc.moveTo(10, doc.y).lineTo(216.8, doc.y).stroke();
      doc.moveDown(0.4);

      // totals
      const totals = rTotals || {};
      const row = (label, val, bold) => {
        doc.fontSize(9);
        if (bold) doc.font("Helvetica-Bold");
        doc.text(label, 10, doc.y, { continued: true });
        doc.text((val ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 }), 120, doc.y, { align: "right" });
        if (bold) doc.font("Helvetica");
        doc.moveDown(0.2);
      };

      row("Subtotal", totals.sub);
      row("Service (5%)", totals.service);
      row("Catering (2%)", totals.catering);
      row("VAT (16%)", totals.vat);
      doc.moveDown(0.3);
      row("TOTAL", grand ?? totals.total, true);

      doc.moveDown(0.8);
      doc.fontSize(8).text("Thank you!", { align: "center" });
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function printPDF(filePath) {
  const opts = {};
  if (PRINTER_NAME) opts.printer = PRINTER_NAME;

  // Windows notes:
  // pdf-to-printer bundles a native tool. No Ghostscript needed.
  // If nothing prints, confirm the printer name exactly matches /printers
  // and that it can print PDFs (many thermal drivers can).
  await print(filePath, opts);
}

// ---- REST for quick diagnostics ----
app.get("/health", async (_req, res) => {
  try {
    const printers = await getPrinters().catch(() => []);
    res.json({
      ok: true,
      port: PORT,
      printer: PRINTER_NAME || "(OS default)",
      printers,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/printers", async (_req, res) => {
  try {
    const printers = await getPrinters();
    res.json(printers);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Simple GET that prints "Test" — handy to verify end-to-end
app.get("/test", async (_req, res) => {
  const file = tmpPdfPath("test");
  try {
    await makeReceiptPDF({
      saleNo: "TEST",
      restaurantLines: [{ name: "Printer Test", qty: 1, price: 0 }],
      rTotals: { sub: 0, service: 0, catering: 0, vat: 0, total: 0 },
      grand: 0
    }, file);
    await printPDF(file);
    res.json({ ok: true, file });
  } catch (e) {
    err("Test print failed:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e), file });
  } finally {
    setTimeout(() => fs.existsSync(file) && fs.unlink(file, () => {}), 5000);
  }
});

// ---- Socket.IO handlers ----
io.on("connection", (socket) => {
  log("Client connected:", socket.id);

  socket.on("disconnect", () => {
    log("Client disconnected:", socket.id);
  });

  // KITCHEN chit
  socket.on("print-order", async (ticket, ack) => {
    const file = tmpPdfPath("kitchen");
    try {
      await makeReceiptPDF({
        saleNo: `KITCHEN-${(ticket?.id || "").slice(-6)}`,
        dateISO: ticket?.createdAt || new Date().toISOString(),
        method: "KITCHEN",
        restaurantLines: (ticket?.items || []).map(i => ({ name: i.name, qty: i.qty, price: 0 })),
        rTotals: { sub: 0, service: 0, catering: 0, vat: 0, total: 0 },
        grand: 0
      }, file);
      await printPDF(file);
      ack?.({ ok: true });
    } catch (e) {
      warn("print-order failed:", e);
      ack?.({ ok: false, error: String(e?.message || e) });
    } finally {
      setTimeout(() => fs.existsSync(file) && fs.unlink(file, () => {}), 5000);
    }
  });

  // RECEIPT (proforma or final)
  socket.on("print-receipt", async (payload, ack) => {
    const file = tmpPdfPath("receipt");
    try {
      await makeReceiptPDF(payload, file);
      await printPDF(file);
      ack?.({ ok: true });
    } catch (e) {
      warn("print-receipt failed:", e);
      ack?.({ ok: false, error: String(e?.message || e) });
    } finally {
      setTimeout(() => fs.existsSync(file) && fs.unlink(file, () => {}), 5000);
    }
  });
});

server.listen(PORT, async () => {
  let chosen = "(OS default)";
  if (PRINTER_NAME) chosen = PRINTER_NAME;
  try {
    const list = await getPrinters();
    log(`Available printers: ${list.map(p => p.name).join(", ") || "(none)"}`);
  } catch {}
  log(`Printer server: http://localhost:${PORT}`);
  log(`Using printer: ${chosen}`);
});
