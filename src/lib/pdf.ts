import { jsPDF } from 'jspdf';
import { buildDrawing, Drawing } from '../engine/drawing';
import { quoteTotals, QuotationRec } from './quotation';
import { fmtDate, num } from './format';

const hexToRgb = (h: string): [number, number, number] => {
  const m = h.replace('#', '');
  const f = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};

function drawShapes(doc: jsPDF, d: Drawing, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / d.vb.w, h / d.vb.h);
  const ox = x + (w - d.vb.w * scale) / 2 - d.vb.x * scale;
  const oy = y + (h - d.vb.h * scale) / 2 - d.vb.y * scale;
  const X = (v: number) => ox + v * scale;
  const Y = (v: number) => oy + v * scale;
  for (const s of d.shapes) {
    if (s.k === 'rect') {
      const hasFill = !!s.fill && s.fill !== 'none';
      const hasStroke = !!s.stroke && s.stroke !== 'none';
      if (hasFill) doc.setFillColor(...hexToRgb(s.fill!));
      if (hasStroke) {
        doc.setDrawColor(...hexToRgb(s.stroke!));
        doc.setLineWidth(Math.max(0.08, (s.sw ?? 1) * scale));
      }
      doc.rect(X(s.x), Y(s.y), s.w * scale, s.h * scale, hasFill && hasStroke ? 'FD' : hasFill ? 'F' : 'S');
    } else if (s.k === 'line') {
      doc.setDrawColor(...hexToRgb(s.stroke ?? '#1b2433'));
      doc.setLineWidth(Math.max(0.08, (s.sw ?? 1) * scale));
      if (s.dash) doc.setLineDashPattern(s.dash.map((v) => Math.max(0.3, v * scale)), 0);
      doc.line(X(s.x1), Y(s.y1), X(s.x2), Y(s.y2));
      if (s.dash) doc.setLineDashPattern([], 0);
    } else {
      doc.setTextColor(...hexToRgb(s.fill ?? '#1b2433'));
      doc.setFont('helvetica', s.bold ? 'bold' : 'normal');
      doc.setFontSize(Math.max(4, s.size * scale * 2.8346));
      const align = s.anchor === 'middle' ? 'center' : s.anchor === 'end' ? 'right' : 'left';
      doc.text(s.s, X(s.x), Y(s.y), { align, angle: s.rot ? -s.rot : 0 });
    }
  }
  doc.setLineDashPattern([], 0);
}

export interface PdfOpts {
  accent: string;
  navy: string;
  footer: string;
  symbol: string;
}

