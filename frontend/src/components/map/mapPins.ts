/**
 * Lightweight Google Maps–style marker (classic teardrop, bottom anchor).
 */

const DEFAULT_FILL = "#EA4335";

export function createGoogleMapPinElement(options?: {
  fill?: string;
  /** Total width of the pin in px */
  size?: number;
}): HTMLElement {
  const fill = options?.fill ?? DEFAULT_FILL;
  const w = options?.size ?? 28;

  const wrap = document.createElement("div");
  wrap.style.cssText = `
    width: ${w}px;
    height: ${Math.round(w * 1.25)}px;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    pointer-events: auto;
    filter: drop-shadow(0 2px 5px rgba(0,0,0,0.38));
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
  path.setAttribute("stroke", "rgba(15,23,42,0.32)");
  path.setAttribute("stroke-width", "0.55");

  const inner = document.createElementNS(svgNs, "circle");
  inner.setAttribute("cx", "12");
  inner.setAttribute("cy", "9.55");
  inner.setAttribute("r", "3.25");
  inner.setAttribute("fill", "#fff");
  inner.setAttribute("opacity", "0.96");

  svg.appendChild(path);
  svg.appendChild(inner);
  wrap.appendChild(svg);

  return wrap;
}
