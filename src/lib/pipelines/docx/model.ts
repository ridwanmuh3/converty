export type Align = 'left' | 'center' | 'right' | 'justify';

export interface RunStyle {
	/** Original font family from the document (e.g. "Calibri"). */
	family: string;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strike: boolean;
	vert: 'base' | 'super' | 'sub';
	sizePt: number;
	color: [number, number, number];
}

export type Atom =
	| { kind: 'text'; text: string; style: RunStyle }
	| { kind: 'tab'; style: RunStyle }
	| { kind: 'nl' }
	| { kind: 'field'; which: 'page' | 'total'; style: RunStyle };

export interface Paragraph {
	kind: 'p';
	atoms: Atom[];
	align: Align;
	/** Paragraph left/right indent relative to the content box, mm. */
	leftMm: number;
	rightMm: number;
	/** Extra first-line indent (negative for hanging), mm. */
	firstMm: number;
	beforeMm: number;
	afterMm: number;
	/** Baseline-to-baseline multiplier. */
	lineMul: number;
	/** Bullet/number marker for lists; drawn inside the hanging zone. */
	marker?: { text: string; hangingMm: number };
	/** Paragraph default size, used for empty lines and markers. */
	sizePt: number;
}

export interface ImageBlock {
	kind: 'img';
	dataUrl: string;
	format: 'PNG' | 'JPEG';
	wMm: number;
	hMm: number;
}

export interface PageBreakBlock {
	kind: 'pagebreak';
}

export interface Cell {
	blocks: Block[];
	wMm: number;
	shade?: [number, number, number];
	colSpan: number;
	rowSpan: number;
	/** Covered by a preceding cell (vMerge continue) — drop from the grid. */
	skip?: boolean;
}

export interface TableBlock {
	kind: 'table';
	rows: Cell[][];
	header: boolean;
}

export type Block = Paragraph | ImageBlock | PageBreakBlock | TableBlock;

export interface Geometry {
	wMm: number;
	hMm: number;
	topMm: number;
	rightMm: number;
	bottomMm: number;
	leftMm: number;
	headerMm: number;
	footerMm: number;
}

export interface Section {
	geo: Geometry;
	header: Block[];
	footer: Block[];
	blocks: Block[];
}

export type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';

export interface EmbeddedFont {
	bytes: Uint8Array;
	fileName: string;
}

export interface DocModel {
	sections: Section[];
	/** family name → embedded font files by style slot. */
	fonts: Map<string, Partial<Record<FontStyle, EmbeddedFont>>>;
}

/** Word defaults: US Letter, 1" margins, 0.5" header/footer distance. */
export const DEFAULT_GEOMETRY: Geometry = {
	wMm: 215.9,
	hMm: 279.4,
	topMm: 25.4,
	rightMm: 25.4,
	bottomMm: 25.4,
	leftMm: 25.4,
	headerMm: 12.7,
	footerMm: 12.7
};

export const TWIP_MM = 0.0176389;
export const EMU_MM = 1 / 36000;
export const PT_MM = 0.352778;
