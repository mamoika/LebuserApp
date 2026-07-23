export function fitRoutePagesForPrint(root = document) {
  const PRINT_DENSE_CLASS = 'is-print-dense';
  const PRINT_EXTRA_DENSE_CLASS = 'is-print-extra-dense';
  const PRINT_ULTRA_DENSE_CLASS = 'is-print-ultra-dense';
  const pages = root.querySelectorAll('.clients-routes-view .route-grid-page:not(.is-print-empty)');

  pages.forEach(page => {
    const maxClients = Number(page.dataset.printMaxClients || 0);
    page.classList.remove(PRINT_DENSE_CLASS, PRINT_EXTRA_DENSE_CLASS, PRINT_ULTRA_DENSE_CLASS);
    page.classList.toggle(PRINT_DENSE_CLASS, maxClients > 18);
    page.classList.toggle(PRINT_EXTRA_DENSE_CLASS, maxClients > 26);

    const fitsOnA4 = () => {
      const pageRect = page.getBoundingClientRect();
      if (!pageRect.width) return true;
      const safeA4Height = pageRect.width * (209 / 297);
      return pageRect.height <= safeA4Height;
    };

    if (!fitsOnA4()) {
      page.classList.add(PRINT_DENSE_CLASS);
    }
    if (!fitsOnA4()) {
      page.classList.add(PRINT_EXTRA_DENSE_CLASS);
    }
    if (!fitsOnA4()) {
      page.classList.add(PRINT_ULTRA_DENSE_CLASS);
    }
  });
}
