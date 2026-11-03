import { Mp3Encoder } from '@breezystack/lamejs';
import { OUTPUT } from '#lib/core/limits';

/**
 * MP3 encoding only. Decoding stays on the main thread because AudioContext is
 * not available in workers; the expensive part (a large synchronous encoder plus
 * its module parse) is what moves off the UI thread here.
 */
interface EncodeRequest {
	type: 'encode-mp3';
	id: number;
	sampleRate: number;
	channels: Float32Array[];
}

interface EncodeResponseDone {
	type: 'done';
	id: number;
	bytes: ArrayBuffer;
}

interface EncodeResponseProgress {
	type: 'progress';
	id: number;
	value: number;
}

interface EncodeResponseError {
	type: 'error';
	id: number;
	message: string;
}

const scope = self as unknown as {
	onmessage: ((event: MessageEvent<EncodeRequest>) => void) | null;
	postMessage: (message: EncodeResponseDone | EncodeResponseProgress | EncodeResponseError, transfer?: Transferable[]) => void;
};

function pcm(samples: Float32Array): Int16Array {
	const output = new Int16Array(samples.length);
	for (let i = 0; i < samples.length; i += 1) {
		const value = Math.max(-1, Math.min(1, samples[i]));
		output[i] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
	}
	return output;
}

scope.onmessage = async (event) => {
	const request = event.data;
	if (!request || request.type !== 'encode-mp3') return;

	const { id, sampleRate } = request;
	const channels = request.channels;
	try {
		const encoder = new Mp3Encoder(channels.length, sampleRate, OUTPUT.mp3BitrateKbps);
		const left = channels[0];
		const right = channels[1];
		const chunks: Uint8Array[] = [];
		let total = 0;

		for (let offset = 0; offset < left.length; offset += 1152) {
			const l = pcm(left.subarray(offset, offset + 1152));
			const encoded = encoder.encodeBuffer(l, right ? pcm(right.subarray(offset, offset + 1152)) : undefined);
			if (encoded.length) {
				const chunk = Uint8Array.from(encoded);
				chunks.push(chunk);
				total += chunk.length;
			}
			// Yield every 8 frames so progress messages flush.
			if (offset % (1152 * 8) === 0) {
				scope.postMessage({ type: 'progress', id, value: offset / left.length });
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		const tail = encoder.flush();
		if (tail.length) {
			const chunk = Uint8Array.from(tail);
			chunks.push(chunk);
			total += chunk.length;
		}

		const bytes = new Uint8Array(total);
		let cursor = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, cursor);
			cursor += chunk.length;
		}
		scope.postMessage({ type: 'done', id, bytes: bytes.buffer as ArrayBuffer }, [bytes.buffer as ArrayBuffer]);
	} catch (error) {
		scope.postMessage({
			type: 'error',
			id,
			message: error instanceof Error ? error.message : 'The MP3 encoder failed in this browser.'
		});
	}
};
