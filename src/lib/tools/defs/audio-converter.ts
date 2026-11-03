import { OUTPUT } from '#lib/core/limits';
import { defineTool } from '../define';

export default defineTool({
	slug: 'audio-converter',
	name: 'Audio Converter',
	shortName: 'Audio',
	icon: 'audio',
	category: 'audio',
	input: {
		extensions: ['mp3', 'wav', 'mpeg'],
		kinds: ['wav', 'mp3'],
		acceptAttr: '.mp3,.wav,.mpeg,audio/mpeg,audio/wav'
	},
	output: {
		ext: 'mp3',
		mime: 'audio/mpeg',
		label: 'MP3 or WAV'
	},
	pipeline: 'audio',
	worker: null,
	memoryWeight: 1,
	arity: 'single',
	copy: {
		tagline: 'MP3, WAV and MPEG audio — convert locally.',
		description: 'Convert MP3, MPEG audio and WAV files to MP3 or WAV, entirely in your browser.',
		fidelity: 'fair',
		fidelityTitle: 'Re-encoded audio',
		fidelityNote: `WAV output is uncompressed PCM. MP3 output is re-encoded at ${OUTPUT.mp3BitrateKbps} kbps; converting MP3 to MP3 loses quality. Metadata is not retained.`,
		limitations: [
			'MPEG video files are not supported — .mpeg must contain MPEG audio.',
			'Audio decoding depends on your browser. Stereo and mono only.',
			'WAV output is uncompressed, so long recordings can exceed browser memory — choose MP3 instead.'
		]
	},
	options: [
		{
			key: 'format',
			label: 'Output format',
			type: 'select',
			choices: [
				{ value: 'mp3', label: `MP3 — ${OUTPUT.mp3BitrateKbps} kbps` },
				{ value: 'wav', label: 'WAV — uncompressed PCM' }
			],
			defaultValue: 'mp3'
		}
	]
});
