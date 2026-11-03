import { LIMITS, OUTPUT } from '#lib/core/limits';
import { defineTool } from '../define';

export default defineTool({
	slug: 'mp4-to-mp3',
	name: 'MP4 to MP3',
	shortName: 'MP4 → MP3',
	icon: 'audio',
	category: 'audio',
	input: {
		extensions: ['mp4', 'm4v', 'mov', 'm4a'],
		kinds: ['mp4'],
		acceptAttr: '.mp4,.m4v,.mov,.m4a,video/mp4,video/quicktime,audio/mp4'
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
		tagline: 'Pull the audio out of an MP4 or MOV.',
		description: 'Extract the audio track from an MP4 or MOV file and save it as MP3, without uploading the video.',
		fidelity: 'fair',
		fidelityTitle: 'Audio only, re-encoded',
		fidelityNote: `Video is discarded. The audio track is decoded and re-encoded at ${OUTPUT.mp3BitrateKbps} kbps; metadata and multi-channel audio are not preserved.`,
		limitations: [
			'Only the audio track is used — there is no video output.',
			'The browser has to decode the clip’s audio itself. Chrome, Edge and recent Safari work; AAC audio may be unavailable in some Firefox builds.',
			`Clips are capped at ${LIMITS.maxFileBytes / 1024 / 1024} MB and ${LIMITS.maxVideoSeconds / 60} minutes so decoding stays within browser memory.`
		]
	},
	options: []
});
