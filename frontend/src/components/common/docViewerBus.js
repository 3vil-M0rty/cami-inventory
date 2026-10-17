// Opens the in-app document viewer / prints a document on A4 from anywhere (Achats, Projets…).
// The viewer itself is mounted once in App (DocViewerHost); `base` is the API path of the documents:
// 'project-documents' or 'order-tracking/documents'.
export const showDocument = (doc, base) =>
  window.dispatchEvent(new CustomEvent('cami:doc-view', { detail: { doc, base } }));
export const printDocument = (doc, base) =>
  window.dispatchEvent(new CustomEvent('cami:doc-print', { detail: { doc, base } }));
