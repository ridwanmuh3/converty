import { unzipSync } from 'fflate';
import { assertLatin } from '../pdf-text';
import {
	DEFAULT_GEOMETRY,
	EMU_MM,
	TWIP_MM,
	type Align,
	type Atom,
	type Block,
	type Cell,
	type DocModel,
	type EmbeddedFont,
	type FontStyle,
	type Geometry,
	type Paragraph,
	type RunStyle,
	type Section
} from './model';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';

const DEFAULT_COLOR: [number, number, number] = [25, 31, 40];

/* ------------------------------------------------------------------ */
/* tiny XML helpers                                                    */
/* ------------------------------------------------------------------ */

const kids = (el: Element | undefined | null, ns: string, local: string): Element[] =>
	!el?.children ? [] : Array.from(el.children).filter((c) => c.namespaceURI === ns && c.localName === local);

const kid = (el: Element | undefined | null, ns: string, local: string): Element | undefined =>
	kids(el, ns, local)[0];

const all = (el: Element | Document, ns: string, local: string): Element[] =>
	Array.from(el.getElementsByTagNameNS(ns, local));

const wKid = (el: Element | undefined | null, local: string): Element | undefined => kid(el, W, local);
const wKids = (el: Element | undefined | null, local: string): Element[] => kids(el, W, local);

const wAttr = (el: Element | undefined | null, name: string): string | null =>
	el?.getAttributeNS ? el.getAttributeNS(W, name) : null;

const onOff = (el: Element | undefined, name: string): boolean | undefined => {
	if (!el) return undefined;
	const v = el.getAttributeNS(W, name) ?? el.getAttribute(name);
	if (v === null) return true; // <w:b/> with no val means ON
	return !(v === '0' || v === 'false' || v === 'none' || v === 'off');
};

const num = (v: string | null | undefined): number | undefined => {
	if (v == null || v === '') return undefined;
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
};

const parseXml = (text: string): Document | null => {
	if (!text) return null;
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	return doc.querySelector('parsererror') ? null : doc;
};

/* ------------------------------------------------------------------ */
/* styles                                                              */
/* ------------------------------------------------------------------ */

interface RunProps {
	b?: boolean;
	i?: boolean;
	u?: boolean;
	strike?: boolean;
	sz?: number;
	color?: string;
	vert?: string;
	font?: string;
}

interface ParaProps {
	jc?: string;
	before?: number;
	after?: number;
	line?: number;
	lineRule?: string;
	indLeft?: number;
	indRight?: number;
	indFirst?: number;
	indHanging?: number;
	numId?: string;
	ilvl?: number;
}

interface StyleDef {
	basedOn?: string;
	pPr?: ParaProps;
	rPr?: RunProps;
}

function parseRPr(el: Element | undefined): RunProps {
	const out: RunProps = {};
	if (!el) return out;
	const b = onOff(wKid(el, 'b'), 'val');
	if (b !== undefined) out.b = b;
	const i = onOff(wKid(el, 'i'), 'val');
	if (i !== undefined) out.i = i;
	const uEl = wKid(el, 'u');
	if (uEl) {
		const v = wAttr(uEl, 'val');
		out.u = v !== 'none' && v !== '0';
	}
	const strike = onOff(wKid(el, 'strike'), 'val');
	if (strike !== undefined) out.strike = strike;
	const sz = wKid(el, 'sz');
	const szVal = num(wAttr(sz, 'val'));
	if (szVal !== undefined) out.sz = szVal / 2;
	const colorEl = wKid(el, 'color');
	const color = colorEl ? wAttr(colorEl, 'val') : null;
	if (color && color !== 'auto') out.color = color;
	const vert = wKid(el, 'vertAlign');
	if (vert) out.vert = wAttr(vert, 'val') ?? undefined;
	const fonts = wKid(el, 'rFonts');
	if (fonts) out.font = wAttr(fonts, 'ascii') ?? wAttr(fonts, 'hAnsi') ?? undefined;
	return out;
}

function parsePPr(el: Element | undefined): ParaProps {
	const out: ParaProps = {};
	if (!el) return out;
	const jc = wKid(el, 'jc');
	if (jc) out.jc = wAttr(jc, 'val') ?? undefined;
	const spacing = wKid(el, 'spacing');
	if (spacing) {
		out.before = num(wAttr(spacing, 'before'));
		out.after = num(wAttr(spacing, 'after'));
		out.line = num(wAttr(spacing, 'line'));
		out.lineRule = wAttr(spacing, 'lineRule') ?? undefined;
	}
	const ind = wKid(el, 'ind');
	if (ind) {
		out.indLeft = num(wAttr(ind, 'left')) ?? num(wAttr(ind, 'start'));
		out.indRight = num(wAttr(ind, 'right')) ?? num(wAttr(ind, 'end'));
		out.indFirst = num(wAttr(ind, 'firstLine'));
		out.indHanging = num(wAttr(ind, 'hanging'));
	}
	const numPr = wKid(el, 'numPr');
	if (numPr) {
		const numIdEl = wKid(numPr, 'numId');
		const ilvlEl = wKid(numPr, 'ilvl');
		out.numId = numIdEl ? (wAttr(numIdEl, 'val') ?? '') : undefined;
		out.ilvl = num(wAttr(ilvlEl, 'val')) ?? 0;
	}
	return out;
}

