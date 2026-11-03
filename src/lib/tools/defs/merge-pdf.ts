import { LIMITS } from '#lib/core/limits';
import { defineTool } from '../define';

export default defineTool({
	slug: 'merge-pdf',
	name: 'Merge PDF',
	shortName: 'Merge PDF',
	icon: 'pdf',
	category: 'document',
	input: {
		extensions: ['pdf'],
		kinds: ['pdf'],
		acceptAttr: '.pdf,application/pdf'
	},
	output: {
		ext: 'pdf',
		mime: 'application/pdf',
		label: 'PDF'
	},
	pipeline: 'merge-pdf',
	worker: 'pdf-edit',
	memoryWeight: 2,
	arity: 'many-to-one',
	finalizer: 'merge-pdf',
	minFiles: 2,
	copy: {
		tagline: 'Several PDFs into one file, in list order.',
		description:
			'Combine PDFs into a single document. Pages keep their original size, and the order of the list is the order of the output.',
		fidelity: 'good',
		fidelityTitle: 'Pages copied',
		fidelityNote:
			'Pages are copied byte-for-byte into the new document, so text, links and images are unchanged. Forms and bookmarks are not merged.',
		limitations: [
			'Password-protected PDFs must be unlocked before they can be merged.',
			'Bookmarks, form fields and signatures are not carried over.',
			`Each input is capped at ${LIMITS.maxPdfPages} pages, and the batch at ${LIMITS.maxTotalBytes / 1024 / 1024} MB of input.`
		]
	},
	options: []
});
