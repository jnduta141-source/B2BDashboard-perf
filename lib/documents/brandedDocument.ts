/**
 * Printable Mboka documents — payment receipts and bank letters.
 *
 * These leave the product: a counterparty sees them, so they carry the brand
 * rather than the dashboard chrome. Documents are standalone HTML that the
 * browser prints to PDF (no PDF dependency). Colour: indigo #3B2ED3 · ink
 * #131126 · bone #F6F4EF.
 */

import { MBOKA_LETTERHEAD, MBOKA_LOGO_SVG } from "@/lib/documents/letterhead";
import {
  RECEIPT_SHARE_METHODS,
  buildReceiptSharePayload,
  type ReceiptSharePayload,
} from "@/lib/documents/receiptShare";

export type DocumentRow = {
  label: string;
  value: string;
  /** Account numbers, IBANs, references — set in DM Mono. */
  mono?: boolean;
};

export type DocumentSection = {
  title: string;
  rows: DocumentRow[];
};

export type BrandedDocument = {
  /** Browser/window title and the PDF's default filename stem. */
  fileTitle: string;
  /** Large heading inside the document. */
  heading: string;
  subheading?: string;
  /** Optional status chip under the heading (e.g. Settled). */
  statusBadge?: string;
  /** Hero figure — the amount on a receipt. Omitted on letters. */
  amount?: string;
  amountCaption?: string;
  /** Secondary line under the amount (e.g. "Deposit · KES"). */
  party?: string;
  sections: DocumentSection[];
  footnote?: string;
};

/** Values come from user input and API responses — never interpolate raw. */
export function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRow(row: DocumentRow): string {
  return `<tr><th>${esc(row.label)}</th><td${row.mono ? ' class="mono"' : ""}>${esc(row.value)}</td></tr>`;
}

function renderSection(section: DocumentSection): string {
  if (!section.rows.length) return "";
  return `<section class="block"><h2>${esc(section.title)}</h2><table>${section.rows.map(renderRow).join("")}</table></section>`;
}

function shareMenuItemsHtml(): string {
  return RECEIPT_SHARE_METHODS.map(
    (m) =>
      `<button type="button" class="share-item" data-share="${esc(m.id)}">
        <span class="share-item__label">${esc(m.label)}</span>
        <span class="share-item__hint">${esc(m.hint)}</span>
      </button>`,
  ).join("");
}

