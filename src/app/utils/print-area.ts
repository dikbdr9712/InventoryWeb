// Prints one piece of the page: either the narrow receipt (receipt printer) or the A4 sheet.
// It copies that piece into its own area and hides the rest of the page while printing,
// so it does not depend on anything in styles.css.
export function printElement(source: HTMLElement, kind: 'receipt' | 'a4') {
  // clear anything left from an earlier print
  document.getElementById('print-root')?.remove();
  document.getElementById('print-style')?.remove();

  const root = document.createElement('div');
  root.id = 'print-root';
  root.innerHTML = source.outerHTML;

  const page = kind === 'receipt' ? '@page { size: 80mm auto; margin: 3mm; }' : '@page { size: A4; margin: 12mm; }';
  const style = document.createElement('style');
  style.id = 'print-style';
  style.textContent = `
    #print-root { display: none; }
    @media print {
      ${page}
      html, body { background: #fff !important; margin: 0 !important; }
      body > *:not(#print-root) { display: none !important; }
      #print-root { display: block !important; }
      #print-root .sheet { box-shadow: none !important; padding: 0 !important; max-width: none !important; }
      #print-root .receipt-print { display: block !important; width: 74mm; }
    }`;

  document.body.appendChild(root);
  document.head.appendChild(style);

  const cleanup = () => {
    root.remove();
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
