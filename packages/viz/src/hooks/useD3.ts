import { useRef, useEffect } from "react";
import * as d3 from "d3";

export function useD3(
  renderFn: (svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void,
  deps: any[] = []
) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (ref.current) {
      const svg = d3.select(ref.current);
      svg.selectAll("*").remove();
      renderFn(svg);
    }
  }, deps);

  return ref;
}
