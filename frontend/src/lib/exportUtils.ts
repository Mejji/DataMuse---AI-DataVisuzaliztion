import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// ---------------------------------------------------------------------------
// oklch()/oklab() → rgb() conversion — PURE JAVASCRIPT
//
// html2canvas v1.x cannot parse oklch() or oklab() colors (used by
// Tailwind CSS v4). Some browsers (headless Chromium) return these from
// getComputedStyle rather than resolving to rgb(), so we cannot rely on
// the browser's CSS engine. Instead we implement the full conversion in JS.
//
// Strategy:
// 1. Robust regex matching all oklch()/oklab() variants
// 2. Pure JS math conversion: oklch/oklab → rgb
// 3. Rewrite ALL <style> tag text in the clone before html2canvas parses
// 4. Inline rgb on every element's style to override computed values
// ---------------------------------------------------------------------------

/**
 * CSS properties that can contain color values and may use oklch().
 */
const COLOR_PROPS = [
  'color', 'background-color', 'border-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'text-decoration-color', 'box-shadow', 'caret-color',
  'column-rule-color', 'fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color',
];

/**
 * Regex that matches oklch(...) and oklab(...) including / alpha syntax
 * and percentage values. Uses a balanced-paren approach.
 * Examples matched:
 *   oklch(0.5 0.2 240)
 *   oklch(0.5 0.2 240 / 0.8)
 *   oklab(0.5 0.1 -0.1)
 *   oklab(0.5 0.1 -0.1 / 50%)
 */
const OKLCH_RE = /oklch\((?:[^()]*|\([^()]*\))*\)/gi;
const OKLAB_RE = /oklab\((?:[^()]*|\([^()]*\))*\)/gi;
const OK_COLOR_RE = /ok(?:lch|lab)\((?:[^()]*|\([^()]*\))*\)/gi;

// ---------------------------------------------------------------------------
// Pure JS: oklch → sRGB conversion
// Reference: https://www.w3.org/TR/css-color-4/#color-conversion-code
// Pipeline: oklch → oklab → linear-sRGB → sRGB (gamma)
// ---------------------------------------------------------------------------

/** Clamp a value to [0, 1] */
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Apply sRGB gamma curve (linear → sRGB) */
const linearToSrgb = (x: number): number =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;

/**
 * Convert oklch(L, C, H) to [r, g, b] in 0..255.
 * L: lightness 0..1 (or 0%..100%)
 * C: chroma ≥ 0
 * H: hue in degrees 0..360
 */
const oklchToRgbValues = (L: number, C: number, H: number): [number, number, number] => {
  // oklch → oklab
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // oklab → LMS (cube roots)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  // Cube
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS → linear sRGB
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  // linear sRGB → sRGB (gamma) → 0..255
  const r = Math.round(clamp01(linearToSrgb(lr)) * 255);
  const g = Math.round(clamp01(linearToSrgb(lg)) * 255);
  const bv = Math.round(clamp01(linearToSrgb(lb)) * 255);

  return [r, g, bv];
};

/**
 * Parse an oklch() CSS function string and return an rgb()/rgba() string.
 * Handles:
 *   oklch(0.5 0.2 240)
 *   oklch(0.5 0.2 240 / 0.8)
 *   oklch(50% 0.2 240 / 80%)
 *   oklch(0.985 0.002 80)
 * Falls back to 'transparent' on parse failure.
 */
