import { renderToString } from "react-dom/server";
import type { ReactElement } from "react";

// Lightweight smoke-test helper for viz components. Uses server-side
// renderToString so we don't need a JSDOM environment — viz components
// produce SVG which is purely structural. Effects + useEffect bodies
// don't run during SSR, but that's fine: we only assert the initial
// render doesn't throw and produces the expected anchor elements.

export function renderViz(node: ReactElement): string {
  return renderToString(node);
}

// Assert the SVG output contains an `<svg ...>` opening tag — proof
// that the component mounted past its useState/useMemo setup.
export function assertHasSvg(html: string): void {
  if (!/<svg\b/.test(html)) {
    throw new Error(`Expected output to contain <svg ...>, got: ${html.slice(0, 200)}`);
  }
}
