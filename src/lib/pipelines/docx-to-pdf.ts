import { baseName } from '#lib/core/format';
import type { Converter } from '#lib/core/types';
import { parseDocx } from './docx/parse';
import { renderDocx, resolveGeometry } from './docx/render';

export const convertDocxToPdf: Converter = async (file, ctx) => {
	const model = await parseDocx(file);
	ctx.onProgress(0.15);

	const { jsPDF } = await import('jspdf');
	const { default: autoTable } = await import('jspdf-autotable');

	const firstGeo = resolveGeometry(model.sections[0].geo, ctx.options.pageSize);
	const makeDoc = () => {
		const doc = new jsPDF({ unit: 'mm', format: [firstGeo.wMm, firstGeo.hMm], compress: true });
		doc.setProperties({
			title: baseName(file.name),
			creator: 'Converty (local, in-browser)'
		});
		return doc;
	};

	const renderOptions = (totalPages?: number) => ({
		options: { pageSize: ctx.options.pageSize, totalPages },
		onProgress: (fraction: number) => ctx.onProgress(0.15 + fraction * 0.75),
		signal: ctx.signal,
		sourceName: file.name
	});

	const hasField = (which: 'page' | 'total'): boolean =>
		model.sections.some((section) =>
			[section.header, section.footer, section.blocks].some((parts) =>
				parts.some(
					(block) =>
						block.kind === 'p' &&
						block.atoms.some((atom) => atom.kind === 'field' && atom.which === which)
				)
			)
		);
	const hasNumPages = hasField('total');

	// NUMPAGES is unknowable mid-render; count pages on a throwaway pass first.
	let totalPages: number | undefined;
	if (hasNumPages) {
		const probe = makeDoc();
		await renderDocx(model, probe, renderOptions(undefined), (options) =>
			autoTable(probe as never, options as never)
		);
		totalPages = probe.getNumberOfPages();
	}

	const doc = makeDoc();
	await renderDocx(model, doc, renderOptions(totalPages), (options) => autoTable(doc as never, options as never));

	ctx.onProgress(1);
	return { blob: doc.output('blob') };
};