function shareScript(payload: ReceiptSharePayload): string {
  // Embed as JSON inside a script — escape </script> breakouts.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<script>
(function () {
  var SHARE = ${json};
  var menu = document.getElementById("share-menu");
  var toggle = document.getElementById("share-toggle");
  var toast = document.getElementById("share-toast");
  var backdrop = document.getElementById("share-backdrop");

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, 2200);
  }

  function closeMenu() {
    if (!menu || !toggle) return;
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove("share-open");
  }

  function openMenu() {
    if (!menu || !toggle) return;
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add("share-open");
  }

  function encode(s) { return encodeURIComponent(s || ""); }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    return new Promise(function (resolve) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        ta.remove();
        resolve(ok);
      } catch (e) { resolve(false); }
    });
  }

  function downloadHtml() {
    var blob = new Blob([document.documentElement.outerHTML], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = SHARE.filename || "mboka-receipt.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function runShare(id) {
    var text = SHARE.text || "";
    var title = SHARE.title || "Mboka receipt";
    if (id === "device") {
      if (!navigator.share) {
        showToast("Device share isn’t available here — try WhatsApp or Copy");
        return;
      }
      navigator.share({ title: title, text: text }).then(closeMenu).catch(function (err) {
        if (err && err.name === "AbortError") { closeMenu(); return; }
        showToast("Couldn’t open device share");
      });
      return;
    }
    if (id === "whatsapp") {
      window.open("https://wa.me/?text=" + encode(text), "_blank", "noopener,noreferrer");
      closeMenu();
      return;
    }
    if (id === "email") {
      window.location.href = "mailto:?subject=" + encode(title) + "&body=" + encode(text);
      closeMenu();
      return;
    }
    if (id === "sms") {
      window.location.href = "sms:?&body=" + encode(text);
      closeMenu();
      return;
    }
    if (id === "telegram") {
      window.open(
        "https://t.me/share/url?url=" + encode("https://mboka.africa") + "&text=" + encode(text),
        "_blank",
        "noopener,noreferrer"
      );
      closeMenu();
      return;
    }
    if (id === "copy") {
      copyText(text).then(function (ok) {
        showToast(ok ? "Receipt copied" : "Couldn’t copy — select the text manually");
        closeMenu();
      });
      return;
    }
    if (id === "pdf") {
      closeMenu();
      window.print();
      return;
    }
    if (id === "html") {
      downloadHtml();
      showToast("Receipt file saved");
      closeMenu();
    }
  }

  if (toggle && menu) {
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menu.hidden) openMenu(); else closeMenu();
    });
    menu.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-share]") : null;
      if (!btn) return;
      runShare(btn.getAttribute("data-share"));
    });
    if (backdrop) {
      backdrop.addEventListener("click", function () { closeMenu(); });
    }
    document.addEventListener("click", function () { closeMenu(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
  }
})();
</script>`;
}

export function renderBrandedDocument(
  doc: BrandedDocument,
  options?: { filenameStem?: string },
): string {
  const generated = new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());

  const addressHtml = MBOKA_LETTERHEAD.lines.map((line) => `<div>${esc(line)}</div>`).join("");
  const compactAddrHtml = MBOKA_LETTERHEAD.compactLines
    .map((line) => `<div>${esc(line)}</div>`)
    .join("");
  const officesFootHtml = MBOKA_LETTERHEAD.offices
    .map(
      (office) =>
        `<div class="doc-foot__office"><strong>${esc(office.region)}</strong><br>${office.lines
          .map((line) => esc(line))
          .join("<br>")}</div>`,
    )
    .join("");
  const sharePayload = buildReceiptSharePayload(
    doc,
    options?.filenameStem || doc.fileTitle || "mboka-receipt",
  );

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.fileTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --indigo:#3B2ED3;
    --indigo-tint:#EEEDFB;
    --ink:#131126;
    --bone:#F6F4EF;
    --muted:#4C4A66;
    --muted2:#8B89A6;
    --line:rgba(19,17,38,0.10);
    --success:#0F7A4A;
    --success-tint:#E6F6EE;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; background:linear-gradient(165deg, #EFEBFB 0%, var(--bone) 42%, #F8F6F1 100%);
    color:var(--ink); font-family:'DM Sans', system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing:antialiased; padding:28px 16px 56px;
  }
  .toolbar {
    position:sticky; top:0; z-index:2; max-width:720px; margin:0 auto 16px;
    display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; align-items:center;
    padding:10px 0;
    background:linear-gradient(180deg, rgba(239,235,251,0.96) 0%, rgba(246,244,239,0.92) 100%);
    backdrop-filter:blur(8px);
  }
  .toolbar button, .toolbar__share > button {
    appearance:none; border:0; cursor:pointer; font:inherit; font-weight:600;
    font-size:13.5px; border-radius:999px; padding:10px 18px;
  }
  .toolbar__primary { background:var(--indigo); color:#fff; }
  .toolbar__primary:hover { filter:brightness(1.05); }
  .toolbar__ghost { background:#fff; color:var(--ink); border:1px solid var(--line) !important; }
  .toolbar__share { position:relative; }
  .share-backdrop {
    display:none; position:fixed; inset:0; z-index:8;
    background:rgba(19,17,38,0.38); border:0; padding:0; margin:0; cursor:pointer;
  }
  .share-menu {
    position:absolute; right:0; top:calc(100% + 8px); width:min(320px, 86vw);
    background:#fff; border:1px solid var(--line); border-radius:16px;
    box-shadow:0 16px 40px rgba(19,17,38,0.18); padding:6px; z-index:9;
    max-height:min(70vh, 420px); overflow:auto;
  }
  .share-menu__title {
    display:none; padding:8px 12px 6px; font-size:12px; font-weight:700;
    letter-spacing:0.06em; text-transform:uppercase; color:var(--muted2);
    font-family:'Space Grotesk', system-ui, sans-serif;
  }
  .share-item {
    width:100%; display:flex; flex-direction:column; align-items:flex-start; gap:2px;
    text-align:left; padding:10px 12px !important; border-radius:12px !important;
    background:transparent; color:var(--ink);
  }
  .share-item:hover { background:var(--indigo-tint); }
  .share-item__label { font-size:13.5px; font-weight:700; }
  .share-item__hint { font-size:11.5px; font-weight:500; color:var(--muted); }
  .share-toast {
    position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
    background:var(--ink); color:#fff; font-size:13px; font-weight:600;
    padding:10px 16px; border-radius:999px; z-index:20;
    box-shadow:0 10px 30px rgba(19,17,38,0.25);
  }
  .sheet {
    max-width:720px; margin:0 auto; background:#fff;
    border:1px solid var(--line); border-radius:24px; overflow:hidden;
    box-shadow:0 18px 50px rgba(19,17,38,0.08);
  }
  .hero {
    padding:28px 34px 22px;
    background:
      radial-gradient(120% 80% at 100% -10%, rgba(59,46,211,0.16), transparent 55%),
      linear-gradient(180deg, #FBFAFF 0%, #FFFFFF 100%);
    border-bottom:1px solid var(--line);
  }
  .letterhead { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; }
  .letterhead__brand { display:flex; flex-direction:column; gap:6px; }
  .letterhead__tag {
    font-size:11.5px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase;
    color:var(--muted2); margin:0;
  }
  .letterhead__addr {
    text-align:right; font-size:12px; line-height:1.55; color:var(--muted);
    min-width:200px; max-width:260px;
  }
  .letterhead__addr div:empty { height:0.55em; }
  .letterhead__addr--compact { display:none; }
  .doc-foot__offices {
    display:none; margin-top:14px; padding-top:14px; border-top:1px solid var(--line);
    color:var(--muted); font-size:12px; line-height:1.55;
  }
  .doc-foot__offices-grid {
    display:grid; gap:14px; margin-top:8px;
  }
  .doc-foot__office strong {
    display:inline-block; margin-bottom:2px; color:var(--ink); font-weight:700;
  }
  .doc-foot__email { margin-top:10px; font-weight:600; color:var(--ink); }
  h1 {
    font-family:'Space Grotesk', system-ui, sans-serif; font-size:26px; font-weight:700;
    letter-spacing:-0.03em; margin:22px 0 8px;
  }
  .sub { color:var(--muted); font-size:14px; margin:0; line-height:1.45; max-width:36em; }
  .badge {
    display:inline-flex; align-items:center; gap:6px; margin-top:14px;
    padding:5px 11px; border-radius:999px; font-size:12px; font-weight:700;
    background:var(--success-tint); color:var(--success);
  }
  .badge::before {
    content:""; width:7px; height:7px; border-radius:50%; background:currentColor;
  }
  .amount-panel {
    margin:22px 34px 0; padding:20px 22px; border-radius:18px;
    background:var(--indigo-tint); border:1px solid rgba(59,46,211,0.12);
  }
  .amount-caption {
    margin:0; font-size:12px; font-weight:700; letter-spacing:0.07em;
    text-transform:uppercase; color:var(--indigo);
  }
  .amount {
    font-family:'DM Mono', ui-monospace, monospace; font-size:36px; font-weight:500;
    letter-spacing:-0.03em; margin:6px 0 0; color:var(--ink);
  }
  .party { margin:6px 0 0; color:var(--muted); font-size:13.5px; font-weight:500; }
  .body { padding:8px 34px 28px; }
  .block { margin-top:22px; }
  h2 {
    font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;
    color:var(--muted2); margin:0 0 10px;
  }
  table { width:100%; border-collapse:collapse; }
  th, td {
    text-align:left; font-size:13.5px; padding:11px 0;
    border-bottom:1px solid var(--line); vertical-align:top;
  }
  th { font-weight:500; color:var(--muted); width:42%; padding-right:16px; }
  td { font-weight:600; word-break:break-word; }
  td.mono { font-family:'DM Mono', ui-monospace, monospace; font-weight:500; font-size:13px; }
  tr:last-child th, tr:last-child td { border-bottom:none; }
  footer.doc-foot {
    margin:8px 34px 28px; padding-top:16px; border-top:1px solid var(--line);
    color:var(--muted2); font-size:11.5px; line-height:1.65;
  }
  @media print {
    @page { margin:14mm; }
    body { background:#fff; padding:0; }
    .toolbar, .share-toast, .share-backdrop { display:none !important; }
    .sheet {
      border:none; border-radius:0; box-shadow:none; max-width:none;
    }
    .hero { background:#fff; }
    .amount-panel { break-inside:avoid; }
    .letterhead__addr--full { display:block !important; }
    .letterhead__addr--compact { display:none !important; }
    .doc-foot__offices { display:none !important; }
  }
  @media (max-width:560px) {
    body { padding:16px 12px 40px; }
    .toolbar {
      justify-content:stretch; gap:8px; margin-bottom:12px;
      padding:8px 0; background:rgba(246,244,239,0.97);
    }
    .toolbar button, .toolbar__share { flex:1 1 auto; }
    .toolbar__share > button, .toolbar__ghost, .toolbar__primary { width:100%; }
    .toolbar__share { position:static; }
    body.share-open .share-backdrop { display:block; }
    .share-menu {
      position:fixed; left:12px; right:12px; top:auto;
      bottom:max(12px, env(safe-area-inset-bottom, 0px));
      width:auto; max-height:min(70vh, 440px);
      border-radius:20px; box-shadow:0 22px 56px rgba(19,17,38,0.28);
      z-index:10; padding:8px 6px 10px;
    }
    .share-menu__title { display:block; }
    .hero, .body, footer.doc-foot, .amount-panel { padding-left:18px; padding-right:18px; }
    .amount-panel { margin-left:16px; margin-right:16px; }
    .letterhead { flex-direction:column; gap:12px; }
    .letterhead__addr--full { display:none; }
    .letterhead__addr--compact {
      display:block; text-align:left; min-width:0; max-width:none;
    }
    .doc-foot__offices { display:block; }
    .amount { font-size:28px; }
  }
</style></head>
<body>
  <div class="toolbar" role="region" aria-label="Receipt actions">
    <button type="button" class="toolbar__ghost" onclick="window.close()">Close</button>
    <div class="toolbar__share">
      <button type="button" class="toolbar__ghost" id="share-toggle" aria-haspopup="menu" aria-expanded="false" aria-controls="share-menu">Share</button>
      <div class="share-menu" id="share-menu" role="menu" hidden>
        <div class="share-menu__title">Share receipt</div>
        ${shareMenuItemsHtml()}
      </div>
    </div>
    <button type="button" class="toolbar__primary" onclick="window.print()">Download PDF</button>
  </div>
  <button type="button" class="share-backdrop" id="share-backdrop" hidden aria-label="Dismiss share menu"></button>
  <div class="share-toast" id="share-toast" hidden role="status" aria-live="polite"></div>
  <main class="sheet">
    <header class="hero">
      <div class="letterhead">
        <div class="letterhead__brand">
          ${MBOKA_LOGO_SVG}
          <p class="letterhead__tag">${esc(MBOKA_LETTERHEAD.tagline)}</p>
        </div>
        <div class="letterhead__addr letterhead__addr--full">${addressHtml}</div>
        <div class="letterhead__addr letterhead__addr--compact">${compactAddrHtml}</div>
      </div>
      <h1>${esc(doc.heading)}</h1>
      ${doc.subheading ? `<p class="sub">${esc(doc.subheading)}</p>` : ""}
      ${doc.statusBadge ? `<span class="badge">${esc(doc.statusBadge)}</span>` : ""}
    </header>
    ${
      doc.amount
        ? `<div class="amount-panel">
      ${doc.amountCaption ? `<p class="amount-caption">${esc(doc.amountCaption)}</p>` : ""}
      <p class="amount">${esc(doc.amount)}</p>
      ${doc.party ? `<p class="party">${esc(doc.party)}</p>` : ""}
    </div>`
        : ""
    }
    <div class="body">
      ${doc.sections.map(renderSection).join("")}
    </div>
    <footer class="doc-foot">
      Generated ${esc(generated)} · ${esc(MBOKA_LETTERHEAD.product)} business payments.
      ${doc.footnote ? ` ${esc(doc.footnote)}` : ""}
      This is a computer-generated receipt and does not require a signature.
      <div class="doc-foot__offices">
        <div class="doc-foot__offices-grid">${officesFootHtml}</div>
        <div class="doc-foot__email">${esc(MBOKA_LETTERHEAD.email)}</div>
      </div>
    </footer>
  </main>
  ${shareScript(sharePayload)}
</body></html>`;
}

/**
 * Open the document in a new tab. "Download PDF" uses the browser print
 * dialog (Save as PDF) — no PDF library, and the user gets a real PDF.
 * Falls back to downloading the HTML when popups are blocked.
 */
export function openBrandedDocument(doc: BrandedDocument, filenameStem: string): void {
  const html = renderBrandedDocument(doc, { filenameStem });
  const win = window.open("", "_blank");
  if (win) {
    win.opener = null;
    win.document.write(html);
    win.document.close();
    // Hint the print dialog's default filename where browsers honour <title>.
    try {
      win.document.title = filenameStem.endsWith(".pdf")
        ? filenameStem
        : `${filenameStem}.pdf`;
    } catch {
      /* cross-origin / closed — ignore */
    }
    return;
  }
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameStem}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