const oklchToRgb = (oklchStr: string): string => {
  try {
    // Strip "oklch(" and ")"
    const inner = oklchStr.replace(/^oklch\(\s*/i, '').replace(/\s*\)$/, '');

    // Split on "/" for alpha
    const [colorPart, alphaPart] = inner.split('/').map((s) => s.trim());

    // Parse L, C, H from space-separated values
    const parts = colorPart.split(/\s+/);
    if (parts.length < 3) return 'transparent';

    let L = parseFloat(parts[0]);
    const C = parseFloat(parts[1]);
    let H = parseFloat(parts[2]);

    // Handle percentage for lightness (e.g. 97.9% → 0.979)
    if (parts[0].endsWith('%')) {
      L = L / 100;
    }

    // Handle "none" values (CSS spec allows "none" for any component)
    if (isNaN(L)) L = 0;
    if (isNaN(H)) H = 0;

    const [r, g, b] = oklchToRgbValues(L, isNaN(C) ? 0 : C, H);

    // Parse alpha
    if (alphaPart !== undefined) {
      let alpha = parseFloat(alphaPart);
      if (alphaPart.endsWith('%')) {
        alpha = alpha / 100;
      }
      if (isNaN(alpha)) alpha = 1;
      alpha = clamp01(alpha);
      if (alpha < 1) {
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }

    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return 'transparent';
  }
};

/**
 * Convert oklab(L, a, b) to [r, g, b] in 0..255.
 * L: lightness 0..1 (or 0%..100%)
 * a: green-red axis (typically -0.4..0.4)
 * b: blue-yellow axis (typically -0.4..0.4)
 */
const oklabToRgbValues = (L: number, a: number, b: number): [number, number, number] => {
  // oklab → LMS (cube roots)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  // Cube
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS → linear sRGB
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  // linear sRGB → sRGB (gamma) → 0..255
  const r = Math.round(clamp01(linearToSrgb(lr)) * 255);
  const g = Math.round(clamp01(linearToSrgb(lg)) * 255);
  const bv = Math.round(clamp01(linearToSrgb(lb)) * 255);

  return [r, g, bv];
};

/**
 * Parse an oklab() CSS function string and return an rgb()/rgba() string.
 * Handles:
 *   oklab(0.5 0.1 -0.1)
 *   oklab(0.5 0.1 -0.1 / 0.8)
 *   oklab(50% 0.1 -0.1 / 80%)
 * Falls back to 'transparent' on parse failure.
 */
const oklabToRgb = (oklabStr: string): string => {
  try {
    const inner = oklabStr.replace(/^oklab\(\s*/i, '').replace(/\s*\)$/, '');
    const [colorPart, alphaPart] = inner.split('/').map((s) => s.trim());
    const parts = colorPart.split(/\s+/);
    if (parts.length < 3) return 'transparent';

    let L = parseFloat(parts[0]);
    let a = parseFloat(parts[1]);
    let b = parseFloat(parts[2]);

    if (parts[0].endsWith('%')) L = L / 100;
    // a and b percentages: CSS spec maps 100% → 0.4
    if (parts[1].endsWith('%')) a = (a / 100) * 0.4;
    if (parts[2].endsWith('%')) b = (b / 100) * 0.4;

    if (isNaN(L)) L = 0;
    if (isNaN(a)) a = 0;
    if (isNaN(b)) b = 0;

    const [r, g, bv] = oklabToRgbValues(L, a, b);

    if (alphaPart !== undefined) {
      let alpha = parseFloat(alphaPart);
      if (alphaPart.endsWith('%')) alpha = alpha / 100;
      if (isNaN(alpha)) alpha = 1;
      alpha = clamp01(alpha);
      if (alpha < 1) {
        return `rgba(${r}, ${g}, ${bv}, ${alpha})`;
      }
    }

    return `rgb(${r}, ${g}, ${bv})`;
  } catch {
    return 'transparent';
  }
};

/**
 * Replace all oklch() and oklab() occurrences in a CSS value string with rgb().
 */
const replaceOklch = (value: string): string => {
  if (!value) return value;
  if (!value.includes('oklch') && !value.includes('oklab')) return value;
  return value
    .replace(OKLCH_RE, (match) => oklchToRgb(match))
    .replace(OKLAB_RE, (match) => oklabToRgb(match));
};

/**
 * Collect all CSS custom properties from the document that contain oklch()
 * and return a stylesheet string that redefines them with rgb() values.
 * This covers :root, .dark, and any other selectors.
 */
const buildOklchOverrideStylesheet = (): string => {
  const overrides: string[] = [];

  // Read computed custom properties from :root
  const rootStyle = window.getComputedStyle(document.documentElement);
  const rootOverrides: string[] = [];
  const darkOverrides: string[] = [];

  // We need to read raw CSS to find oklch custom props since getComputedStyle
  // doesn't enumerate custom properties. Parse all stylesheets instead.
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin stylesheet — skip
      continue;
    }

    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      const style = rule.style;
      for (let i = 0; i < style.length; i++) {
        const prop = style[i];
        if (!prop.startsWith('--')) continue;
        const val = style.getPropertyValue(prop);
        if (val && (val.includes('oklch') || val.includes('oklab'))) {
          const rgb = replaceOklch(val);
          if (rule.selectorText === ':root' || rule.selectorText === ':root, :host') {
            rootOverrides.push(`  ${prop}: ${rgb};`);
          } else if (rule.selectorText === '.dark' || rule.selectorText.includes('.dark')) {
            darkOverrides.push(`  ${prop}: ${rgb};`);
          } else {
            overrides.push(`${rule.selectorText} { ${prop}: ${rgb}; }`);
          }
        }
      }
    }
  }

  let css = '';
  if (rootOverrides.length > 0) {
    css += `:root {\n${rootOverrides.join('\n')}\n}\n`;
  }
  if (darkOverrides.length > 0) {
    css += `.dark {\n${darkOverrides.join('\n')}\n}\n`;
  }
  if (overrides.length > 0) {
    css += overrides.join('\n') + '\n';
  }
  return css;
};

