import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

/**
 * Get dimensions from an SVG element using attributes, viewBox, or fallback.
 * Works even when the SVG is off-screen or in a cloned node.
 */
const getSvgDimensions = (svg: SVGSVGElement): { width: number; height: number } => {
  // Priority 1: explicit width/height attributes (Recharts sets these)
  const attrW = svg.getAttribute('width');
  const attrH = svg.getAttribute('height');
  if (attrW && attrH) {
    const w = parseFloat(attrW);
    const h = parseFloat(attrH);
    if (w > 0 && h > 0) return { width: w, height: h };
  }

  // Priority 2: viewBox attribute
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  // Priority 3: getBoundingClientRect (works for visible elements)
  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }

  // Priority 4: clientWidth/clientHeight
  if (svg.clientWidth > 0 && svg.clientHeight > 0) {
    return { width: svg.clientWidth, height: svg.clientHeight };
  }

  // Fallback
  return { width: 400, height: 300 };
};

/**
 * Convert all SVG elements inside a container to canvas elements
 * so html2canvas can capture them properly.
 *
 * When `originalContainer` is provided, SVG dimensions are read from the
 * original (visible) DOM, which avoids the zero-size problem with off-screen clones.
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
    const svg = svgs[i];
    // Use the original (visible) SVG for dimension reading when available
    const refSvg = (originalSvgs[i] ?? svg) as SVGSVGElement;
    try {
      const { width, height } = getSvgDimensions(refSvg);

      // Serialize the clone's SVG (it has the same content)
      const serializer = new XMLSerializer();
      let svgData = serializer.serializeToString(svg);

      // Ensure the serialized SVG has explicit dimensions and xmlns
      if (!svgData.includes('xmlns')) {
        svgData = svgData.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.width = width;
      img.height = height;
      img.src = url;

      await new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve();
        } else {
          img.onload = () => resolve();
          img.onerror = () => resolve(); // proceed even on error
          setTimeout(() => resolve(), 5000);
        }
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

      svg.parentNode?.replaceChild(canvas, svg);
      URL.revokeObjectURL(url);
    } catch {
      console.warn('Skipped SVG conversion for one element');
    }
  }
};

export const exportChartAsPDF = async (elementId: string, title: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    // Clone to avoid mutating the live DOM
    const clone = element.cloneNode(true) as HTMLElement;
    // Use visibility:hidden so the clone keeps its layout/dimensions
    clone.style.position = 'fixed';
    clone.style.top = '0';
    clone.style.left = '0';
    clone.style.visibility = 'hidden';
    clone.style.zIndex = '-9999';
    clone.style.width = `${element.offsetWidth}px`;
    clone.style.height = `${element.offsetHeight}px`;
    clone.style.overflow = 'visible';
    document.body.appendChild(clone);

    // Pass original element so SVG dimensions are read from visible DOM
    await convertSvgsToCanvas(clone, element);

    // Temporarily make visible for html2canvas capture
    clone.style.visibility = 'visible';
    const captured = await html2canvas(clone, {
      scale: 2,
      backgroundColor: document.documentElement.classList.contains('dark') ? '#0f172a' : '#ffffff',
      useCORS: true,
      logging: false,
    });
    clone.style.visibility = 'hidden';

    document.body.removeChild(clone);

    const imgData = captured.toDataURL('image/png');
    const pdfWidth = 210; // A4 width in mm
    const pdfHeight = (captured.height * pdfWidth) / captured.width;
    const isLandscape = pdfHeight < pdfWidth;

    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: isLandscape ? [pdfHeight, pdfWidth] : [pdfWidth, pdfHeight],
    });

    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    pdf.addImage(imgData, 'PNG', 0, 0, w, h);
    pdf.save(`${title.replace(/\s+/g, '_').toLowerCase()}_chart.pdf`);
  } catch (error) {
    console.error('Failed to export chart as PDF:', error);
  }
};

export const exportDashboardAsPDF = async (elementId: string = 'dashboard-grid') => {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    const clone = element.cloneNode(true) as HTMLElement;
    // Use visibility:hidden so the clone keeps its layout/dimensions
    clone.style.position = 'fixed';
    clone.style.top = '0';
    clone.style.left = '0';
    clone.style.visibility = 'hidden';
    clone.style.zIndex = '-9999';
    clone.style.width = `${element.offsetWidth}px`;
    clone.style.height = `${element.scrollHeight}px`;
    clone.style.overflow = 'visible';
    document.body.appendChild(clone);

    // Pass original element so SVG dimensions are read from visible DOM
    await convertSvgsToCanvas(clone, element);

    // Temporarily make visible for html2canvas capture
    clone.style.visibility = 'visible';
    const captured = await html2canvas(clone, {
      scale: 2,
      backgroundColor: document.documentElement.classList.contains('dark') ? '#0f172a' : '#ffffff',
      useCORS: true,
      logging: false,
      scrollY: 0,
      scrollX: 0,
    });
    clone.style.visibility = 'hidden';

    document.body.removeChild(clone);

    const imgData = captured.toDataURL('image/png');
    const pdfWidth = 297; // A4 landscape width in mm
    const pdfHeight = (captured.height * pdfWidth) / captured.width;

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [pdfWidth, Math.max(pdfHeight, 210)],
    });

    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    pdf.addImage(imgData, 'PNG', 0, 0, w, h);
    pdf.save('datamuse_dashboard.pdf');
  } catch (error) {
    console.error('Failed to export dashboard as PDF:', error);
  }
};

export const exportDataAsCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) return;

  const worksheet = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const BOM = '\uFEFF'; // UTF-8 BOM for proper encoding in Excel
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
