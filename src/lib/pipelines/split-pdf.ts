import { baseName } from '#lib/core/format';
import { LIMITS } from '#lib/core/limits';
import type { Converter } from '#lib/core/types';

async function openPdf(file: File) {
	const { PDFDocument } = await import('pdf-lib');
	try {
		const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()));
		return doc;
	} catch (error) {
		const message = error instanceof Error ? error.message : '';
		if (/encrypt|password/i.test(message)) {
			throw new Error(
				`“${file.name}” is password-protected. Remove the password, then try again.`
			);
		}
		throw new Error(
			`“${file.name}” could not be opened as a PDF. It may be damaged or use an unsupported feature.`
		);
	}
}

interface RangeSpec {
	label: string;
	pages: number[];
}

/** Parses "1-3, 5" into page indices. Invalid input names the nearest valid form. */
export function parseRanges(input: string, totalPages: number): RangeSpec[] {
	const cleaned = input.trim();
	if (!cleaned) {
		throw new Error('Enter page ranges, for example 1-3, 5.');
	}

	const specs: RangeSpec[] = [];
	for (const part of cleaned.split(',')) {
		const text = part.trim();
		if (!text) continue;
		const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(text);
		if (!match) {
			throw new Error(`“${text}” is not a page range. Use numbers like 2 or 4-7, separated by commas.`);
		}
		const start = Number(match[1]);
		const end = match[2] ? Number(match[2]) : start;
		if (start < 1 || end < start || end > totalPages) {
			throw new Error(
				`“${text}” is outside this document. It has ${totalPages} ${totalPages === 1 ? 'page' : 'pages'}; use 1-${totalPages}.`
			);
		}
		const pages: number[] = [];
		for (let page = start; page <= end; page += 1) pages.push(page - 1);
		specs.push({ label: match[2] ? `${start}-${end}` : String(start), pages });
	}

	if (specs.length === 0) throw new Error('Enter at least one page or range.');
	return specs;
}

/** Writes one PDF per range, or one PDF per page. Several outputs come back as a ZIP. */
export const convertSplitPdf: Converter = async (file, ctx) => {
	const { PDFDocument } = await import('pdf-lib');
	ctx.onPhase?.('Reading PDF');
	const source = await openPdf(file);
	const totalPages = source.getPageCount();
	if (totalPages > LIMITS.maxPdfPages) {
		throw new Error(
			`“${file.name}” has ${totalPages} pages. The limit is ${LIMITS.maxPdfPages} pages per PDF.`
		);
	}

	const everyPage = ctx.options.mode === 'every';
	const specs: RangeSpec[] = everyPage
		? Array.from({ length: totalPages }, (_, index) => ({
				label: String(index + 1),
				pages: [index]
			}))
		: parseRanges(ctx.options.ranges ?? '', totalPages);

	const outputs: Record<string, Uint8Array> = {};
	const single: { bytes: Uint8Array; label: string }[] = [];
	const stem = baseName(file.name);

	for (let index = 0; index < specs.length; index += 1) {
		if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
		const spec = specs[index];
		ctx.onPhase?.(`Extracting ${spec.label}`);
		const out = await PDFDocument.create();
		const copied = await out.copyPages(source, spec.pages);
		for (const page of copied) out.addPage(page);
		out.setCreator('Converty (local, in-browser)');
		out.setTitle(`${stem} — ${spec.label}`);
		const bytes = new Uint8Array(await out.save());
		if (specs.length === 1) single.push({ bytes, label: spec.label });
		else outputs[`${stem}-page-${spec.label.replace(/-/g, '-')}.pdf`] = bytes;
		ctx.onProgress(0.1 + ((index + 1) / specs.length) * 0.8);
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	if (single.length === 1) {
		const copy = new Uint8Array(single[0].bytes.length);
		copy.set(single[0].bytes);
		return {
			blob: new Blob([copy], { type: 'application/pdf' }),
			ext: 'pdf',
			meta: { pages: specs[0].pages.length }
		};
	}

	ctx.onPhase?.('Packaging pages');
	const { zipSync } = await import('fflate');
	const zipped = zipSync(outputs, { level: 0 });
	const bytes = new Uint8Array(zipped.length);
	bytes.set(zipped);
	ctx.onProgress(1);
	return {
		blob: new Blob([bytes], { type: 'application/zip' }),
		ext: 'zip',
		meta: { pages: specs.length }
	};
};