/**
 * Rewrite all <style> elements in a document/container, replacing any
 * oklch() color functions with their rgb() equivalents.
 * Also removes <link> stylesheet references to avoid html2canvas re-parsing
 * the original oklch-containing CSS, and replaces them with sanitized inline styles.
 */
const sanitizeStylesheets = (doc: Document): void => {
  // 1. Rewrite <style> tags
  const styles = doc.querySelectorAll('style');
  styles.forEach((style) => {
    if (style.textContent && (style.textContent.includes('oklch') || style.textContent.includes('oklab'))) {
      style.textContent = replaceOklch(style.textContent);
    }
  });

  // 2. Convert <link rel="stylesheet"> to inline <style> with oklch stripped.
  //    html2canvas fetches and parses linked stylesheets internally — if they
  //    contain oklch the parser will throw. By inlining them (already resolved
  //    by the browser) we bypass that entirely.
  //    NOTE: We only process same-origin sheets to avoid CORS issues.
  for (const sheet of Array.from(document.styleSheets)) {
    let rulesText = '';
    try {
      const rules = sheet.cssRules;
      for (const rule of Array.from(rules)) {
        rulesText += rule.cssText + '\n';
      }
    } catch {
      // Cross-origin — leave the <link> as-is; html2canvas will try to fetch it
      continue;
    }

    if (!rulesText.includes('oklch') && !rulesText.includes('oklab')) continue;

    // This sheet contains oklch — find the matching <link> in the clone and replace it
    if (sheet.ownerNode instanceof HTMLLinkElement) {
      const href = sheet.ownerNode.getAttribute('href');
      if (!href) continue;
      const cloneLink = doc.querySelector(`link[href="${CSS.escape(href)}"]`) as HTMLLinkElement | null;
      if (!cloneLink) {
        // Try partial match (vite adds hashes)
        const allLinks = doc.querySelectorAll('link[rel="stylesheet"]');
        for (const link of Array.from(allLinks)) {
          const linkHref = link.getAttribute('href');
          if (linkHref && (linkHref === href || href.includes(linkHref) || linkHref.includes(href))) {
            const inlineStyle = doc.createElement('style');
            inlineStyle.textContent = replaceOklch(rulesText);
            link.parentNode?.replaceChild(inlineStyle, link);
            break;
          }
        }
      } else {
        const inlineStyle = doc.createElement('style');
        inlineStyle.textContent = replaceOklch(rulesText);
        cloneLink.parentNode?.replaceChild(inlineStyle, cloneLink);
      }
    }
  }
};

/**
 * Walk every element inside `root` and convert oklch color values
 * to rgb so html2canvas can parse them. Reads computed styles from
 * `originalRoot` (the visible on-screen element) and writes rgb
 * overrides into `root` (the off-screen clone).
 */
const sanitizeOklchColors = (root: HTMLElement, originalRoot?: HTMLElement): void => {
  const elements = [root, ...Array.from(root.querySelectorAll('*'))] as (HTMLElement | SVGElement)[];
  const originals = originalRoot
    ? [originalRoot, ...Array.from(originalRoot.querySelectorAll('*'))] as (HTMLElement | SVGElement)[]
    : elements;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const orig = originals[Math.min(i, originals.length - 1)];
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue;

    const computed = window.getComputedStyle(orig instanceof HTMLElement || orig instanceof SVGElement ? orig : el);

    for (const prop of COLOR_PROPS) {
      const val = computed.getPropertyValue(prop);
      if (val && (val.includes('oklch') || val.includes('oklab'))) {
        el.style.setProperty(prop, replaceOklch(val));
      }
    }

    // Also fix any oklch/oklab in the element's inline style
    const inlineStyle = el.getAttribute('style');
    if (inlineStyle && (inlineStyle.includes('oklch') || inlineStyle.includes('oklab'))) {
      el.setAttribute('style', replaceOklch(inlineStyle));
    }
  }
};

// ---------------------------------------------------------------------------
// CSS properties to inline into SVG clones so serialized SVGs render
// identically outside the DOM (e.g. when drawn onto a <canvas>).
// ---------------------------------------------------------------------------
const INLINE_CSS_PROPS: string[] = [
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline', 'letter-spacing',
  'visibility', 'display', 'color', 'text-decoration',
];

/**
 * Inline computed CSS styles from a visible element into a cloned element.
 * Recurses into all child nodes so the entire sub-tree is self-contained.
 */
