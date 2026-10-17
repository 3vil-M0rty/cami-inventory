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

// Prints images (data URLs / blob URLs) with the page's own print: everything else is hidden while
// printing. Works in tablet browsers, where printing a hidden frame does not.
export function printImages(srcs) {
  document.querySelectorAll('.pdv-print').forEach(el => el.remove()); // leftovers of a previous print
  const box = document.createElement('div');
  box.className = 'pdv-print';
  for (const src of srcs) {
    const img = document.createElement('img');
    img.src = src;
    box.appendChild(img);
  }
  document.body.appendChild(box);
  document.body.classList.add('pdv-printing');
  const done = () => {
    document.body.classList.remove('pdv-printing');
    box.remove();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  // wait for the images to be decoded before opening the print dialog
  Promise.all([...box.querySelectorAll('img')].map(img => (img.decode ? img.decode().catch(() => {}) : null)))
    .then(() => setTimeout(() => { window.print(); setTimeout(done, 60000); }, 50)); // afterprint cleans up; fallback later
}

// Whole PDF → page images for printing (rendered at print quality, ~150 dpi on A4)
export async function pdfToImages(url) {
  const holder = document.createElement('div');
  const { canvases } = await renderPdf(url, holder, { width: 1240 / Math.min(window.devicePixelRatio || 1, 2) });
  return canvases.map(c => c.toDataURL('image/jpeg', 0.92));
}
