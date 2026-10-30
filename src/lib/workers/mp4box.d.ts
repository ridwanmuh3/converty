declare module 'mp4box' {
	export interface MP4AudioTrack {
		id: number;
		codec: string;
		audio: { sample_rate: number; channel_count: number };
		nb_samples: number;
	}

	export interface MP4Info {
		duration: number;
		timescale: number;
		audioTracks: MP4AudioTrack[];
	}

	export interface MP4Sample {
		data: Uint8Array;
		cts: number;
		duration: number;
		timescale: number;
	}

	export interface MP4File {
		onReady?: (info: MP4Info) => void;
		onSamples?: (id: number, user: unknown, samples: MP4Sample[]) => void;
		onError?: (error: string) => void;
		appendBuffer(buffer: ArrayBuffer & { fileStart: number }): number;
		flush(): void;
		start(): void;
		stop(): void;
		setExtractionOptions(id: number, user: unknown, options: { nbSamples: number }): void;
	}

	export function createFile(): MP4File;
}