function mergePara(base: ParaProps, over: ParaProps): ParaProps {
	return {
		jc: over.jc ?? base.jc,
		before: over.before ?? base.before,
		after: over.after ?? base.after,
		line: over.line ?? base.line,
		lineRule: over.lineRule ?? base.lineRule,
		indLeft: over.indLeft ?? base.indLeft,
		indRight: over.indRight ?? base.indRight,
		indFirst: over.indFirst ?? base.indFirst,
		indHanging: over.indHanging ?? base.indHanging,
		numId: over.numId !== undefined ? over.numId : base.numId,
		ilvl: over.ilvl !== undefined ? over.ilvl : base.ilvl
	};
}

function mergeRun(base: RunProps, over: RunProps): RunProps {
	return { ...base, ...Object.fromEntries(Object.entries(over).filter(([, v]) => v !== undefined)) };
}

/* ------------------------------------------------------------------ */
/* numbering                                                           */
/* ------------------------------------------------------------------ */

interface LevelDef {
	fmt: string;
	text: string;
	leftTw: number;
	hangingTw: number;
}

const LEVEL_FALLBACK = (ilvl: number): LevelDef => ({
	fmt: 'bullet',
	text: '•',
	leftTw: 720 + 360 * ilvl,
	hangingTw: 360
});

/* ------------------------------------------------------------------ */
/* parser                                                              */
/* ------------------------------------------------------------------ */

interface ParseCtx {
	zip: Record<string, Uint8Array>;
	rels: Map<string, string>;
	fontRels: Map<string, string>;
	styles: Map<string, StyleDef>;
	docDefaults: { pPr: ParaProps; rPr: RunProps };
	numToAbs: Map<string, string>;
	absLevels: Map<string, LevelDef[]>;
	counters: Map<string, number[]>;
	fonts: Map<string, Partial<Record<FontStyle, EmbeddedFont>>>;
	sourceName: string;
}

const resolveRels = (doc: Document | null): Map<string, string> => {
	const map = new Map<string, string>();
	if (!doc) return map;
	for (const rel of all(doc, REL, 'Relationship')) {
		const id = rel.getAttribute('Id');
		const target = rel.getAttribute('Target');
		if (id && target) map.set(id, target);
	}
	return map;
};

/** Resolve a relationship target relative to a base part path ("word/"). */
const resolveTarget = (base: string, target: string): string => {
	if (target.startsWith('/')) return target.slice(1);
	const parts = (base + target).split('/');
	const stack: string[] = [];
	for (const part of parts) {
		if (part === '..') stack.pop();
		else if (part !== '.' && part !== '') stack.push(part);
	}
	return stack.join('/');
};

const baseDir = (path: string): string => path.slice(0, path.lastIndexOf('/') + 1);

function loadStyles(xmlText: string): { styles: Map<string, StyleDef>; pPr: ParaProps; rPr: RunProps } {
	const styles = new Map<string, StyleDef>();
	let pPr: ParaProps = {};
	let rPr: RunProps = {};
	const doc = parseXml(xmlText);
	if (doc) {
		const defaults = all(doc, W, 'docDefaults')[0];
		if (defaults) {
			const rPrDef = wKid(defaults, 'rPrDefault');
			if (rPrDef) rPr = parseRPr(wKid(rPrDef, 'rPr'));
			const pPrDef = wKid(defaults, 'pPrDefault');
			if (pPrDef) pPr = parsePPr(wKid(pPrDef, 'pPr'));
		}
		for (const style of all(doc, W, 'style')) {
			const id = wAttr(style, 'styleId');
			if (!id) continue;
			styles.set(id, {
				basedOn: wKid(style, 'basedOn') ? (wAttr(wKid(style, 'basedOn') as Element, 'val') ?? undefined) : undefined,
				pPr: parsePPr(wKid(style, 'pPr')),
				rPr: parseRPr(wKid(style, 'rPr'))
			});
		}
	}
	return { styles, pPr, rPr };
}