const inlineStyles = (original: Element, clone: Element): void => {
  if (!(original instanceof HTMLElement || original instanceof SVGElement)) return;
  if (!(clone instanceof HTMLElement || clone instanceof SVGElement)) return;

  const computed = window.getComputedStyle(original);
  for (const prop of INLINE_CSS_PROPS) {
    const val = computed.getPropertyValue(prop);
    if (val) {
      (clone as HTMLElement | SVGElement).style.setProperty(prop, val);
    }
  }

  const origChildren = original.children;
  const cloneChildren = clone.children;
  for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
    inlineStyles(origChildren[i], cloneChildren[i]);
  }
};

/**
 * Get dimensions from an SVG element using attributes, viewBox, or fallback.
 */
const getSvgDimensions = (svg: SVGSVGElement): { width: number; height: number } => {
  const attrW = svg.getAttribute('width');
  const attrH = svg.getAttribute('height');
  if (attrW && attrH) {
    const w = parseFloat(attrW);
    const h = parseFloat(attrH);
    if (w > 0 && h > 0) return { width: w, height: h };
  }

  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }

  if (svg.clientWidth > 0 && svg.clientHeight > 0) {
    return { width: svg.clientWidth, height: svg.clientHeight };
  }

  return { width: 400, height: 300 };
};

/**
 * Convert an SVG element to a high-resolution canvas.
 * 1. Clones the SVG
 * 2. Inlines all computed styles from the visible original
 * 3. Serializes to a data URI (not blob — avoids canvas tainting)
 * 4. Draws onto a 2x-scaled canvas
 */
const svgToCanvas = async (
  svg: SVGSVGElement,
  referenceSvg: SVGSVGElement,
): Promise<HTMLCanvasElement | null> => {
  try {
    const { width, height } = getSvgDimensions(referenceSvg);

    // Clone and inline computed styles from the visible SVG
    const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
    inlineStyles(referenceSvg, clonedSvg);

    // Ensure explicit dimensions and xmlns
    clonedSvg.setAttribute('width', String(width));
    clonedSvg.setAttribute('height', String(height));
    if (!clonedSvg.getAttribute('xmlns')) {
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    // Serialize to a data URI (not blob URL — this avoids cross-origin canvas tainting)
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);
    const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

    const img = new Image();
    img.width = width;
    img.height = height;

    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = dataUri;
      // If already decoded (cached data URI), resolve immediately
      if (img.complete && img.naturalWidth > 0) resolve();
      // Safety timeout
      setTimeout(() => resolve(), 5000);
    });

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
    }

    return canvas;
  } catch (e) {
    console.warn('SVG to canvas conversion failed:', e);
    return null;
  }
};

/**
 * Replace all SVG elements inside a container with pre-rendered canvas elements.
 * `originalContainer` should be the visible on-screen element (for reading computed styles).
 * `container` is the off-screen clone that will be captured by html2canvas.
 */
const convertSvgsToCanvas = async (
  container: HTMLElement,
  originalContainer?: HTMLElement,
): Promise<void> => {
  const svgs = Array.from(container.querySelectorAll('svg'));
  const originalSvgs = originalContainer
    ? Array.from(originalContainer.querySelectorAll('svg'))
    : svgs;

  for (let i = 0; i < svgs.length; i++) {
    const svg = svgs[i] as SVGSVGElement;
    const refSvg = (originalSvgs[i] ?? svg) as SVGSVGElement;

    const canvas = await svgToCanvas(svg, refSvg);
    if (canvas) {
      svg.parentNode?.replaceChild(canvas, svg);
    }
  }
};

/**
 * Capture an HTML element as a high-res canvas image.
 * Handles SVG pre-conversion, cloning, and dark mode background.
 *
 * The oklch sanitization happens at THREE levels to ensure html2canvas
 * never encounters an oklch() value:
 *
 *   1. Pre-compute an override stylesheet with all oklch CSS vars → rgb
 *   2. In the `onclone` callback (which fires BEFORE html2canvas parses CSS):
 *      a. Rewrite all <style> tag text content
 *      b. Replace <link> stylesheets containing oklch with sanitized inline <style>
 *      c. Inject the pre-computed override stylesheet
 *      d. Inline rgb computed styles on every element
 *   3. On the off-screen clone used as html2canvas target — belt & suspenders
 */
