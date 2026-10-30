import type { jsPDF } from 'jspdf';
import {
	PT_MM,
	type Block,
	type DocModel,
	type Geometry,
	type Paragraph,
	type RunStyle,
	type Section,
	type TableBlock
} from './model';

/* ------------------------------------------------------------------ */
/* font resolution                                                     */
/* ------------------------------------------------------------------ */

/** Core PDF font families WinAnsi can honour, by document font name. */
function coreFamily(family: string): 'helvetica' | 'times' | 'courier' {
	const f = family.toLowerCase();
	if (/(times|georgia|garamond|cambria|serif)/.test(f)) return 'times';
	if (/(courier|consolas|mono)/.test(f)) return 'courier';
	return 'helvetica';
}

interface FontRegistry {
	/** family key jsPDF knows, or null when the family has no embedded file. */
	familyOf(style: RunStyle): string | null;
	styleOf(style: RunStyle): 'normal' | 'bold' | 'italic' | 'bolditalic';
}

/**
 * Families present in the DOCX font table AND carrying an embedded TTF get
 * embedded; everything else maps onto the three WinAnsi core families.
 */
function buildFontRegistry(model: DocModel, doc: jsPDF): FontRegistry {
	const embedded = new Map<string, string>(); // lowercased family -> jsPDF family key

	for (const [family, slots] of model.fonts) {
		const present = Object.values(slots).filter(Boolean);
		if (present.length === 0) continue;
		const key = `emb${embedded.size}_${family.replace(/[^A-Za-z0-9]/g, '')}`;
		try {
			for (const [style, entry] of Object.entries(slots)) {
				if (!entry) continue;
				let bin = '';
				const CHUNK = 0x8000;
				for (let i = 0; i < entry.bytes.length; i += CHUNK) {
					bin += String.fromCharCode(...entry.bytes.subarray(i, i + CHUNK));
				}
				doc.addFileToVFS(entry.fileName, btoa(bin));
				doc.addFont(entry.fileName, key, style as 'normal');
			}
			embedded.set(family.toLowerCase(), key);
		} catch {
			// Unparseable font (variable/CFF/odd cmap) — fall back to core fonts.
		}
	}

	return {
		familyOf(style) {
			return embedded.get(style.family.toLowerCase()) ?? null;
		},
		styleOf(style) {
			if (style.bold && style.italic) return 'bolditalic';
			if (style.bold) return 'bold';
			if (style.italic) return 'italic';
			return 'normal';
		}
	};
}

function applyFont(doc: jsPDF, fonts: FontRegistry, style: RunStyle): void {
	const embeddedFamily = fonts.familyOf(style);
	if (embeddedFamily) {
		// Missing style slot inside an embedded family: fall back to that
		// family's normal weight rather than switching typeface mid-line.
		doc.setFont(embeddedFamily, fonts.styleOf(style));
	} else {
		doc.setFont(coreFamily(style.family), fonts.styleOf(style));
	}
}

/* ------------------------------------------------------------------ */
/* line building                                                       */
/* ------------------------------------------------------------------ */

interface Token {
	text: string;
	style: RunStyle;
	width: number;
	/** Trailing whitespace token produced by the source. */
	space: boolean;
	/** PAGE/NUMPAGES field; resolved against the current page while drawing. */
	field?: 'page' | 'total';
}

interface Line {
	tokens: Token[];
	width: number;
	/** Height of the tallest run on the line, mm. */
	maxHeight: number;
}

const TAB_MM = 12.7;

