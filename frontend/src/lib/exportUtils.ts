import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

/**
 * Convert all SVG elements inside a cloned DOM node to canvas elements
 * so html2canvas can capture them properly.
 */
const convertSvgsToCanvas = async (container: HTMLElement): Promise<void> => {
  const svgs = container.querySelectorAll('svg');
  for (const svg of Array.from(svgs)) {
    try {
      const rect = svg.getBoundingClientRect();
      const width = rect.width || svg.clientWidth || 300;
      const height = rect.height || svg.clientHeight || 200;

      const svgData = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('SVG image load failed'));
        // Timeout fallback
        setTimeout(() => resolve(), 3000);
      });

      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, width, height);
      }

      svg.parentNode?.replaceChild(canvas, svg);
      URL.revokeObjectURL(url);
    } catch {
      // If SVG conversion fails, skip it — html2canvas will do its best
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
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = `${element.offsetWidth}px`;
    document.body.appendChild(clone);

    await convertSvgsToCanvas(clone);

    const captured = await html2canvas(clone, {
      scale: 2,
      backgroundColor: document.documentElement.classList.contains('dark') ? '#0f172a' : '#ffffff',
      useCORS: true,
      logging: false,
    });

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
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = `${element.offsetWidth}px`;
    document.body.appendChild(clone);

    await convertSvgsToCanvas(clone);

    const captured = await html2canvas(clone, {
      scale: 2,
      backgroundColor: document.documentElement.classList.contains('dark') ? '#0f172a' : '#ffffff',
      useCORS: true,
      logging: false,
    });

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

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename.replace(/\s+/g, '_').toLowerCase()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
