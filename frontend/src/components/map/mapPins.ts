/**
 * Google Maps–style teardrop marker (bottom anchor).
 */

const DEFAULT_FILL = "#EA4335";

export function createGoogleMapPinElement(options?: {
  fill?: string;
  size?: number;
  /** Plain white dot (stops) or house glyph (saved homes). */
  inner?: "dot" | "home";
  /** Larger shadow + sharper stroke — dashboard scatter pins. */
  emphasis?: boolean;
}): HTMLElement {
  const fill = options?.fill ?? DEFAULT_FILL;
  const w = options?.size ?? 28;
  const inner = options?.inner ?? "dot";
  const emphasis = options?.emphasis ?? false;

  const wrap = document.createElement("div");
  const shadow =
    emphasis
      ? "drop-shadow(0 3px 6px rgba(0,0,0,0.48)) drop-shadow(0 0 1px rgba(255,255,255,0.45))"
      : "drop-shadow(0 2px 5px rgba(0,0,0,0.38))";

  wrap.style.cssText = `
    width: ${w}px;
    height: ${Math.round(w * 1.25)}px;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    pointer-events: auto;
    filter: ${shadow};
    transition: transform 0.13s ease;
  `;

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("width", `${w}`);
  svg.setAttribute("height", `${Math.round(w * 1.25)}`);
  svg.setAttribute("viewBox", "0 0 24 31");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS(svgNs, "path");
  path.setAttribute(
    "d",
    "M12 .25C7.17.25 3.25 4.41 3.25 9.62c0 6.93 8.56 17.93 8.77 18.18.13.17.38.52.94.93.53.42 1.28.92 2.06.93.78-.01 1.53-.52 2.06-.93.55-.41.82-.76.94-.93.21-.25 8.73-11.03 8.73-18.18C20.75 4.41 16.82.25 12 .25Zm0 12.94a5.56 5.56 0 1 1 0-11.12 5.56 5.56 0 0 1 0 11.12z"
  );
  path.setAttribute("fill", fill);
  path.setAttribute("stroke", emphasis ? "rgba(15,23,42,0.42)" : "rgba(15,23,42,0.32)");
  path.setAttribute("stroke-width", emphasis ? "0.75" : "0.55");

  svg.appendChild(path);

  if (inner === "home") {
    const g = document.createElementNS(svgNs, "g");
    g.setAttribute("transform", "translate(12, 9.85) scale(0.42) translate(-12, -11.95)");
    const home = document.createElementNS(svgNs, "path");
    home.setAttribute("d", "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z");
    home.setAttribute("fill", "#ffffff");
    home.setAttribute("opacity", "0.97");
    g.appendChild(home);
    svg.appendChild(g);
  } else {
    const dot = document.createElementNS(svgNs, "circle");
    dot.setAttribute("cx", "12");
    dot.setAttribute("cy", "9.55");
    dot.setAttribute("r", emphasis ? "3.45" : "3.25");
    dot.setAttribute("fill", "#fff");
    dot.setAttribute("opacity", "0.96");
    svg.appendChild(dot);
  }

  wrap.appendChild(svg);
  return wrap;
}
