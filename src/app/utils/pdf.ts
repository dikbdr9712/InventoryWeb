// Saves one piece of the page as an A4 PDF.
// The piece is copied off-screen at a fixed desktop width first, so a PDF made on a phone looks exactly like one
// made on a computer (the layout follows the width of its container, not of the screen).
// The PDF libraries are loaded only when someone downloads.
export async function downloadPdf(source: HTMLElement, fileName: string, width = 760): Promise<void> {
  const holder = document.createElement('div');
  holder.style.cssText = `position: fixed; left: -10000px; top: 0; width: ${width}px; background: #fff; z-index: -1;`;
  const copy = source.cloneNode(true) as HTMLElement;
  copy.style.width = `${width}px`;
  copy.style.maxWidth = 'none';
  copy.style.margin = '0';
  copy.style.boxShadow = 'none';
  // The PDF renderer draws plain digits and ignores letter spacing; lay the copy out the same way,
  // or it leaves gaps after numbers ("10 :14").
  for (const el of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('*'))]) {
    el.style.fontVariantNumeric = 'normal';
    el.style.fontFeatureSettings = 'normal';
    el.style.letterSpacing = 'normal';
  }
  holder.appendChild(copy);
  document.body.appendChild(holder);

  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
    await Promise.all(Array.from(copy.querySelectorAll('img')).map(img =>
      img.complete ? Promise.resolve() : new Promise(done => { img.onload = img.onerror = () => done(null); })));
    const canvas = await html2canvas(copy, { backgroundColor: '#ffffff', scale: 2, useCORS: true, width, windowWidth: width });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const margin = 10;
    const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
    const imageHeight = (canvas.height * pageWidth) / canvas.width;
    const image = canvas.toDataURL('image/png');

    // long receipts continue on the next page
    let shown = 0;
    pdf.addImage(image, 'PNG', margin, margin, pageWidth, imageHeight);
    shown += pageHeight;
    while (shown < imageHeight) {
      pdf.addPage();
      pdf.addImage(image, 'PNG', margin, margin - shown, pageWidth, imageHeight);
      shown += pageHeight;
    }
    pdf.save(fileName);
  } finally {
    holder.remove();
  }
}
