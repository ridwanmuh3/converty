import { LIMITS, OUTPUT } from '#lib/core/limits';
import { defineTool } from '../define';

export default defineTool({
	slug: 'video-to-mp3',
	name: 'Video to MP3',
	shortName: 'Video → MP3',
	icon: 'audio',
	category: 'audio',
	input: {
		extensions: ['mp4', 'm4v', 'mov'],
		kinds: ['mp4'],
		acceptAttr: '.mp4,.m4v,.mov,video/mp4,video/quicktime'
	},
	output: {
		ext: 'mp3',
		mime: 'audio/mpeg',
		label: 'MP3'
	},
	pipeline: 'video-to-audio',
	worker: 'video',
	memoryWeight: 2,
	arity: 'single',
	copy: {
		tagline: 'Audio from MP4, M4V and MOV clips.',
		description: 'Turn the audio of an MP4, M4V or MOV clip into MP3. The video never leaves your device and is not re-encoded.',
		fidelity: 'fair',
		fidelityTitle: 'Audio only, re-encoded',
		fidelityNote: `The video stream is dropped without decoding it. Audio is re-encoded at ${OUTPUT.mp3BitrateKbps} kbps, so quality is not bit-identical; metadata is not kept.`,
		limitations: [
			'MP4/MOV containers only — WebM and OGG video are not supported.',
			'The browser must decode the clip’s audio codec; otherwise the file is refused with an explanation.',
			`Clips are capped at ${LIMITS.maxFileBytes / 1024 / 1024} MB and ${LIMITS.maxVideoSeconds / 60} minutes so decoding stays within browser memory.`
		]
	},
	options: []
});
