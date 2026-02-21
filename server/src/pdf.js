import puppeteer from 'puppeteer';
import { marked } from 'marked';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_PATH = path.resolve(__dirname, '../assets/mactech-logo-black.png');

function loadLogoDataUri() {
  try {
    const logoBuffer = fs.readFileSync(LOGO_PATH);
    return `data:image/png;base64,${logoBuffer.toString('base64')}`;
  } catch {
    return '';
  }
}

const LOGO_DATA_URI = loadLogoDataUri();

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderSignatureRows(signatures) {
  if (!signatures.length) {
    return `
      <tr>
        <td colspan="3">No signatures captured yet.</td>
      </tr>
    `;
  }
  return signatures
    .map(
      (sig) => `
      <tr>
        <td>${esc(sig.signatureMeaning)}</td>
        <td>${esc(sig.signer.firstName)} ${esc(sig.signer.lastName)}</td>
        <td>Electronically Signed: ${new Date(sig.signedAt).toLocaleString()}</td>
      </tr>
    `
    )
    .join('');
}

function renderRevisionRows(revisions) {
  if (!revisions.length) {
    return `
      <tr>
        <td colspan="4">No revisions recorded.</td>
      </tr>
    `;
  }
  return revisions
    .map(
      (rev) => `
      <tr>
        <td>${esc(rev.versionMajor)}.${esc(rev.versionMinor)}</td>
        <td>${rev.effectiveDate ? new Date(rev.effectiveDate).toLocaleDateString() : '-'}</td>
        <td>${esc(rev.author.firstName)} ${esc(rev.author.lastName)}</td>
        <td>${esc(rev.summaryOfChange)}</td>
      </tr>
    `
    )
    .join('');
}

function watermark(uncontrolled) {
  return uncontrolled
    ? `<div class="watermark">UNCONTROLLED COPY - FOR REFERENCE USE ONLY</div>`
    : '';
}

/** Display label for PDF cover by document type (shown in place of "STANDARD OPERATING PROCEDURE") */
const DOCUMENT_TYPE_LABELS = {
  SOP: 'STANDARD OPERATING PROCEDURE',
  POLICY: 'POLICY',
  WORK_INSTRUCTION: 'WORK INSTRUCTION',
  FORM: 'FORM',
  OTHER: 'DOCUMENT',
};

function documentTypeLabel(documentType) {
  return DOCUMENT_TYPE_LABELS[documentType] ?? 'DOCUMENT';
}

function logoLockup() {
  if (LOGO_DATA_URI) {
    return `<img src="${LOGO_DATA_URI}" class="logo-image" alt="MacTech Solutions logo" />`;
  }
  return `
    <div class="logo-lockup" aria-label="MacTech Solutions logo">
      <svg class="logo-mark" viewBox="0 0 52 34" xmlns="http://www.w3.org/2000/svg" role="img">
        <path d="M1 31V13.5L13.5 18.8V31H1Z" fill="#000"/>
        <path d="M18 31V7.8L30.5 13.2V31H18Z" fill="#000"/>
        <path d="M35 31V2.3L47.5 7.7V31H35Z" fill="#000"/>
      </svg>
      <div class="logo-text">
        <div class="logo-word">MacTech</div>
        <div class="logo-sub">SOLUTIONS</div>
      </div>
    </div>
  `;
}

function sanitizeHtmlForPdf(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\s on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s on\w+\s*=\s*[^\s>]*/gi, '');
}