function loadNumbering(xmlText: string): {
	numToAbs: Map<string, string>;
	absLevels: Map<string, LevelDef[]>;
} {
	const numToAbs = new Map<string, string>();
	const absLevels = new Map<string, LevelDef[]>();
	const doc = parseXml(xmlText);
	if (!doc) return { numToAbs, absLevels };

	for (const numEl of all(doc, W, 'num')) {
		const id = wAttr(numEl, 'numId');
		const abs = wKid(numEl, 'abstractNumId');
		if (id && abs) numToAbs.set(id, wAttr(abs, 'val') ?? '');
	}
	for (const abs of all(doc, W, 'abstractNum')) {
		const id = wAttr(abs, 'abstractNumId');
		if (!id) continue;
		const levels: LevelDef[] = [];
		for (const lvl of wKids(abs, 'lvl')) {
			const ilvl = num(wAttr(lvl, 'ilvl')) ?? 0;
			const fmt = wKid(lvl, 'numFmt') ? (wAttr(wKid(lvl, 'numFmt') as Element, 'val') ?? 'bullet') : 'bullet';
			const textEl = wKid(lvl, 'lvlText');
			const text = textEl ? (wAttr(textEl, 'val') ?? '•') : '•';
			const pPr = parsePPr(wKid(lvl, 'pPr'));
			levels[ilvl] = {
				fmt,
				text,
				leftTw: pPr.indLeft ?? 720 + 360 * ilvl,
				hangingTw: pPr.indHanging ?? 360
			};
		}
		absLevels.set(id, levels);
	}
	return { numToAbs, absLevels };
}

function markerFor(ctx: ParseCtx, numId: string, ilvl: number): { text: string; leftTw: number; hangingTw: number } {
	const absId = ctx.numToAbs.get(numId);
	const levels = absId ? ctx.absLevels.get(absId) : undefined;
	const level = levels?.[ilvl] ?? LEVEL_FALLBACK(ilvl);

	let text: string;
	if (level.fmt === 'bullet') {
		text = level.text || '•';
	} else {
		const counters = ctx.counters.get(numId) ?? [];
		for (let i = 0; i <= ilvl; i += 1) counters[i] = (counters[i] ?? 0) + 1;
		for (let i = ilvl + 1; i < 8; i += 1) counters[i] = 0;
		ctx.counters.set(numId, counters);
		text = level.text.replace(/%(\d)/g, (_, d: string) => {
			const idx = Number(d) - 1;
			const value = counters[idx] ?? 1;
			if (level.fmt === 'lowerLetter') return String.fromCharCode(97 + ((value - 1) % 26));
			if (level.fmt === 'upperLetter') return String.fromCharCode(65 + ((value - 1) % 26));
			if (level.fmt === 'lowerRoman') return toRoman(value).toLowerCase();
			if (level.fmt === 'upperRoman') return toRoman(value);
			return String(value);
		});
	}
	return { text, leftTw: level.leftTw, hangingTw: level.hangingTw };
}

