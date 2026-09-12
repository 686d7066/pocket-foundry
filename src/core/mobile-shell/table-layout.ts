const layouts = new WeakMap<HTMLElement, () => void>();

/** Allocates content-sized secondary columns and gives the primary column spare width. */
export function allocateTableColumns(width: number, gap: number, preferred: readonly number[], primary: number, fixed: readonly number[]): number[] {
  const available = Math.max(0, width - gap * Math.max(0, preferred.length - 1));
  const columns = preferred.map((value, index) => index === primary ? 0 : fixed.includes(index) ? value : Math.min(value, width * .16));
  const secondary = columns.reduce((sum, value) => sum + value, 0);
  const fixedWidth = columns.reduce((sum, value, index) => sum + (fixed.includes(index) ? value : 0), 0);
  const budget = Math.max(0, available - fixedWidth - Math.min(80, width * .3));
  const flexibleWidth = secondary - fixedWidth;
  if (flexibleWidth > budget) {
    columns.forEach((value, index) => {
      if (index !== primary && !fixed.includes(index)) columns[index] = value * budget / flexibleWidth;
    });
  }
  columns[primary] = Math.max(0, available - columns.reduce((sum, value) => sum + value, 0));
  return columns;
}

/** Releases observers before shell replacement or unmount. */
export function disposeTableLayout(root: HTMLElement): void {
  layouts.get(root)?.();
  layouts.delete(root);
}

/** Measures actual rendered cells and shares explicit tracks across ordinary row grids. */
export function initializeTableLayout(root: HTMLElement): void {
  disposeTableLayout(root);
  if (typeof ResizeObserver === "undefined" || typeof requestAnimationFrame === "undefined") return;
  const tables = [...root.querySelectorAll<HTMLElement>("[data-table-layout]")];
  if (!tables.length) return;
  let frame = 0;
  let disposed = false;
  const widths = new WeakMap<HTMLElement, number>();
  const refresh = (): void => {
    frame = 0;
    if (!disposed) tables.forEach(measureTable);
  };
  const schedule = (): void => {
    if (!disposed && !frame) frame = requestAnimationFrame(refresh);
  };
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const table = entry.target;
      if (!(table instanceof HTMLElement) || widths.get(table) === entry.contentRect.width) continue;
      widths.set(table, entry.contentRect.width);
      schedule();
    }
  });
  tables.forEach(table => observer.observe(table));
  root.addEventListener("toggle", schedule, true);
  root.addEventListener("load", schedule, true);
  void root.ownerDocument.fonts?.ready.then(schedule);
  schedule();
  layouts.set(root, () => {
    disposed = true;
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    root.removeEventListener("toggle", schedule, true);
    root.removeEventListener("load", schedule, true);
  });
}

/** Measures only this table's headers and summaries, excluding nested detail tables. */
function measureTable(table: HTMLElement): void {
  if (!table.isConnected || !table.getClientRects().length || table.closest("details:not([open])")) return;
  const rows = [...table.querySelectorAll<HTMLElement>(":scope > .sheet-list-head, :scope > .content-list-head, :scope > .content-list-row, :scope > [data-table-row], :scope > article > details > summary")];
  const dataRows = rows.filter(row => !row.classList.contains("sheet-list-head") && !row.classList.contains("content-list-head"));
  const cellsFor = (row: HTMLElement): Element[] => [...row.children].flatMap(cell => cell.hasAttribute("data-table-cell-group") ? [...cell.children] : [cell]);
  const count = Math.max(0, ...dataRows.map(row => cellsFor(row).length));
  if (!count) return;
  const primary = (table.dataset.tableLayout ?? "").split("-").indexOf("title");
  if (primary < 0 || primary >= count) return;
  const preferred = Array<number>(count).fill(0);
  for (const row of rows) {
    const original = row.getAttribute("style");
    const groups = [...row.querySelectorAll<HTMLElement>(":scope > [data-table-cell-group]")];
    const groupStyles = groups.map(group => group.getAttribute("style"));
    try {
      row.style.setProperty("grid-template-columns", `repeat(${count}, max-content)`, "important");
      row.style.setProperty("width", "max-content", "important");
      row.style.setProperty("max-width", "none", "important");
      groups.forEach(group => group.style.setProperty("grid-template-columns", `repeat(${group.children.length}, max-content)`, "important"));
      const cells = cellsFor(row);
      const offset = count - cells.length;
      cells.forEach((cell, index) => {
        preferred[index + offset] = Math.max(preferred[index + offset], cell.getBoundingClientRect().width);
      });
    } finally {
      if (original === null) row.removeAttribute("style");
      else row.setAttribute("style", original);
      groups.forEach((group, index) => {
        const originalStyle = groupStyles[index];
        if (originalStyle == null) group.removeAttribute("style");
        else group.setAttribute("style", originalStyle);
      });
    }
  }
  const style = getComputedStyle(table);
  const width = table.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0");
  const fixed = primary > 0 ? [0] : [];
  if (table.dataset.tableLayout?.endsWith("actions")) fixed.push(count - 1);
  const columns = allocateTableColumns(width, parseFloat(style.getPropertyValue("--pf-table-gap")) || 0, preferred, primary, fixed);
  table.style.setProperty("--pf-table-columns", columns.map(value => `${value}px`).join(" "));
  table.style.setProperty("--pf-table-leading-columns", columns.slice(0, -1).map(value => `${value}px`).join(" "));
}