function buildLines(
	para: Paragraph,
	measure: (text: string, style: RunStyle) => number,
	availWidth: number
): Line[] {
	// Flatten atoms into word/space tokens first.
	type Raw = { text: string; style: RunStyle; isSpace: boolean; isBreak: boolean; field?: 'page' | 'total' };
	const raw: Raw[] = [];
	for (const atom of para.atoms) {
		if (atom.kind === 'nl') {
			raw.push({ text: '', style: paraDefaultStyle(para), isSpace: false, isBreak: true });
			continue;
		}
		if (atom.kind === 'tab') {
			raw.push({ text: '\t', style: atom.style, isSpace: false, isBreak: false });
			continue;
		}
		if (atom.kind === 'text' || atom.kind === 'field') {
			const value = atom.kind === 'text' ? atom.text : '';
			const style = atom.style;
			if (atom.kind === 'field') {
				// Field value is substituted at draw time; '00' reserves its width.
				raw.push({ text: '00', style, isSpace: false, isBreak: false, field: atom.which });
				continue;
			}
			const parts = value.split(/([ \u00A0]+)/);
			for (const part of parts) {
				if (!part) continue;
				raw.push({ text: part, style, isSpace: /^[ \u00A0]+$/.test(part), isBreak: false });
			}
		}
	}

	const measureToken = (item: Raw): number => {
		if (item.text === '\t') return TAB_MM; // simplified tab stop
		return measure(item.text, item.style);
	};

	const lines: Line[] = [];
	let current: Line = { tokens: [], width: 0, maxHeight: 0 };
	let x = 0;

	const pushLine = () => {
		// Trailing spaces do not count toward justification width.
		let width = 0;
		let lastVisible = current.tokens.length - 1;
		while (lastVisible >= 0 && current.tokens[lastVisible].space) lastVisible -= 1;
		for (let i = 0; i <= lastVisible; i += 1) width += current.tokens[i].width;
		lines.push({ ...current, width });
		current = { tokens: [], width: 0, maxHeight: 0 };
		x = 0;
	};

	for (const item of raw) {
		if (item.isBreak) {
			pushLine();
			continue;
		}
		const width = measureToken(item);
		const height = item.style.sizePt * PT_MM * (item.style.vert === 'base' ? 1 : 0.7);

		if (!current.tokens.length && item.isSpace) continue; // no line-leading spaces
		if (x > 0 && x + width > availWidth && !item.isSpace) {
			// strip trailing spaces from the finished line
			while (current.tokens.length && current.tokens[current.tokens.length - 1].space) {
				current.tokens.pop();
			}
			pushLine();
		}

		current.tokens.push({ text: item.text, style: item.style, width, space: item.isSpace, field: item.field });
		current.maxHeight = Math.max(current.maxHeight, height);
		x += width;
	}
	if (current.tokens.length) pushLine();
	return lines.length ? lines : [{ tokens: [], width: 0, maxHeight: 0 }];
}

function paraDefaultStyle(para: Paragraph): RunStyle {
	for (const atom of para.atoms) {
		if (atom.kind === 'text' || atom.kind === 'tab' || atom.kind === 'field') return atom.style;
	}
	return {
		family: 'Calibri',
		bold: false,
		italic: false,
		underline: false,
		strike: false,
		vert: 'base',
		sizePt: para.sizePt || 11,
		color: [25, 31, 40]
	};
}

/* ------------------------------------------------------------------ */
/* renderer                                                            */
/* ------------------------------------------------------------------ */

export interface RenderOptions {
	pageSize?: string;
	/** Known only on the second render pass; NUMPAGES fields need it. */
	totalPages?: number;
}

export function resolveGeometry(docGeo: Geometry, pageSize: string | undefined): Geometry {
	if (pageSize === 'a4') return { ...docGeo, wMm: 210, hMm: 297 };
	if (pageSize === 'letter') return { ...docGeo, wMm: 215.9, hMm: 279.4 };
	return { ...docGeo };
}

