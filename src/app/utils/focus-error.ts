// After a form shows its errors, scroll to the first wrong field and put the cursor in it.
// Without this, an error can sit above or below the part of the page the person is looking at.
export function focusFirstError(root: HTMLElement) {
  // wait one moment so the error messages have been drawn
  setTimeout(() => {
    const field = root.querySelector<HTMLElement>('.is-invalid');
    const target = field ?? root.querySelector<HTMLElement>('.err');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field?.focus({ preventScroll: true });
  }, 0);
}
