import { LIMITS, OUTPUT } from '#lib/core/limits';
import { defineTool } from '../define';

export default defineTool({
	slug: 'mp3-converter',
	name: 'MP3 Converter',
	shortName: 'MP3',
	icon: 'audio',
	category: 'audio',
	input: {
		extensions: ['mp3', 'wav', 'm4a', 'mpeg'],
		kinds: ['wav', 'mp3', 'mp4'],
		acceptAttr: '.mp3,.wav,.m4a,.mpeg,audio/mpeg,audio/wav,audio/mp4'
	},
	output: {
		ext: 'mp3',
		mime: 'audio/mpeg',
		label: 'MP3'
	},
	pipeline: 'audio',
	worker: null,
	memoryWeight: 1,
	arity: 'single',
	copy: {
		tagline: 'WAV and MPEG audio to MP3.',
		description: `Convert WAV, MPEG audio and M4A files to MP3 at ${OUTPUT.mp3BitrateKbps} kbps, entirely in your browser.`,
		fidelity: 'fair',
		fidelityTitle: `Re-encoded at ${OUTPUT.mp3BitrateKbps} kbps`,
		fidelityNote: `MP3 output is re-encoded at ${OUTPUT.mp3BitrateKbps} kbps. Converting an existing MP3 again loses quality; metadata is not retained.`,
		limitations: [
			`Output is always MP3 at ${OUTPUT.mp3BitrateKbps} kbps — use the Audio Converter to choose WAV.`,
			`Audio is capped at ${LIMITS.maxAudioSeconds / 60} minutes and ${LIMITS.maxDecodedAudioBytes / 1024 / 1024} MB once decoded, because longer audio would use more memory than the tab has.`,
			'M4A input depends on the browser’s AAC decoder.'
		]
	},
	options: []
});
