// PDF shown / printed by the app itself (pdf.js) — for tablets and phones, whose browsers cannot show a
// PDF inside a page (they display an « Ouvrir » button with a random name instead).
// pdf.js is loaded only the first time a PDF is opened on such a device.

// Computers (Chrome, Edge, Firefox, Safari on Mac) show PDFs natively in the page.
export function nativePdfViewer() {
  const ua = navigator.userAgent || '';
  const ipadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPad « desktop » mode
  if (ipadOS || /Android|iPad|iPhone|iPod|Mobile|Silk|Kindle/i.test(ua)) return false;
  return navigator.pdfViewerEnabled !== false;
}

let lib = null;
function loadPdfjs() {
  if (!lib) {
    lib = import('pdfjs-dist/legacy/build/pdf').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.js', import.meta.url).toString();
      return pdfjs;
    });
  }
  return lib;
}

// Renders every page into canvases appended to `container`, `width` CSS pixels wide.
// Returns { pages, cancel }. onPage(i, n) reports progress.
export async function renderPdf(url, container, { width, onPage } = {}) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ url, isEvalSupported: false });
  let cancelled = false;
  const pdf = await task.promise;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvases = [];
  for (let i = 1; i <= pdf.numPages && !cancelled; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = (width / base.width) * dpr;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
    canvas.className = 'pdv__page';
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    if (cancelled) break;
    container.appendChild(canvas);
    canvases.push(canvas);
    onPage?.(i, pdf.numPages);
  }
  return { canvases, pages: pdf.numPages, cancel: () => { cancelled = true; pdf.destroy(); } };
}

// Prints pages (images) on A4 with the page's own print: everything else is hidden while printing.
// Each page is fitted on an A4 sheet (A4 landscape for a landscape page). The A4 rules only exist
// during this print, so the app's other prints keep their own layout.
const A4_STYLE = `
@page { size: A4 portrait; margin: 5mm; }
@page cami-a4-land { size: A4 landscape; margin: 5mm; }
@media print {
  body.pdv-printing > *:not(.pdv-print) { display: none !important; }
  html, body.pdv-printing { background: #fff !important; }
  body.pdv-printing { margin: 0 !important; padding: 0 !important; }
  body.pdv-printing .pdv-print { display: block !important; }
  .pdv-print .pdv-sheet { width: 200mm; height: 287mm; display: flex; align-items: center; justify-content: center;
    overflow: hidden; break-after: page; page-break-after: always; break-inside: avoid; }
  .pdv-print .pdv-sheet:last-child { break-after: auto; page-break-after: auto; }
  .pdv-print .pdv-sheet.is-land { page: cami-a4-land; width: 287mm; height: 200mm; }
  .pdv-print .pdv-sheet img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
}`;

export function printImages(srcs) {
  document.querySelectorAll('.pdv-print, #pdv-a4').forEach(el => el.remove()); // leftovers of a previous print
  const style = document.createElement('style');
  style.id = 'pdv-a4';
  style.textContent = A4_STYLE;
  document.head.appendChild(style);
  const box = document.createElement('div');
  box.className = 'pdv-print';
  const imgs = srcs.map((src) => {
    const sheet = document.createElement('div');
    sheet.className = 'pdv-sheet';
    const img = document.createElement('img');
    img.src = typeof src === 'string' ? src : src.src;
    sheet.appendChild(img);
    box.appendChild(sheet);
    return { img, sheet };
  });
  document.body.appendChild(box);
  document.body.classList.add('pdv-printing');
  const done = () => {
    document.body.classList.remove('pdv-printing');
    box.remove(); style.remove();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  // decode the images, turn the landscape ones into A4 landscape sheets, then open the print dialog
  Promise.all(imgs.map(({ img, sheet }) => (img.decode ? img.decode() : Promise.resolve()).catch(() => {})
    .then(() => { if (img.naturalWidth > img.naturalHeight) sheet.classList.add('is-land'); })))
    .then(() => setTimeout(() => { window.print(); setTimeout(done, 60000); }, 50)); // afterprint cleans up; fallback later
}

// Whole PDF → page images at print quality (~200 dpi on A4)
export async function pdfToImages(url) {
  const holder = document.createElement('div');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { canvases } = await renderPdf(url, holder, { width: 1654 / dpr });
  return canvases.map(c => c.toDataURL('image/jpeg', 0.92));
}