const captureElement = async (
  element: HTMLElement,
  opts?: { width?: number; height?: number },
): Promise<HTMLCanvasElement> => {
  // Pre-compute the override stylesheet while we have access to the live DOM.
  // This resolves all oklch CSS custom properties to rgb.
  const overrideCss = buildOklchOverrideStylesheet();

  const captureWidth = opts?.width ?? element.offsetWidth;

  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.position = 'fixed';
  clone.style.top = '0';
  clone.style.left = '0';
  clone.style.visibility = 'hidden';
  clone.style.zIndex = '-9999';
  clone.style.width = `${captureWidth}px`;
  clone.style.overflow = 'visible';
  document.body.appendChild(clone);

  // Inject export-specific layout overrides into the clone so that
  // panels don't overlap when captured at a fixed width.
  const exportStyle = document.createElement('style');
  exportStyle.textContent = `
    /* Force 2-column grid layout for dashboard captures */
    #dashboard-grid {
      display: grid !important;
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 1.25rem !important;
    }
    /* Prevent title truncation and button overlap in panel headers */
    #dashboard-grid [class*="truncate"] {
      overflow: visible !important;
      text-overflow: unset !important;
      white-space: normal !important;
      word-break: break-word !important;
    }
    /* Make action buttons always visible (they hide on non-hover) */
    #dashboard-grid .group > div:first-child > div:last-child {
      opacity: 1 !important;
    }
    /* Ensure panel headers don't collapse */
    #dashboard-grid .group > div:first-child {
      flex-wrap: wrap !important;
      gap: 0.5rem !important;
    }
    /* Expanded panels span full width */
    .col-span-full {
      grid-column: 1 / -1 !important;
    }
  `;
  clone.appendChild(exportStyle);

  // Let the browser reflow at the target width, then measure actual height.
  // This avoids using the original element's scrollHeight which corresponds
  // to a potentially different column layout.
  await new Promise((r) => requestAnimationFrame(r));
  const captureHeight = opts?.height ?? clone.scrollHeight;
  clone.style.height = `${captureHeight}px`;

  try {
    await convertSvgsToCanvas(clone, element);
    sanitizeOklchColors(clone, element);
    clone.style.visibility = 'visible';

    const isDark = document.documentElement.classList.contains('dark');
    const canvas = await html2canvas(clone, {
      scale: 2,
      width: captureWidth,
      height: captureHeight,
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc: Document) => {
        // This callback fires AFTER html2canvas clones the document but
        // BEFORE it parses the CSS. This is our chance to strip oklch().

        // Level 2a+2b: Rewrite all <style> tags and replace <link>
        // stylesheets that contain oklch with sanitized inline versions.
        sanitizeStylesheets(clonedDoc);

        // Level 2c: Inject override stylesheet with all CSS custom
        // properties pre-resolved from oklch to rgb.
        if (overrideCss) {
          const overrideEl = clonedDoc.createElement('style');
          overrideEl.setAttribute('data-oklch-override', 'true');
          overrideEl.textContent = overrideCss;
          clonedDoc.head.appendChild(overrideEl);
        }

        // Level 2d: Inline rgb computed styles on every element as a
        // final safety net.
        sanitizeOklchColors(clonedDoc.body);
      },
    });

    return canvas;
  } finally {
    document.body.removeChild(clone);
  }
};

/**
 * Save a canvas as a PNG file via blob download.
 */
const canvasToPNG = (canvas: HTMLCanvasElement, filename: string): void => {
  canvas.toBlob((blob) => {
    if (blob) saveAs(blob, filename);
  }, 'image/png');
};

// ---------------------------------------------------------------------------
// Public export functions
// ---------------------------------------------------------------------------

export const exportChartAsPNG = async (elementId: string, title: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    const canvas = await captureElement(element);
    const safeName = title.replace(/\s+/g, '_').toLowerCase();
    canvasToPNG(canvas, `${safeName}_chart.png`);
  } catch (error) {
    console.error('Failed to export chart as PNG:', error);
  }
};

export const exportDashboardAsPNG = async (elementId: string = 'dashboard-grid') => {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    // Use at least 1200px width so the lg: (1024px) grid breakpoint
    // activates and panels render in 2-column layout.  Height is
    // measured from the clone AFTER reflow inside captureElement().
    const captureWidth = Math.max(element.offsetWidth, 1200);
    const canvas = await captureElement(element, { width: captureWidth });
    canvasToPNG(canvas, 'datamuse_dashboard.png');
  } catch (error) {
    console.error('Failed to export dashboard as PNG:', error);
  }
};

export const exportDataAsCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) return;

  const worksheet = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${filename.replace(/\s+/g, '_').toLowerCase()}.csv`);
};

export const exportDataAsExcel = (data: any[], filename: string) => {
  if (!data || data.length === 0) return;

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${filename.replace(/\s+/g, '_').toLowerCase()}.xlsx`);
};