export function buildQuotationPdf(q: QuotationRec, opts: PdfOpts, showPricesOverride?: boolean): jsPDF {
  const showPrices = showPricesOverride ?? q.showPrices;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const PW = 210;
  const PH = 297;
  const M = 14;
  const navy = hexToRgb(opts.navy);
  const gold = hexToRgb(opts.accent);
  const b = q.business;
  const sym = opts.symbol;
  const tot = quoteTotals(q);
  const money = (n: number) => `${Math.round(n).toLocaleString('de-DE')} ${sym}`;

  const header = () => {
    doc.setFillColor(...navy);
    doc.rect(0, 0, PW, 36, 'F');
    doc.setFillColor(...gold);
    doc.rect(0, 36, PW, 1.2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text(b.name, M, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(214, 220, 230);
    const l1 = [`Tel: ${b.phone}`, `Email: ${b.email}`].join('   |   ');
    const l2 = [b.instagram ? `Instagram: ${b.instagram}` : '', `NIPT: ${b.nipt}`].filter(Boolean).join('   |   ');
    doc.text(l1, M, 23);
    doc.text(l2, M, 28);
    if (b.address) doc.text(b.address, M, 33);
    doc.setTextColor(...gold);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('OFERTË', PW - M, 15, { align: 'right' });
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`Nr. ${q.number}`, PW - M, 22, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`Data: ${fmtDate(q.date)}`, PW - M, 27, { align: 'right' });
  };

  const footer = (page: number, pages: number) => {
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.4);
    doc.line(M, PH - 14, PW - M, PH - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 118, 130);
    doc.text(`${b.name}  |  ${b.phone}  |  ${b.email}  |  NIPT ${b.nipt}`, M, PH - 9);
    if (opts.footer) doc.text(opts.footer, M, PH - 5.5);
    doc.text(`Faqja ${page} / ${pages}`, PW - M, PH - 9, { align: 'right' });
  };

  header();
  let y = 44;

  /* client + project boxes */
  const boxH = 27;
  const bw = (PW - 2 * M - 6) / 2;
  const box = (x: number, title: string, lines: string[]) => {
    doc.setDrawColor(210, 214, 220);
    doc.setLineWidth(0.3);
    doc.setFillColor(247, 248, 250);
    doc.roundedRect(x, y, bw, boxH, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...gold);
    doc.text(title, x + 4, y + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 38, 50);
    lines.slice(0, 4).forEach((l, i) => doc.text(l, x + 4, y + 11 + i * 4.6));
  };
  box(M, 'KLIENTI', [q.client.name || '-', q.client.phone ? `Tel: ${q.client.phone}` : '', q.client.email, q.client.address].filter(Boolean));
  box(M + bw + 6, 'PROJEKTI', [q.projectName || '-', `Vlefshmëria e ofertës: ${q.validityDays} ditë`, `Njësi: ${tot.units}   |   Sipërfaqe: ${num(tot.area, 2)} m²`]);
  y += boxH + 6;

  /* items table */
  const colPrice = PW - M - 30;
  const colTotal = PW - M;
  const tableHeader = () => {
    doc.setFillColor(...navy);
    doc.rect(M, y, PW - 2 * M, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Nr.', M + 2, y + 4.8);
    doc.text('Vizatimi', M + 12, y + 4.8);
    doc.text('Përshkrimi dhe përmasat', M + 62, y + 4.8);
    if (showPrices) {
      doc.text('Çmimi / njësi', colPrice, y + 4.8, { align: 'right' });
      doc.text('Totali', colTotal - 2, y + 4.8, { align: 'right' });
    } else doc.text('Sasia', colTotal - 2, y + 4.8, { align: 'right' });
    y += 7;
  };
  tableHeader();

  const imgW = 46;
  q.items.forEach((it, idx) => {
    const w = it.win;
    const descW = (showPrices ? colPrice - 30 : colTotal - 20) - (M + 62);
    const descLines: string[] = doc.splitTextToSize(it.desc, descW);
    const glassLines = it.calc.glass.map(
      (g) => `Qelq ${g.cell}: ${g.w} × ${g.h} mm, ${g.thickness ? g.thickness + ' mm, ' : ''}${g.composition || g.glassName}`
    );
    const uniqueGlass = [...new Set(glassLines)].slice(0, 6);
    const textLines = 3 + descLines.length + (it.calc.glass.length ? uniqueGlass.length : 0);
    const asp = (w.width + 300) / (w.height + 300);
    const drawH = Math.min(52, imgW / asp);
    const rowH = Math.max(drawH + 6, textLines * 4.2 + 8, 30);
    if (y + rowH > PH - 22) {
      doc.addPage();
      header();
      y = 44;
      tableHeader();
    }
    if (idx % 2 === 1) {
      doc.setFillColor(250, 251, 252);
      doc.rect(M, y, PW - 2 * M, rowH, 'F');
    }
    doc.setDrawColor(222, 225, 230);
    doc.setLineWidth(0.2);
    doc.line(M, y + rowH, PW - M, y + rowH);
    doc.setTextColor(30, 38, 50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(idx + 1), M + 2, y + 6);
    if (q.showDrawings) {
      const d = buildDrawing(w.width, w.height, w.layout, it.params, { dims: true, colorHex: it.colorHex, glassLabels: it.glassLabels });
      drawShapes(doc, d, M + 10, y + 3, imgW, rowH - 6);
    }
    let ty = y + 6;
    const tx = M + 62;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`${w.name || 'Pozicion'}  -  ${w.width} × ${w.height} mm`, tx, ty);
    ty += 4.6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 68, 80);
    descLines.forEach((l) => {
      doc.text(l, tx, ty);
      ty += 4.1;
    });
    doc.text(`Sasia: ${w.qty} copë   |   Sipërfaqja: ${num(it.calc.area * w.qty, 2)} m²`, tx, ty);
    ty += 4.2;
    doc.setFontSize(7.5);
    doc.setTextColor(95, 104, 118);
    uniqueGlass.forEach((l) => {
      doc.text(doc.splitTextToSize(l, descW)[0], tx, ty);
      ty += 3.7;
    });
    doc.setTextColor(30, 38, 50);
    if (showPrices) {
      const unit = it.price / Math.max(1, w.qty);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(money(unit), colPrice, y + 6, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(money(it.price), colTotal - 2, y + 6, { align: 'right' });
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${w.qty}`, colTotal - 2, y + 6, { align: 'right' });
    }
    y += rowH;
  });

  /* totals */
  const need = (showPrices ? 38 : 0) + 62;
  if (y + need > PH - 18) {
    doc.addPage();
    header();
    y = 44;
  }
  y += 5;
  if (showPrices) {
    const bx = PW - M - 78;
    const row = (label: string, val: string, bold = false, fill = false) => {
      if (fill) {
        doc.setFillColor(...navy);
        doc.rect(bx, y - 4.6, 78, 8, 'F');
        doc.setTextColor(...gold);
      } else doc.setTextColor(30, 38, 50);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(bold ? 10.5 : 9);
      doc.text(label, bx + 3, y);
      doc.text(val, bx + 75, y, { align: 'right' });
      y += fill ? 9 : 6;
    };
    if (q.discountPct > 0 || q.vatPct > 0) {
      row('Nëntotali', money(tot.subtotal));
      if (q.discountPct > 0) row(`Zbritje (${num(q.discountPct, 1)} %)`, `- ${money(tot.discount)}`);
      if (q.vatPct > 0) row(`TVSH (${num(q.vatPct, 1)} %)`, money(tot.vat));
    }
    row('TOTALI I PËRGJITHSHËM', money(tot.grand), true, true);
    y += 2;
  }
  /* terms */
  doc.setTextColor(30, 38, 50);
  const term = (title: string, text: string) => {
    if (!text.trim()) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...gold);
    doc.text(title, M, y);
    y += 4.6;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 48, 60);
    doc.setFontSize(9);
    const lines: string[] = doc.splitTextToSize(text, PW - 2 * M);
    lines.forEach((l) => {
      if (y > PH - 20) {
        doc.addPage();
        header();
        y = 44;
      }
      doc.text(l, M, y);
      y += 4.3;
    });
    y += 2.5;
  };
  term('VLEFSHMËRIA', `Oferta është e vlefshme ${q.validityDays} ditë nga data ${fmtDate(q.date)}.`);
  term('KUSHTET E PAGESËS', q.payment);
  term('SHËNIME', q.notes);

  if (y > PH - 48) {
    doc.addPage();
    header();
    y = 44;
  }
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 98, 110);
  doc.text('Ofertuesi', PW - M - 60, y);
  y += 14;
  doc.setDrawColor(60, 68, 80);
  doc.setLineWidth(0.3);
  doc.line(PW - M - 60, y, PW - M, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 38, 50);
  doc.text(b.signer || 'GEZIM ZENELI', PW - M - 60, y);

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    footer(p, pages);
  }
  return doc;
}
