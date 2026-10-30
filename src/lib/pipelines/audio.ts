import { LIMITS, OUTPUT } from '#lib/core/limits';
import type { Converter } from '#lib/core/types';

/** A 25 MB MP3 can decode into hundreds of MB of PCM; cap both duration and memory. */
const MAX_AUDIO_SECONDS = LIMITS.maxAudioSeconds;
const MAX_DECODED_BYTES = LIMITS.maxDecodedAudioBytes;

function pcm(samples: Float32Array): Int16Array {
	const output = new Int16Array(samples.length);
	for (let i = 0; i < samples.length; i++) {
		const value = Math.max(-1, Math.min(1, samples[i]));
		output[i] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
	}
	return output;
}

function wav(buffer: AudioBuffer): Blob {
	const channels = Math.min(2, buffer.numberOfChannels);
	const length = buffer.length;
	const bytes = new ArrayBuffer(44 + length * channels * 2);
	const view = new DataView(bytes);
	const write = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
	};
	write(0, 'RIFF');
	view.setUint32(4, bytes.byteLength - 8, true);
	write(8, 'WAVE');
	write(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, buffer.sampleRate, true);
	view.setUint32(28, buffer.sampleRate * channels * 2, true);
	view.setUint16(32, channels * 2, true);
	view.setUint16(34, 16, true);
	write(36, 'data');
	view.setUint32(40, length * channels * 2, true);
	const samples = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
	let offset = 44;
	for (let i = 0; i < length; i++) {
		for (const channel of samples) {
			const value = Math.max(-1, Math.min(1, channel[i]));
			view.setInt16(offset, value < 0 ? Math.round(value * 32768) : Math.round(value * 32767), true);
			offset += 2;
		}
	}
	return new Blob([bytes], { type: 'audio/wav' });
}

export const convertAudio: Converter = async (file, ctx) => {
	const format = ctx.options.format ?? 'mp3';
	if (format !== 'mp3' && format !== 'wav') throw new Error('Choose MP3 or WAV as the output format.');
	if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
	const context = new AudioContext();
	try {
		let decoded: AudioBuffer;
		try {
			decoded = await context.decodeAudioData(await file.arrayBuffer());
		} catch {
			throw new Error(`“${file.name}” could not be decoded by this browser. Try a supported MP3, MPEG audio, or PCM WAV file.`);
		}
		if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
		if (!decoded.length || !decoded.numberOfChannels || decoded.numberOfChannels > 2) {
			throw new Error(`“${file.name}” needs mono or stereo audio with at least one sample.`);
		}

		if (decoded.duration > MAX_AUDIO_SECONDS) {
			throw new Error(
				`“${file.name}” is ${Math.round(decoded.duration / 60)} minutes long. The limit is ${MAX_AUDIO_SECONDS / 60} minutes of audio per file — trim the clip first.`
			);
		}
		const decodedBytes = decoded.length * decoded.numberOfChannels * 2;
		if (decodedBytes > MAX_DECODED_BYTES) {
			throw new Error(
				`“${file.name}” needs ${Math.round(decodedBytes / 1024 / 1024)} MB of memory when decoded. The limit is ${MAX_DECODED_BYTES / 1024 / 1024} MB — choose a shorter clip.`
			);
		}

		ctx.onProgress(0.2);
		if (format === 'wav') {
			const blob = wav(decoded);
			ctx.onProgress(1);
			return { blob, ext: 'wav' };
		}
		const { Mp3Encoder } = await import('@breezystack/lamejs');
		const channels = decoded.numberOfChannels;
		const encoder = new Mp3Encoder(channels, decoded.sampleRate, OUTPUT.mp3BitrateKbps);
		const left = decoded.getChannelData(0);
		const right = channels === 2 ? decoded.getChannelData(1) : undefined;
		const chunks: BlobPart[] = [];
		for (let offset = 0; offset < decoded.length; offset += 1152) {
			if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
			const l = pcm(left.subarray(offset, offset + 1152));
			const encoded = encoder.encodeBuffer(l, right && pcm(right.subarray(offset, offset + 1152)));
			if (encoded.length) chunks.push(Uint8Array.from(encoded));
			if (offset % (1152 * 80) === 0) {
				ctx.onProgress(0.2 + (offset / decoded.length) * 0.75);
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}
		const tail = encoder.flush();
		if (tail.length) chunks.push(Uint8Array.from(tail));
		ctx.onProgress(1);
		return { blob: new Blob(chunks, { type: 'audio/mpeg' }), ext: 'mp3' };
	} finally {
		await context.close();
	}
};