export async function renderDocx(
	model: DocModel,
	doc: jsPDF,
	ctx: {
		options: RenderOptions;
		onProgress: (fraction: number) => void;
		signal: AbortSignal;
		sourceName: string;
	},
	runAutoTable: (options: Record<string, unknown>) => void
): Promise<void> {
	const fonts = buildFontRegistry(model, doc);

	/** measure with the right font active */
	const measureCache = new Map<string, number>();
	const measure = (text: string, style: RunStyle): number => {
		const key = `${style.family}|${style.bold}|${style.italic}|${style.sizePt}|${text}`;
		const hit = measureCache.get(key);
		if (hit !== undefined) return hit;
		applyFont(doc, fonts, style);
		doc.setFontSize(style.sizePt);
		const width = doc.getTextWidth(text);
		measureCache.set(key, width);
		return width;
	};

	const check = () => {
		if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
	};

	let pageWidth = doc.internal.pageSize.getWidth();
	let pageHeight = doc.internal.pageSize.getHeight();

	/** Tracks the current vertical position; resets per page/section. */
	let y = 0;
	let contentWidth = 0;
	let margin = 0;
	let bottomLimit = 0;

	let currentPageGeom: Geometry | null = null;
	/** 1-based page number of the page currently being drawn. */
	let pageNo = 1;
	/** autoTable may add pages behind our back; ask jsPDF when it can. */
	const currentPageNo = (): number => {
		const info = (doc as unknown as { getCurrentPageInfo?: () => { pageNumber?: number } })
			.getCurrentPageInfo?.();
		return info?.pageNumber ?? pageNo;
	};

	const startSection = (section: Section, firstOfDocument: boolean) => {
		const geo = resolveGeometry(section.geo, ctx.options.pageSize);
		currentPageGeom = geo;
		if (!firstOfDocument) {
			doc.addPage([geo.wMm, geo.hMm]);
			pageNo += 1;
		}
		pageWidth = geo.wMm;
		pageHeight = geo.hMm;
		margin = geo.leftMm;
		contentWidth = geo.wMm - geo.leftMm - geo.rightMm;
		bottomLimit = geo.hMm - geo.bottomMm;
		y = geo.topMm;
		drawRunningParts(section, geo);
	};

	const newPage = (section: Section) => {
		const geo = currentPageGeom!;
		doc.addPage([geo.wMm, geo.hMm]);
		pageNo += 1;
		pageWidth = geo.wMm;
		pageHeight = geo.hMm;
		contentWidth = geo.wMm - geo.leftMm - geo.rightMm;
		bottomLimit = geo.hMm - geo.bottomMm;
		y = geo.topMm;
		drawRunningParts(section, geo);
	};

	/** Header/footer blocks: drawn at fixed offsets on every page. */
	const drawRunningParts = (section: Section, geo: Geometry) => {
		const savedY = y;
		if (section.header.length) {
			y = geo.headerMm;
			for (const block of section.header) {
				if (block.kind !== 'p') continue;
				drawParagraph(block, geo.leftMm, contentWidth, geo, () => {}, true);
			}
		}
		if (section.footer.length) {
			y = pageHeight - geo.footerMm - 4;
			for (const block of section.footer) {
				if (block.kind !== 'p') continue;
				drawParagraph(block, geo.leftMm, contentWidth, geo, () => {}, true);
			}
		}
		y = savedY; // running parts never move the body cursor
	};

	const ensureSpace = (height: number, section: Section) => {
		if (y + height > bottomLimit) newPage(section);
	};

	/** Draws one paragraph at the current y, honouring indents and alignment. */
	const drawParagraph = (
		para: Paragraph,
		x0: number,
		avail: number,
		geo: Geometry,
		onNewPage: (section: Section) => void,
		running = false
	) => {
		const indentLeft = Math.max(0, Math.min(para.leftMm, avail * 0.5));
		const indentRight = Math.max(0, Math.min(para.rightMm, avail * 0.5));
		const lineIndent = indentLeft;
		const lineAvail = avail - indentLeft - indentRight;
		const firstIndent = Math.max(0, Math.min(para.firstMm, lineAvail * 0.4));
		const hanging = para.marker ? Math.min(para.marker.hangingMm, lineAvail * 0.4) : 0;

		const lines = buildLines(para, measure, lineAvail - firstIndent);

		if (!running) y += para.beforeMm;

		for (let li = 0; li < lines.length; li += 1) {
			const line = lines[li];
			const lineH = (line.maxHeight || para.sizePt * PT_MM) * para.lineMul;

			if (!running) {
				if (y + lineH > bottomLimit) onNewPage(currentSection!);
			}

			const baseline = y + lineH * 0.8;
			let x = x0 + lineIndent + (li === 0 ? firstIndent : 0);

			// list marker sits in the hanging zone before the first line
			if (para.marker && li === 0) {
				const style = paraDefaultStyle(para);
				applyFont(doc, fonts, style);
				doc.setFontSize(style.sizePt);
				doc.setTextColor(style.color[0], style.color[1], style.color[2]);
				const markerX = x0 + lineIndent - hanging;
				doc.text(para.marker.text, markerX, baseline);
			}

			// justified: distribute extra space between tokens (except last line)
			const justify = para.align === 'justify' && li < lines.length - 1 && line.tokens.length > 1;
			let extra = 0;
			let gaps = 0;
			if (justify) {
				gaps = line.tokens.filter((t) => !t.space).length - 1;
				if (gaps > 0) extra = Math.max(0, (lineAvail - line.width) / gaps);
			}
			if (para.align === 'center') x += Math.max(0, (lineAvail - line.width) / 2);
			else if (para.align === 'right') x += Math.max(0, lineAvail - line.width);

			for (const token of line.tokens) {
				if (token.space && extra > 0 && gaps > 0) {
					x += extra;
					gaps -= 1;
				}
				if (token.text === '\t') {
					x = Math.ceil((x + 0.01) / TAB_MM) * TAB_MM;
					continue;
				}
				applyFont(doc, fonts, token.style);
				doc.setFontSize(token.style.sizePt);
				doc.setTextColor(token.style.color[0], token.style.color[1], token.style.color[2]);

				let drawX = x;
				let drawY = baseline;
				let size = token.style.sizePt;
				if (token.style.vert !== 'base') {
					size = token.style.sizePt * 0.65;
					doc.setFontSize(size);
					drawY += token.style.vert === 'super' ? -size * PT_MM * 0.35 : size * PT_MM * 0.25;
				}

				const display = token.field
					? token.field === 'page'
						? String(currentPageNo())
						: String(ctx.options.totalPages ?? '00')
					: token.text;
				if (!token.space) {
					doc.text(display, drawX, drawY);
					const w = token.width;
					if (token.style.underline || token.style.strike) {
						const lw = Math.max(0.15, size / 40);
						doc.setLineWidth(lw);
						const ly = token.style.underline ? drawY + size * PT_MM * 0.12 : drawY - size * PT_MM * 0.3;
						doc.line(drawX, ly, drawX + w, ly);
					}
				}
				x += token.width;
			}

			y += lineH;
		}
		if (!running) y += para.afterMm;
	};

	/* ---------------- tables ---------------- */

	const drawTable = (table: TableBlock, geo: Geometry, section: Section) => {
		const grid = table.rows.map((row) => row.filter((cell) => !cell.skip));
		if (!grid.length) return;

		type RowCell =
			| string
			| { content: string; styles?: Record<string, unknown>; colSpan?: number; rowSpan?: number };
		const rows: RowCell[][] = [];
		const headerRow = table.header ? 0 : -1;

		for (const cells of grid) {
			rows.push(
				cells.map((cell) => {
					const content = cellText(cell).slice(0, 4000);
					const cellStyles = cell.shade ? { fillColor: cell.shade } : undefined;
					if (cell.colSpan > 1 || cell.rowSpan > 1) {
						return {
							content,
							colSpan: cell.colSpan,
							rowSpan: cell.rowSpan,
							...(cellStyles ? { styles: cellStyles } : {})
						};
					}
					return cellStyles ? { content, styles: cellStyles } : content;
				})
			);
		}

		// column widths from tblGrid, scaled to the content box
		const widths = grid[0].flatMap((cell) => {
			const per = cell.wMm / Math.max(1, cell.colSpan);
			return Array.from({ length: cell.colSpan }, () => per);
		});
		const sum = widths.reduce((a, b) => a + b, 0);
		const scale = sum > 0 ? Math.min(1, contentWidth / sum) : 1;
		const columnStyles: Record<string, unknown> = {};
		widths.forEach((w, i) => {
			columnStyles[String(i)] = { cellWidth: w * scale };
		});

		ensureSpace(20, section);

		const head = headerRow === 0 && rows.length ? [rows[0]] : undefined;
		const body = headerRow === 0 ? rows.slice(1) : rows;

		runAutoTable({
			startY: y,
			head,
			body,
			theme: 'grid',
			margin: { top: geo.topMm, bottom: geo.bottomMm, left: geo.leftMm, right: geo.rightMm },
			columnStyles,
			styles: {
				font: fonts.familyOf(paraDefaultStyleOfTable(table)) ?? coreFamily('Calibri'),
				fontSize: 9,
				cellPadding: 1.8,
				overflow: 'linebreak',
				textColor: [25, 31, 40],
				lineColor: [209, 214, 219],
				lineWidth: 0.1
			},
			headStyles: {
				fillColor: [242, 244, 246],
				textColor: [25, 31, 40],
				fontStyle: 'bold'
			},
			bodyStyles: {
				fontSize: 9
			}
		});

		const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
		y = (finalY ?? y) + 6;
	};

	/* ---------------- blocks ---------------- */

	let currentSection: Section | null = null;

	const drawBlock = (block: Block, section: Section, geo: Geometry) => {
		check();
		if (block.kind === 'pagebreak') {
			newPage(section);
			return;
		}
		if (block.kind === 'img') {
			let w = block.wMm;
			let h = block.hMm;
			if (w > contentWidth) {
				h = (h / w) * contentWidth;
				w = contentWidth;
			}
			if (y + h > bottomLimit && h < bottomLimit - geo.topMm) newPage(section);
			try {
				doc.addImage(block.dataUrl, block.format, geo.leftMm + Math.max(0, (contentWidth - w) / 2), y, w, h);
			} catch {
				return; // unsupported image encoding — skip rather than fail the file
			}
			y += h + 4;
			return;
		}
		if (block.kind === 'table') {
			drawTable(block, geo, section);
			return;
		}
		drawParagraph(block, geo.leftMm, contentWidth, geo, (s) => newPage(s));
	};

	/* ---------------- walk ---------------- */

	let done = 0;
	let total = 0;
	for (const section of model.sections) total += section.blocks.length;

	let first = true;
	for (const section of model.sections) {
		currentSection = section;
		startSection(section, first);
		first = false;
		for (const block of section.blocks) {
			drawBlock(block, section, currentPageGeom!);
			done += 1;
			ctx.onProgress(Math.min(0.99, done / Math.max(1, total)));
		}
	}

	ctx.onProgress(1);
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function cellText(cell: { blocks: Block[] }): string {
	const parts: string[] = [];
	for (const block of cell.blocks) {
		if (block.kind !== 'p') continue;
		let text = '';
		for (const atom of block.atoms) {
			if (atom.kind === 'text') text += atom.text;
			else if (atom.kind === 'tab') text += '\t';
			else if (atom.kind === 'nl') text += '\n';
			else if (atom.kind === 'field') text += '•';
		}
		parts.push(text);
	}
	return parts.join('\n');
}

function paraDefaultStyleOfTable(table: TableBlock): RunStyle {
	for (const row of table.rows) {
		for (const cell of row) {
			for (const block of cell.blocks) {
				if (block.kind === 'p' && block.atoms.length) {
					for (const atom of block.atoms) {
						if (atom.kind === 'text') return atom.style;
					}
				}
			}
		}
	}
	return {
		family: 'Calibri',
		bold: false,
		italic: false,
		underline: false,
		strike: false,
		vert: 'base',
		sizePt: 9,
		color: [25, 31, 40]
	};
}