function buildHtml({ document, signatures, revisions, uncontrolled }) {
  const version = `${document.versionMajor}.${document.versionMinor}`;
  const raw = (document.content || '').trim();
  const isHtml = raw.startsWith('<') && raw.includes('>');
  const contentHtml = isHtml ? sanitizeHtmlForPdf(raw) : marked.parse(raw);
  const effectiveDateText = document.effectiveDate
    ? new Date(document.effectiveDate).toLocaleDateString()
    : 'Pending Release';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: A4; margin: 0.5in; }
    body {
      font-family: "Helvetica", "Arial", sans-serif;
      margin: 0;
      padding: 0;
      background-color: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      box-sizing: border-box;
    }
    .page {
      width: 210mm;
      min-height: 0;
      height: auto;
      padding: 0.5in;
      box-sizing: border-box;
      position: relative;
      display: flex;
      flex-direction: column;
      page-break-after: always;
      overflow: visible;
    }
    .page.cover-page {
      height: 262mm;
      min-height: 262mm;
      overflow: hidden;
    }
    .page.content-flow {
      page-break-after: auto;
    }
    .page.content-flow .content {
      flex-grow: 0;
    }
    .header {
      display: table;
      width: 100%;
      border-bottom: 1.5pt solid #707070;
      padding-bottom: 5mm;
      margin-bottom: 10mm;
      table-layout: fixed;
    }
    .header-cell { display: table-cell; vertical-align: middle; }
    .header-left { width: 20%; text-align: left; }
    .header-center { width: 60%; text-align: center; }
    .header-right { width: 20%; text-align: right; }
    .logo-lockup {
      display: inline-flex;
      align-items: center;
      gap: 2mm;
      color: #000;
    }
    .logo-image {
      display: block;
      height: 7mm;
      width: auto;
      object-fit: contain;
    }
    .logo-mark {
      width: 8mm;
      height: auto;
      display: block;
    }
    .logo-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1;
    }
    .logo-word {
      font-size: 9pt;
      font-weight: 700;
      color: #000;
      letter-spacing: 0.1pt;
    }
    .logo-sub {
      font-size: 4.6pt;
      font-weight: 600;
      color: #000;
      letter-spacing: 0.5pt;
      margin-top: 0.3mm;
    }
    .header-title, .header-meta {
      font-size: 11pt; font-weight: bold; color: #707070; line-height: 1.2;
    }
    .cover-main {
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    .sop-label, .main-title {
      font-size: 34pt;
      font-weight: bold;
      color: #000;
    }
    .sop-label { letter-spacing: 4pt; margin-bottom: 10mm; }
    .main-title { margin-bottom: 5mm; text-transform: uppercase; }
    .main-id { font-size: 22pt; margin-bottom: 2mm; color: #000; }
    .main-version { font-size: 16pt; margin-bottom: 10mm; color: #000; }
    .main-date { font-size: 14pt; font-weight: bold; color: #000; }
    .content {
      flex-grow: 1;
      font-size: 12pt;
      line-height: 1.5;
      color: #000;
      min-height: 0;
      overflow-wrap: break-word;
      word-wrap: break-word;
      word-break: break-word;
      max-width: 100%;
    }
    .final-section { page-break-before: always; }
    .content h1, .content h2, .content h3 {
      font-size: 12pt; font-weight: bold; margin-top: 8mm; margin-bottom: 3mm; text-transform: uppercase;
    }
    .content p { margin: 0 0 4mm 0; text-align: justify; overflow-wrap: break-word; word-wrap: break-word; }
    .content h1, .content h2, .content h3 { page-break-after: avoid; }
    .content table { page-break-inside: avoid; }
    .content li, .content ul, .content ol { overflow-wrap: break-word; word-wrap: break-word; }
    table { width: 100%; border-collapse: collapse; margin-top: 5mm; table-layout: fixed; }
    th, td { border: 0.5pt solid #000; padding: 3mm; font-size: 9pt; text-align: left; overflow-wrap: break-word; word-wrap: break-word; word-break: break-word; }
    th { background-color: #f0f0f0; font-weight: bold; }
    .footer {
      height: 10mm;
      display: flex;
      justify-content: center;
      align-items: flex-end;
      font-size: 9pt;
      color: #555;
    }
    .supersedes-container {
      padding-top: 10mm;
      font-size: 12pt;
      font-style: italic;
      text-align: center;
      color: #333;
      width: 100%;
    }
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 56pt;
      font-weight: bold;
      color: rgba(255, 0, 0, 0.2);
      text-transform: uppercase;
      width: 165mm;
      text-align: center;
      line-height: 1.15;
      white-space: normal;
      word-break: keep-all;
      pointer-events: none;
      z-index: 1000;
    }
  </style>
</head>
<body>
  <div class="page cover-page">
    ${watermark(uncontrolled)}
    <div class="cover-main">
      <div class="sop-label">${esc(documentTypeLabel(document.documentType))}</div>
      <div class="main-title">${esc(document.title)}</div>
      <div class="main-id">${esc(document.documentId)}</div>
      <div class="main-version">Version ${esc(version)}</div>
      <div class="main-date">Effective Date: ${esc(effectiveDateText)}</div>
    </div>
    <div class="supersedes-container">
      This publication supersedes any and all directives that were authored prior to the approval and implementation of this document.
    </div>
  </div>

  <div class="page content-flow">
    ${watermark(uncontrolled)}
    <div class="content">
      ${contentHtml}
    </div>
  </div>

  <div class="page final-section">
    ${watermark(uncontrolled)}
    <div class="content">
      <h1>7.0 APPROVAL & SIGNATURE HISTORY</h1>
      <table>
        <tr>
          <th>Role</th>
          <th>Name & Title</th>
          <th>Signature & Date</th>
        </tr>
        ${renderSignatureRows(signatures)}
      </table>

      <h1>8.0 REVISION HISTORY</h1>
      <table>
        <tr>
          <th>Version</th>
          <th>Effective Date</th>
          <th>Author</th>
          <th>Summary of Changes</th>
        </tr>
        ${renderRevisionRows(revisions)}
      </table>
    </div>
  </div>
</body>
</html>
`;
}

/** Build Puppeteer header template – compact padding to avoid excess space and content cutoff */
function buildPdfHeaderTemplate({ document, version }) {
  const title = esc(document.title);
  const meta = `${esc(document.documentId)}/${esc(version)}`;
  const logoHtml = LOGO_DATA_URI
    ? `<img src="${LOGO_DATA_URI}" style="height: 7mm; width: auto; display: block; object-fit: contain;" alt="" />`
    : '<span style="font-weight: 700; font-size: 9pt; color: #707070;">MacTech SOLUTIONS</span>';
  const gray = 'color: #707070;';
  return `
    <div id="header" style="background: #ffffff !important; width: 100%; margin: 0; padding: 2mm 4mm 2mm 4mm; border: none; border-bottom: 1px solid #707070; box-sizing: border-box; -webkit-print-color-adjust: exact;">
      <div style="width: 100%; font-size: 11pt; font-weight: bold; line-height: 1.2; display: table; color: #707070;">
        <div style="display: table-cell; width: 20%; text-align: left; vertical-align: middle;">${logoHtml}</div>
        <div style="display: table-cell; width: 60%; text-align: center; vertical-align: middle;"><span style="${gray}">${title}</span></div>
        <div style="display: table-cell; width: 20%; text-align: right; vertical-align: middle;"><span style="${gray}">${meta}</span></div>
      </div>
    </div>
  `.trim();
}

/** Build Puppeteer footer template – compact padding to avoid excess space and content cutoff */
function buildPdfFooterTemplate() {
  return `
    <div id="footer" style="background: #ffffff !important; width: 100%; margin: 0; padding: 2mm 4mm 2mm 4mm; box-sizing: border-box; font-size: 9pt; color: #555555; text-align: center; -webkit-print-color-adjust: exact;">
      <div style="width: 100%; font-size: 9pt; color: #555555; text-align: center;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>
    </div>
  `.trim();
}

export async function generateDocumentPdf({ document, signatures, revisions, uncontrolled }) {
  const version = `${document.versionMajor}.${document.versionMinor}`;
  const html = buildHtml({ document, signatures, revisions, uncontrolled });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: buildPdfHeaderTemplate({ document, version }),
      footerTemplate: buildPdfFooterTemplate(),
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

/** Simple PDF for a FormRecord: metadata + key/value pairs from payload. Used when no stored PDF. */
export async function generateFormRecordPdf(record) {
  const payload = record.payload && typeof record.payload === 'object' ? record.payload : {};
  const rows = Object.entries(payload).map(
    ([k, v]) => `<tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold;">${esc(k)}</td><td style="padding:4px 8px;border:1px solid #ddd;">${esc(String(v ?? ''))}</td></tr>`
  ).join('');
  const html = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><style>
  body{font-family:Helvetica,Arial,sans-serif;margin:20px;color:#000;}
  h1{font-size:16pt;margin-bottom:8px;}
  .meta{font-size:10pt;color:#555;margin-bottom:16px;}
  table{width:100%;border-collapse:collapse;margin-top:12px;}
</style></head><body>
  <h1>Completed Form Record</h1>
  <div class="meta">
    ${esc(record.templateCode)} &ndash; ${esc(record.recordNumber)} | Status: ${esc(record.status)} | Created: ${record.createdAt ? new Date(record.createdAt).toLocaleString() : ''}
  </div>
  <p><strong>${esc(record.title)}</strong></p>
  <table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>${rows || '<tr><td colspan="2">No data</td></tr>'}</tbody></table>
</body></html>`;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({ format: 'A4', printBackground: true });
  } finally {
    await browser.close();
  }
}
