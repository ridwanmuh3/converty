import { createFile } from 'mp4box';
import { LIMITS, OUTPUT } from '#lib/core/limits';
import type { Converter } from '#lib/core/types';

const MAX_SECONDS = LIMITS.maxVideoSeconds;
const FRAME_CHUNK = 1152;

/**
 * WebCodecs expects bare codec strings. mp4box reports MPEG-1/2 audio in MP4 as
 * an MP4 object type (mp4a.6b / mp4a.69 / mp4a.40.34); all of those mean MP3.
 */
function normalizeCodec(codec: string): string {
	const raw = codec.replace(/^\./, '').trim().toLowerCase();
	if (raw === 'mp3' || raw === 'mp4a.6b' || raw === 'mp4a.69' || raw === 'mp4a.40.34') return 'mp3';
	return raw;
}

function pcm(samples: Float32Array): Int16Array {
	const output = new Int16Array(samples.length);
	for (let i = 0; i < samples.length; i += 1) {
		const value = Math.max(-1, Math.min(1, samples[i]));
		output[i] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
	}
	return output;
}

function join(a: Float32Array, b: Float32Array): Float32Array {
	if (a.length === 0) return b;
	const out = new Float32Array(a.length + b.length);
	out.set(a);
	out.set(b, a.length);
	return out;
}

/**
 * Extracts the audio track of an MP4/MOV file and encodes it to MP3. Video is
 * demuxed but never decoded: only the audio samples reach the decoder.
 */
export const convertVideoToMp3: Converter = async (file, ctx) => {
	if (typeof AudioDecoder === 'undefined') {
		throw new Error(
			'This browser cannot decode the audio inside a video (WebCodecs is unavailable). Try Chrome, Edge, or a recent Safari.'
		);
	}

	const container = (await file.arrayBuffer()) as ArrayBuffer & { fileStart: number };
	container.fileStart = 0;

	const { Mp3Encoder } = await import('@breezystack/lamejs');

	// Held in an object so TypeScript does not narrow these to `null` after the
	// null-check: they are assigned inside the mp4box callbacks.
	const state: { encoder: InstanceType<typeof Mp3Encoder> | null; decoder: AudioDecoder | null } = {
		encoder: null,
		decoder: null
	};
	let carryLeft: Float32Array = new Float32Array(0);
	let carryRight: Float32Array = new Float32Array(0);
	let channels = 1;
	let expected = 0;
	let seen = 0;
	let decodeError = '';
	const chunks: BlobPart[] = [];

	const mp4 = createFile();

	const encodeBlock = (left: Float32Array, right: Float32Array | undefined) => {
		if (!state.encoder) return;
		const encoded = state.encoder.encodeBuffer(pcm(left), right ? pcm(right) : undefined);
		if (encoded.length) chunks.push(Uint8Array.from(encoded));
	};

	const push = (left: Float32Array, right: Float32Array | undefined) => {
		carryLeft = join(carryLeft, left);
		if (channels === 2) carryRight = join(carryRight, right ?? new Float32Array(0));

		let offset = 0;
		while (carryLeft.length - offset >= FRAME_CHUNK) {
			encodeBlock(
				carryLeft.subarray(offset, offset + FRAME_CHUNK),
				channels === 2 ? carryRight.subarray(offset, offset + FRAME_CHUNK) : undefined
			);
			offset += FRAME_CHUNK;
		}
		carryLeft = carryLeft.slice(offset);
		if (channels === 2) carryRight = carryRight.slice(offset);
	};

	mp4.onError = (error) => {
		decodeError = `“${file.name}” could not be read as an MP4/MOV file. ${error}`;
	};

	mp4.onReady = (info) => {
		const track = info.audioTracks?.[0];
		if (!track) {
			decodeError = `“${file.name}” has no audio track to extract.`;
			return;
		}

		const duration = info.duration / info.timescale;
		if (duration > MAX_SECONDS) {
			decodeError = `“${file.name}” is ${Math.round(duration / 60)} minutes long. The limit is ${MAX_SECONDS / 60} minutes.`;
			return;
		}

		channels = Math.min(2, track.audio.channel_count || 1);
		expected = track.nb_samples;
		const sampleRate = track.audio.sample_rate;
		const codec = normalizeCodec(track.codec);

		state.encoder = new Mp3Encoder(channels, sampleRate, OUTPUT.mp3BitrateKbps);
		state.decoder = new AudioDecoder({
			output: (data) => {
				const frames = data.numberOfFrames;
				const interleaved = new Float32Array(frames * data.numberOfChannels);
				data.copyTo(interleaved, { planeIndex: 0, format: 'f32' });
				const left = new Float32Array(frames);
				const right = channels === 2 ? new Float32Array(frames) : undefined;
				for (let i = 0; i < frames; i += 1) {
					left[i] = interleaved[i * data.numberOfChannels];
					if (right) right[i] = interleaved[i * data.numberOfChannels + 1];
				}
				data.close();
				push(left, right);
			},
			error: (error) => {
				decodeError = `The audio track could not be decoded (${error.message}).`;
			}
		});

		try {
			state.decoder.configure({ codec, sampleRate, numberOfChannels: channels });
		} catch (error) {
			decodeError = `This browser cannot decode “${codec}” audio. ${error instanceof Error ? error.message : ''}`;
			return;
		}

		mp4.setExtractionOptions(track.id, null, { nbSamples: 500 });
		mp4.start();
	};

	mp4.onSamples = (_id, _user, samples) => {
		if (!state.decoder || decodeError) return;
		for (const sample of samples) {
			const timestamp = Math.round((sample.cts * 1e6) / sample.timescale);
			const duration = Math.round((sample.duration * 1e6) / sample.timescale);
			try {
				state.decoder.decode(
					new EncodedAudioChunk({ type: 'key', timestamp, duration, data: sample.data })
				);
			} catch (error) {
				decodeError = `The audio track could not be decoded (${error instanceof Error ? error.message : 'unknown error'}).`;
				return;
			}
			seen += 1;
			if (expected > 0) ctx.onProgress(Math.min(0.9, (seen / expected) * 0.9));
		}
	};

	mp4.appendBuffer(container);
	mp4.flush();

	if (decodeError) throw new Error(decodeError);
	if (!state.encoder || !state.decoder) {
		throw new Error(
			`“${file.name}” has no audio track that this browser can decode. Try an MP4 or MOV file with AAC or MP3 audio.`
		);
	}
	if (seen === 0) throw new Error(`“${file.name}” contains no audio samples to extract.`);

	await state.decoder.flush();
	if (decodeError) throw new Error(decodeError);

	if (carryLeft.length > 0) encodeBlock(carryLeft, channels === 2 ? carryRight : undefined);
	const tail = state.encoder.flush();
	if (tail.length) chunks.push(Uint8Array.from(tail));

	ctx.onProgress(1);
	return { blob: new Blob(chunks, { type: 'audio/mpeg' }), ext: 'mp3' };
};
