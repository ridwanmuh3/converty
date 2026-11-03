import { LIMITS, OUTPUT } from '#lib/core/limits';
import type { Converter } from '#lib/core/types';
import { encodeMp3InWorker } from '#lib/workers/mp3-encode';

/** A 25 MB MP3 can decode into hundreds of MB of PCM; cap both duration and memory. */
const MAX_AUDIO_SECONDS = LIMITS.maxAudioSeconds;
const MAX_DECODED_BYTES = LIMITS.maxDecodedAudioBytes;

/**
 * Reads the source sample rate so decoding does not silently resample. Only the
 * formats this tool accepts are parsed; anything else decodes at 48 kHz, which
 * is what a typical audio device would have used anyway.
 */
function detectSampleRate(bytes: Uint8Array): number | null {
	try {
		// RIFF/WAVE: walk chunks until `fmt `.
		if (
			bytes[0] === 0x52 &&
			bytes[1] === 0x49 &&
			bytes[2] === 0x46 &&
			bytes[3] === 0x46
		) {
			const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			let offset = 12;
			while (offset + 16 <= bytes.length) {
				const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
				const size = view.getUint32(offset + 4, true);
				if (id === 'fmt ') return view.getUint32(offset + 12, true);
				offset += 8 + size + (size % 2);
			}
			return null;
		}

		// MPEG audio: skip ID3v2, then read the first frame header.
		let start = 0;
		if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
			start = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
		}
		const table: Array<Array<number | null>> = [
			[11025, 12000, 8000],
			[null, null, null],
			[22050, 24000, 16000],
			[44100, 48000, 32000]
		];
		const limit = Math.min(bytes.length - 4, start + 65_536);
		for (let index = Math.max(0, start); index < limit; index += 1) {
			if (bytes[index] !== 0xff || (bytes[index + 1] & 0xe0) !== 0xe0) continue;
			const version = (bytes[index + 1] >> 3) & 0x03;
			const rate = table[version]?.[(bytes[index + 2] >> 2) & 0x03];
			if (rate) return rate;
		}
		return null;
	} catch {
		return null;
	}
}

function pcm(samples: Float32Array): Int16Array {
	const output = new Int16Array(samples.length);
	for (let i = 0; i < samples.length; i++) {
		const value = Math.max(-1, Math.min(1, samples[i]));
		output[i] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
	}
	return output;
}

/**
 * 32 peak amplitudes for the result preview. Sampling block maxima is O(n) and
 * runs on data that is already decoded, so it costs nothing extra.
 */
function peaks(buffer: AudioBuffer, count = 32): number[] {
	const channel = buffer.getChannelData(0);
	const block = Math.max(1, Math.floor(channel.length / count));
	const values: number[] = [];
	let overall = 0;
	for (let index = 0; index < count; index += 1) {
		const start = index * block;
		const end = Math.min(channel.length, start + block);
		let peak = 0;
		for (let i = start; i < end; i += 1) {
			const value = Math.abs(channel[i]);
			if (value > peak) peak = value;
		}
		values.push(peak);
		if (peak > overall) overall = peak;
	}
	return values.map((value) => (overall > 0 ? Math.round((value / overall) * 100) / 100 : 0));
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

/**
 * Last-resort encoder for browsers where the worker cannot start or fails.
 * Kept small: the worker path is the one that always runs in practice.
 */
async function encodeMp3Locally(
	decoded: AudioBuffer,
	onProgress: (fraction: number) => void
): Promise<Blob> {
	const { Mp3Encoder } = await import('@breezystack/lamejs');
	const channels = decoded.numberOfChannels;
	const encoder = new Mp3Encoder(channels, decoded.sampleRate, OUTPUT.mp3BitrateKbps);
	const left = decoded.getChannelData(0);
	const right = channels === 2 ? decoded.getChannelData(1) : undefined;
	const chunks: BlobPart[] = [];
	for (let offset = 0; offset < decoded.length; offset += 1152) {
		const l = pcm(left.subarray(offset, offset + 1152));
		const encoded = encoder.encodeBuffer(l, right && pcm(right.subarray(offset, offset + 1152)));
		if (encoded.length) chunks.push(Uint8Array.from(encoded));
		if (offset % (1152 * 8) === 0) {
			onProgress(offset / decoded.length);
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}
	const tail = encoder.flush();
	if (tail.length) chunks.push(Uint8Array.from(tail));
	return new Blob(chunks, { type: 'audio/mpeg' });
}

export const convertAudio: Converter = async (file, ctx) => {
	const format = ctx.options.format ?? 'mp3';
	if (format !== 'mp3' && format !== 'wav') throw new Error('Choose MP3 or WAV as the output format.');
	if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');

	const sourceBytes = await file.arrayBuffer();
	// OfflineAudioContext decodes without opening an audio device. `new AudioContext()`
	// costs a 200 ms+ main-thread stall on some machines just to initialise output.
	const sampleRate = detectSampleRate(new Uint8Array(sourceBytes)) ?? 48_000;
	const context = new OfflineAudioContext(2, 1, sampleRate);
	try {
		let decoded: AudioBuffer;
		try {
			decoded = await context.decodeAudioData(sourceBytes);
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
		ctx.onPhase?.('Analysing audio');
		const meta = {
			durationSeconds: decoded.duration,
			waveform: peaks(decoded)
		};
		if (format === 'wav') {
			ctx.onPhase?.('Writing WAV');
			const blob = wav(decoded);
			ctx.onProgress(1);
			return { blob, ext: 'wav', meta };
		}
		ctx.onPhase?.('Encoding MP3');
		// The encoder (and its module parse) runs in a worker. The decoded PCM is
		// transferred, not copied, so memory stays flat.
		const channelData = Array.from({ length: decoded.numberOfChannels }, (_, index) =>
			decoded.getChannelData(index)
		);
		const encoded = await encodeMp3InWorker(
			channelData,
			decoded.sampleRate,
			(fraction) => ctx.onProgress(0.2 + fraction * 0.7),
			ctx.signal
		);
		if (encoded) {
			ctx.onProgress(1);
			return { blob: encoded, ext: 'mp3', meta };
		}

		// Worker unavailable (or it failed): decode again and encode in this tab.
		const retry = await context.decodeAudioData(await file.arrayBuffer());
		const blob = await encodeMp3Locally(retry, (fraction) => ctx.onProgress(0.2 + fraction * 0.75));
		ctx.onProgress(1);
		return { blob, ext: 'mp3', meta };
	} finally {
		// OfflineAudioContext has nothing to release; the buffer is garbage-collected.
	}
};
