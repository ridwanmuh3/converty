import type { Fidelity } from '#lib/core/types';
import audioConverter from './defs/audio-converter';
import compressImage from './defs/compress-image';
import excelToPdf from './defs/excel-to-pdf';
import heicToJpg from './defs/heic-to-jpg';
import imageConverter from './defs/image-converter';
import imageToPdf from './defs/image-to-pdf';
import jpgToPdf from './defs/jpg-to-pdf';
import mergePdf from './defs/merge-pdf';
import mp3Converter from './defs/mp3-converter';
import mp4ToMp3 from './defs/mp4-to-mp3';
import pdfToJpg from './defs/pdf-to-jpg';
import pdfToWord from './defs/pdf-to-word';
import splitPdf from './defs/split-pdf';
import videoToMp3 from './defs/video-to-mp3';
import wordToPdf from './defs/word-to-pdf';
import { validateManifestInvariants } from './graph';
import type { ToolDef } from './types';

export const TOOLS: ToolDef[] = [
	audioConverter,
	imageConverter,
	compressImage,
	wordToPdf,
	excelToPdf,
	pdfToWord,
	mergePdf,
	splitPdf,
	mp3Converter,
	mp4ToMp3,
	videoToMp3,
	jpgToPdf,
	imageToPdf,
	pdfToJpg,
	heicToJpg
];

// Validate invariants at module load time (catches defects during build, test, and dev)
validateManifestInvariants(TOOLS);

export function getTool(slug: string): ToolDef | undefined {
	return TOOLS.find((tool) => tool.slug === slug);
}

export const FIDELITY_LABEL: Record<Fidelity, string> = {
	good: 'Good',
	fair: 'Fair'
};

export const FIDELITY_BADGE: Record<Fidelity, string> = {
	good: 'badge-success',
	fair: 'badge-info'
};

export * from './types';
export * from './define';
export * from './graph';