function toRoman(n: number): string {
	const map: [number, string][] = [
		[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
		[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
	];
	let out = '';
	let v = Math.max(1, n);
	for (const [value, sym] of map) while (v >= value) { out += sym; v -= value; }
	return out;
}

/* ------------------------------------------------------------------ */
/* style resolution                                                    */
/* ------------------------------------------------------------------ */

function resolveParaStyle(ctx: ParseCtx, styleId: string | undefined): ParaProps {
	if (!styleId) return {};
	const chain: StyleDef[] = [];
	const seen = new Set<string>();
	let cursor: string | undefined = styleId;
	while (cursor && !seen.has(cursor)) {
		seen.add(cursor);
		const def: StyleDef | undefined = ctx.styles.get(cursor);
		if (!def) break;
		chain.unshift(def);
		cursor = def.basedOn;
	}
	return chain.reduce<ParaProps>((acc, def) => mergePara(acc, def.pPr ?? {}), {});
}

function resolveRunStyle(ctx: ParseCtx, styleId: string | undefined, direct: RunProps): RunProps {
	let base = ctx.docDefaults.rPr;
	if (styleId) {
		const chain: StyleDef[] = [];
		const seen = new Set<string>();
		let cursor: string | undefined = styleId;
		while (cursor && !seen.has(cursor)) {
			seen.add(cursor);
			const def: StyleDef | undefined = ctx.styles.get(cursor);
			if (!def) break;
			chain.unshift(def);
			cursor = def.basedOn;
		}
		for (const def of chain) base = mergeRun(base, def.rPr ?? {});
	}
	return mergeRun(base, direct);
}

function toRunStyle(props: RunProps): RunStyle {
	const color: [number, number, number] = props.color
		? ([
				parseInt(props.color.slice(0, 2), 16) || 0,
				parseInt(props.color.slice(2, 4), 16) || 0,
				parseInt(props.color.slice(4, 6), 16) || 0
			] as [number, number, number])
		: DEFAULT_COLOR;
	return {
		family: props.font ?? 'Calibri',
		bold: props.b === true,
		italic: props.i === true,
		underline: props.u === true,
		strike: props.strike === true,
		vert: props.vert === 'superscript' ? 'super' : props.vert === 'subscript' ? 'sub' : 'base',
		sizePt: props.sz ?? 11,
		color
	};
}

/* ------------------------------------------------------------------ */
/* geometry / headers                                                  */
/* ------------------------------------------------------------------ */

function parseGeometry(sectPr: Element | undefined): { geo: Geometry; refs: Map<string, string> } {
	const refs = new Map<string, string>();
	const geo: Geometry = { ...DEFAULT_GEOMETRY };
	if (!sectPr) return { geo, refs };

	const pgSz = wKid(sectPr, 'pgSz');
	if (pgSz) {
		const w = num(wAttr(pgSz, 'w'));
		const h = num(wAttr(pgSz, 'h'));
		if (w && h) {
			geo.wMm = w * TWIP_MM;
			geo.hMm = h * TWIP_MM;
			if (wAttr(pgSz, 'orient') === 'landscape' && geo.wMm < geo.hMm) {
				[geo.wMm, geo.hMm] = [geo.hMm, geo.wMm];
			}
		}
	}
	const mar = wKid(sectPr, 'pgMar');
	if (mar) {
		const get = (name: string, fallback: number): number =>
			num(wAttr(mar, name)) !== undefined ? (num(wAttr(mar, name)) as number) * TWIP_MM : fallback;
		geo.topMm = get('top', geo.topMm);
		geo.rightMm = get('right', geo.rightMm);
		geo.bottomMm = get('bottom', geo.bottomMm);
		geo.leftMm = get('left', geo.leftMm);
		geo.headerMm = get('header', geo.headerMm);
		geo.footerMm = get('footer', geo.footerMm);
	}

	// Prefer default-type references; otherwise take whatever exists.
	for (const kind of ['headerReference', 'footerReference']) {
		const refsOfKind = wKids(sectPr, kind).map((el) => ({
			type: wAttr(el, 'type') ?? 'default',
			rid: el.getAttributeNS(R, 'id') ?? ''
		}));
		const chosen = refsOfKind.find((r) => r.type === 'default') ?? refsOfKind[0];
		if (chosen) refs.set(kind === 'headerReference' ? 'header' : 'footer', chosen.rid);
	}
	return { geo, refs };
}

/* ------------------------------------------------------------------ */
/* images                                                              */
/* ------------------------------------------------------------------ */

const MIME_BY_EXT: Record<string, { mime: string; format: 'PNG' | 'JPEG' }> = {
	png: { mime: 'image/png', format: 'PNG' },
	jpg: { mime: 'image/jpeg', format: 'JPEG' },
	jpeg: { mime: 'image/jpeg', format: 'JPEG' }
};

function toDataUrl(bytes: Uint8Array): { dataUrl: string; format: 'PNG' | 'JPEG' } | null {
	const bin = String.fromCharCode(...bytes.subarray(0, 4));
	let ext = '';
	if (bin === '\x89PNG') ext = 'png';
	else if (bin.startsWith('\xFF\xD8')) ext = 'jpg';
	else return null;
	const { mime, format } = MIME_BY_EXT[ext];
	let base64 = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		base64 += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return { dataUrl: `data:${mime};base64,${btoa(base64)}`, format };
}

function imageFromDrawing(drawing: Element, ctx: ParseCtx, basePart: string): { wMm: number; hMm: number; block: Block } | null {
	const blip = all(drawing, A, 'blip')[0];
	const rid = blip ? blip.getAttributeNS(R, 'embed') : null;
	if (!rid) return null;
	const extent = all(drawing, WP, 'extent')[0];
	let wMm = extent ? num(extent.getAttribute('cx'))! * EMU_MM : 0;
	let hMm = extent ? num(extent.getAttribute('cy'))! * EMU_MM : 0;
	const target = ctx.rels.get(rid);
	if (!target) return null;
	const path = resolveTarget(baseDir(basePart), target);
	const bytes = ctx.zip[path];
	if (!bytes) return null;
	const encoded = toDataUrl(bytes);
	if (!encoded) return null;
	if (!wMm || !hMm) {
		wMm = 80;
		hMm = 60;
	}
	return { wMm, hMm, block: { kind: 'img', ...encoded, wMm, hMm } };
}

/* ------------------------------------------------------------------ */
/* paragraphs                                                          */
/* ------------------------------------------------------------------ */

function styleAtomsOfRun(ctx: ParseCtx, run: Element, styleId: string | undefined): { style: RunStyle; direct: RunProps } {
	const rPr = wKid(run, 'rPr');
	const props = resolveRunStyle(ctx, styleId, parseRPr(rPr));
	return { style: toRunStyle(props), direct: props };
}

/** Walks a paragraph's children, producing blocks (page breaks split paragraphs). */
function parseParagraph(ctx: ParseCtx, p: Element, basePart: string, out: Block[]): void {
	const pPr = wKid(p, 'pPr');
	const pStyleEl = wKid(pPr, 'pStyle');
	const styleId = pStyleEl ? (wAttr(pStyleEl, 'val') ?? undefined) : undefined;
	const paraProps = mergePara(resolveParaStyle(ctx, styleId), parsePPr(pPr));

	// numbering indents supply defaults when the paragraph has no explicit indents
	let listInd: { leftTw: number; hangingTw: number } | undefined;
	let marker: { text: string; hangingMm: number } | undefined;
	if (paraProps.numId) {
		const m = markerFor(ctx, paraProps.numId, paraProps.ilvl ?? 0);
		listInd = { leftTw: m.leftTw, hangingTw: m.hangingTw };
		marker = { text: m.text, hangingMm: m.hangingTw * TWIP_MM };
	}

	const align: Align =
		paraProps.jc === 'center' ? 'center' :
		paraProps.jc === 'right' || paraProps.jc === 'end' ? 'right' :
		paraProps.jc === 'both' ? 'justify' :
		'left';

	const leftTw = paraProps.indLeft ?? listInd?.leftTw ?? 0;
	const hanging = paraProps.indHanging ?? listInd?.hangingTw;
	const firstMm = paraProps.indFirst !== undefined
		? paraProps.indFirst * TWIP_MM - (hanging !== undefined ? hanging * TWIP_MM : 0)
		: -(hanging ?? 0) * TWIP_MM;

	let lineMul = 1.15;
	if (paraProps.line !== undefined) {
		if (paraProps.lineRule === 'exact' || paraProps.lineRule === 'atLeast') {
			lineMul = (paraProps.line * TWIP_MM) / Math.max(1, 11 * PT_MM_FALLBACK(ctx, styleId));
		} else {
			lineMul = (paraProps.line / 240) * 1.15;
		}
	}

	const defaultStyle = toRunStyle(resolveRunStyle(ctx, styleId, {}));

	const para: Paragraph = {
		kind: 'p',
		atoms: [],
		align,
		leftMm: leftTw * TWIP_MM,
		rightMm: (paraProps.indRight ?? 0) * TWIP_MM,
		firstMm,
		beforeMm: (paraProps.before ?? 0) * TWIP_MM,
		afterMm: paraProps.after !== undefined ? paraProps.after * TWIP_MM : 3.5,
		lineMul,
		marker,
		sizePt: paraProps.numId ? defaultStyle.sizePt : defaultStyle.sizePt
	};

	let sawContent = false;
	/** Emits the accumulated paragraph (if it holds anything) to `out`. */
	const flush = () => {
		if (para.atoms.length > 0) {
			out.push(para);
			sawContent = false;
			para.atoms = [];
		}
	};

	let fieldPhase: 'none' | 'instr' | 'result' = 'none';
	let fieldInstr = '';

	const handleChild = (child: Element): void => {
		if (child.namespaceURI !== W) return;
		switch (child.localName) {
			case 'r': {
				const { style } = styleAtomsOfRun(ctx, child, styleId);
				for (const node of Array.from(child.children)) {
					if (node.namespaceURI !== W) continue;
					if (node.localName === 'fldChar') {
						const type = wAttr(node, 'fldCharType');
						if (type === 'begin') { fieldPhase = 'instr'; fieldInstr = ''; }
						else if (type === 'separate') {
							if (fieldPhase === 'instr') {
								const which = fieldInstr.includes('NUMPAGES') ? 'total' : fieldInstr.includes('PAGE') ? 'page' : null;
								if (which) {
									para.atoms.push({ kind: 'field', which, style });
									sawContent = true;
								}
								fieldPhase = 'result';
							}
						} else if (type === 'end') { fieldPhase = 'none'; fieldInstr = ''; }
						continue;
					}
					if (node.localName === 'instrText') {
						if (fieldPhase === 'instr') fieldInstr += node.textContent ?? '';
						continue;
					}
					if (fieldPhase === 'instr' || fieldPhase === 'result') continue;
					if (node.localName === 't') {
						const text = node.textContent ?? '';
						if (text) {
							assertLatin(text, ctx.sourceName);
							para.atoms.push({ kind: 'text', text, style });
							sawContent = true;
						}
					} else if (node.localName === 'tab') {
						para.atoms.push({ kind: 'tab', style });
						sawContent = true;
					} else if (node.localName === 'br') {
						if (wAttr(node, 'type') === 'page') {
							flush();
							out.push({ kind: 'pagebreak' });
						} else {
							para.atoms.push({ kind: 'nl' });
							sawContent = true;
						}
					} else if (node.localName === 'drawing' || node.localName === 'pict') {
						const image = imageFromDrawing(node, ctx, basePart);
						if (image) {
							flush();
							out.push(image.block);
						}
					}
				}
				break;
			}
			case 'hyperlink':
			case 'ins':
			case 'smartTag':
				for (const childOfChild of Array.from(child.children)) handleChild(childOfChild);
				break;
			case 'fldSimple': {
				const instr = child.getAttribute('w:instr') ?? child.getAttribute('instr') ?? '';
				const style = toRunStyle(resolveRunStyle(ctx, styleId, {}));
				if (instr.includes('NUMPAGES')) {
					para.atoms.push({ kind: 'field', which: 'total', style });
					sawContent = true;
				} else if (instr.includes('PAGE')) {
					para.atoms.push({ kind: 'field', which: 'page', style });
					sawContent = true;
				} else {
					for (const childOfChild of Array.from(child.children)) handleChild(childOfChild);
				}
				break;
			}
			default:
				break;
		}
	};

	for (const child of Array.from(p.children)) handleChild(child);

	// A paragraph with no atoms still occupies a line (Word blank-line spacing).
	if (para.atoms.length > 0 || !sawContent) out.push(para);
}

/** Baseline font size for line-height maths when lineRule is exact. */
function PT_MM_FALLBACK(ctx: ParseCtx, styleId: string | undefined): number {
	return resolveRunStyle(ctx, styleId, {}).sz ?? 11;
}

/* ------------------------------------------------------------------ */
/* tables                                                              */
/* ------------------------------------------------------------------ */

function parseTable(ctx: ParseCtx, tbl: Element, basePart: string, out: Block[]): void {
	const tblPr = wKid(tbl, 'tblPr');
	const grid = wKid(tbl, 'tblGrid');
	const colTwips: number[] = grid ? wKids(grid, 'gridCol').map((c) => num(wAttr(c, 'w')) ?? 0) : [];

	// width mode: pct / dxa / auto
	let pct = 0;
	let dxa = 0;
	const tblW = tblPr ? wKid(tblPr, 'tblW') : undefined;
	if (tblW) {
		const type = wAttr(tblW, 'type');
		const val = num(wAttr(tblW, 'w')) ?? 0;
		if (type === 'pct') pct = val / 50;
		else if (type === 'dxa') dxa = val;
	}

	const rowsRaw = wKids(tbl, 'tr');
	const parsedRows: Cell[][] = [];	for (const tr of rowsRaw) {
		const cells: Cell[] = [];
		for (const tc of wKids(tr, 'tc')) {
			const tcPr = wKid(tc, 'tcPr');
			let colSpan = 1;
			let rowSpan = 1;
			let skip = false;
			let shade: [number, number, number] | undefined;
			let cellWidthTw = 0;
			if (tcPr) {
				const span = wKid(tcPr, 'gridSpan');
				if (span) colSpan = Math.max(1, num(wAttr(span, 'val')) ?? 1);
				const vMerge = wKid(tcPr, 'vMerge');
				if (vMerge) {
					const v = wAttr(vMerge, 'val');
					if (v === 'continue') skip = true;
				}
				const shd = wKid(tcPr, 'shd');
				if (shd) {
					const fill = wAttr(shd, 'fill');
					if (fill && fill !== 'auto' && fill.length === 6) {
						shade = [
							parseInt(fill.slice(0, 2), 16) || 0,
							parseInt(fill.slice(2, 4), 16) || 0,
							parseInt(fill.slice(4, 6), 16) || 0
						];
					}
				}
				const w = wKid(tcPr, 'tcW');
				if (w && wAttr(w, 'type') === 'dxa') cellWidthTw = num(wAttr(w, 'w')) ?? 0;
			}
			const blocks: Block[] = [];
			for (const child of Array.from(tc.children)) {
				if (child.namespaceURI === W && child.localName === 'p') parseParagraph(ctx, child, basePart, blocks);
				else if (child.namespaceURI === W && child.localName === 'tbl') parseTable(ctx, child, basePart, blocks);
			}
			cells.push({ blocks, wMm: 0, shade, colSpan, rowSpan, skip });
		}
		// measure vMerge run lengths to set rowSpan on the restart cell
		parsedRows.push(cells);
	}
	for (let r = 0; r < parsedRows.length; r += 1) {
		const cells = parsedRows[r];
		for (let c = 0; c < cells.length; c += 1) {
			const tcPr = wKids(rowsRaw[r], 'tc')[c] ? wKid(wKids(rowsRaw[r], 'tc')[c], 'tcPr') : undefined;
			const vMerge = tcPr ? wKid(tcPr, 'vMerge') : undefined;
			if (vMerge && wAttr(vMerge, 'val') !== 'continue' && !vMerge.hasAttributeNS(W, 'val')) {
				let span = 1;
				for (let rr = r + 1; rr < parsedRows.length; rr += 1) {
					const tcEls = wKids(rowsRaw[rr], 'tc');
					const candidate = tcEls[c];
					if (!candidate) break;
					const pr = wKid(candidate, 'tcPr');
					const vm = pr ? wKid(pr, 'vMerge') : null;
					if (vm && !wAttr(vm, 'val')) span += 1;
					else break;
				}
				cells[c].rowSpan = span;
				for (let rr = r + 1; rr < r + span && rr < parsedRows.length; rr += 1) {
					if (parsedRows[rr][c]) parsedRows[rr][c].skip = true;
				}
			}
		}
	}

	// widths: grid (twips) scaled to the requested table width
	const widths = colTwips.length
		? colTwips.map((w) => w * TWIP_MM)
		: [];
	if (widths.length === 0) {
		const n = Math.max(...parsedRows.map((row) => row.reduce((s, c) => s + (c.skip ? 0 : c.colSpan), 0)), 1);
		for (let i = 0; i < n; i += 1) widths.push(0);
	}
	const header = wKids(wKid(rowsRaw[0], 'trPr'), 'tblHeader').length > 0;

	// attach widths to cells (expanding across colSpan); leave the exact
	// total to the renderer, which scales to the content box.
	for (const row of parsedRows) {
		let idx = 0;
		for (const cell of row) {
			if (cell.skip) continue;
			let w = 0;
			for (let k = 0; k < cell.colSpan; k += 1) w += widths[idx + k] ?? 0;
			cell.wMm = w;
			idx += cell.colSpan;
		}
	}

	const table: Block = { kind: 'table', rows: parsedRows, header };
	out.push(table);
}

/* ------------------------------------------------------------------ */
/* blocks walk                                                         */
/* ------------------------------------------------------------------ */

function parseBlocks(ctx: ParseCtx, parent: Element, basePart: string): Block[] {
	const out: Block[] = [];
	for (const child of Array.from(parent.children)) {
		if (child.namespaceURI !== W) continue;
		if (child.localName === 'p') parseParagraph(ctx, child, basePart, out);
		else if (child.localName === 'tbl') parseTable(ctx, child, basePart, out);
		else if (child.localName === 'sdt') {
			const content = wKid(child, 'sdtContent');
			if (content) out.push(...parseBlocks(ctx, content, basePart));
		}
	}
	return out;
}

/** Header/footer parts are just block sequences. */
function parsePartBlocks(ctx: ParseCtx, path: string): Block[] {
	const bytes = ctx.zip[path];
	if (!bytes) return [];
	const doc = parseXml(new TextDecoder().decode(bytes));
	if (!doc) return [];
	const root = doc.documentElement;
	return parseBlocks(ctx, root, path);
}

/* ------------------------------------------------------------------ */
/* embedded fonts                                                      */
/* ------------------------------------------------------------------ */

const GUID_SLOT: Record<string, FontStyle> = {
	embedRegular: 'normal',
	embedBold: 'bold',
	embedItalic: 'italic',
	embedBoldItalic: 'bolditalic'
};

function guidToBytes(guid: string): Uint8Array | null {
	const hex = guid.replace(/[{}-]/g, '');
	if (!/^[0-9a-fA-F]{32}$/.test(hex)) return null;
	const p: number[] = [];
	for (let i = 0; i < 16; i += 1) p.push(parseInt(hex.slice(i * 2, i * 2 + 2), 16));
	// .NET Guid.ToByteArray() ordering, as required by ECMA-376 obfuscation
	return new Uint8Array([p[3], p[2], p[1], p[0], p[5], p[4], p[7], p[6], ...p.slice(8)]);
}

function deobfuscate(bytes: Uint8Array, guid: string): Uint8Array | null {
	const key = guidToBytes(guid);
	if (!key) return null;
	const out = bytes.slice();
	for (let i = 0; i < 32 && i < out.length; i += 1) out[i] ^= key[i % 16];
	return out;
}

function loadFonts(ctx: ParseCtx): void {
	const doc = parseXml(new TextDecoder().decode(ctx.zip['word/fontTable.xml'] ?? new Uint8Array()));
	if (!doc) return;
	for (const fontEl of all(doc, W, 'font')) {
		const family = wAttr(fontEl, 'name');
		if (!family) continue;
		for (const slot of Object.keys(GUID_SLOT)) {
			const el = wKid(fontEl, slot);
			if (!el) continue;
			const rid = el.getAttributeNS(R, 'id');
			const key = wAttr(el, 'fontKey');
			if (!rid || !key) continue;
			const target = ctx.fontRels.get(rid);
			if (!target) continue;
			const path = resolveTarget('word/', target);
			const bytes = ctx.zip[path];
			if (!bytes) continue;
			const plain = deobfuscate(bytes, key);
			if (!plain) continue;
			const style = GUID_SLOT[slot];
			const entry: EmbeddedFont = { bytes: plain, fileName: `f_${family.replace(/[^A-Za-z0-9]/g, '')}_${style}.ttf` };
			const bucket = ctx.fonts.get(family) ?? {};
			bucket[style] = entry;
			ctx.fonts.set(family, bucket);
		}
	}
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

export async function parseDocx(file: File): Promise<DocModel> {
	const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
	const decoder = new TextDecoder();

	const documentDoc = parseXml(decoder.decode(zip['word/document.xml'] ?? new Uint8Array()));
	if (!documentDoc) {
		throw new Error(`“${file.name}” could not be read as a .docx file. It may be damaged or not a Word document.`);
	}

	const rels = resolveRelsWithFallback(zip, 'word/_rels/document.xml.rels');
	const { styles, pPr: defaultPPr, rPr: defaultRPr } = loadStyles(decoder.decode(zip['word/styles.xml'] ?? new Uint8Array()));
	const { numToAbs, absLevels } = loadNumbering(decoder.decode(zip['word/numbering.xml'] ?? new Uint8Array()));

	const ctx: ParseCtx = {
		zip,
		rels,
		fontRels: resolveRelsWithFallback(zip, 'word/_rels/fontTable.xml.rels'),
		styles,
		docDefaults: { pPr: defaultPPr, rPr: defaultRPr },
		numToAbs,
		absLevels,
		counters: new Map(),
		fonts: new Map(),
		sourceName: file.name
	};
	loadFonts(ctx);

	const body = kid(documentDoc.documentElement, W, 'body');
	if (!body) {
		throw new Error(`“${file.name}” has no document body — nothing to convert.`);
	}

	const sections: Section[] = [];
	let geo: Geometry = { ...DEFAULT_GEOMETRY };
	let refs = new Map<string, string>();
	let blocks: Block[] = [];

	const materialize = () => {
		const headerPath = refs.get('header') ? resolveTarget('word/', rels.get(refs.get('header')!) ?? '') : '';
		const footerPath = refs.get('footer') ? resolveTarget('word/', rels.get(refs.get('footer')!) ?? '') : '';
		sections.push({
			geo: { ...geo },
			header: headerPath ? parsePartBlocks(ctx, headerPath) : [],
			footer: footerPath ? parsePartBlocks(ctx, footerPath) : [],
			blocks
		});
		blocks = [];
	};

	for (const child of Array.from(body.children)) {
		if (child.namespaceURI !== W) continue;
		if (child.localName === 'p') {
			const pPr = wKid(child, 'pPr');
			const sectPr = pPr ? wKid(pPr, 'sectPr') : undefined;
			if (sectPr) {
				const parsed = parseGeometry(sectPr);
				// sectPr inside a paragraph closes the section this paragraph belongs to
				geo = parsed.geo;
				refs = parsed.refs;
				materialize();
				continue;
			}
			parseParagraph(ctx, child, 'word/document.xml', blocks);
		} else if (child.localName === 'tbl') {
			parseTable(ctx, child, 'word/document.xml', blocks);
		} else if (child.localName === 'sdt') {
			const content = wKid(child, 'sdtContent');
			if (content) {
				for (const inner of Array.from(content.children)) {
					if (inner.namespaceURI === W && inner.localName === 'p') parseParagraph(ctx, inner, 'word/document.xml', blocks);
					else if (inner.namespaceURI === W && inner.localName === 'tbl') parseTable(ctx, inner, 'word/document.xml', blocks);
				}
			}
		} else if (child.localName === 'sectPr') {
			const parsed = parseGeometry(child);
			geo = parsed.geo;
			refs = parsed.refs;
		}
	}
	materialize();

	if (sections.length === 0 || sections.every((s) => s.blocks.length === 0)) {
		throw new Error(`“${file.name}” appears to be empty — no text or images were found.`);
	}

	return { sections, fonts: ctx.fonts };
}

function resolveRelsWithFallback(zip: Record<string, Uint8Array>, path: string): Map<string, string> {
	const bytes = zip[path];
	if (!bytes) return new Map();
	return resolveRels(parseXml(new TextDecoder().decode(bytes)));
}
