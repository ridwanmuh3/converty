import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { unzipSync } from 'fflate';
import { startServer } from './serve.mjs';

const paths = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
const BASE = `http://localhost:4173${paths}`;
const FIXTURES = join(process.cwd(), 'test', 'fixtures');
const OUT = join(process.cwd(), 'test', 'out');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/chromium-browser';

await mkdir(OUT, { recursive: true });

const results = [];
const check = (name, condition, detail = '') => {
	results.push({ name, ok: Boolean(condition), detail });
	if (!condition) console.log(`FAIL  ${name} ${detail}`);
	else console.log(`ok    ${name}`);
};

const signature = async (path, length = 12) =>
	(await readFile(path)).subarray(0, length).toString('latin1');

/** Per-item detail: font sizes, positions and the page MediaBox, for fidelity checks. */
async function pdfDetail(path) {
	const loadingTask = getDocument({
		data: new Uint8Array(await readFile(path)),
		standardFontDataUrl: join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/'),
		useSystemFonts: false,
		disableFontFace: true,
		verbosity: 0
	});
	const doc = await loadingTask.promise;
	const pages = [];
	for (let page = 1; page <= doc.numPages; page += 1) {
		const p = await doc.getPage(page);
		const viewport = p.getViewport({ scale: 1 });
		const content = await p.getTextContent();
		const items = content.items
			.filter((item) => 'str' in item && item.str)
			.map((item) => ({
				str: item.str,
				size: item.transform[3] || item.height,
				x: item.transform[4]
			}));
		pages.push({ width: viewport.width, height: viewport.height, items });
		p.cleanup();
	}
	await loadingTask.destroy();
	return pages;
}

async function pdfText(path) {
	const loadingTask = getDocument({
		data: new Uint8Array(await readFile(path)),
		standardFontDataUrl: join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/'),
		useSystemFonts: false,
		disableFontFace: true,
		verbosity: 0
	});
	const doc = await loadingTask.promise;
	let text = '';
	for (let page = 1; page <= doc.numPages; page += 1) {
		const content = await (await doc.getPage(page)).getTextContent();
		text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
	}
	await loadingTask.destroy();
	// PDF text items arrive per token, including whitespace-only runs; collapse them
	// so content assertions are not sensitive to how the writer split a line.
	return text.replace(/\s+/g, ' ').trim();
}

const server = await startServer(4173);
const browser = await chromium.launch({
	executablePath: CHROME,
	args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });

// Count worker construction so the suite can prove conversions left the UI thread.
await context.addInitScript(() => {
	window.__workerCount = 0;
	const Native = window.Worker;
	window.Worker = class extends Native {
		constructor(url, options) {
			super(url, options);
			window.__workerCount += 1;
		}
	};
});

const consoleErrors = [];
const nonGetRequests = [];
const requestsWithBody = [];

const page = await context.newPage();
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
	if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
});
page.on('request', (request) => {
	if (request.method() !== 'GET') nonGetRequests.push(`${request.method()} ${request.url()}`);
	if (request.postData()) requestsWithBody.push(`${request.method()} ${request.url()}`);
});

async function addFiles(files) {
	await page.setInputFiles('input[type=file]', files);
}

async function convert(slug, files, countLabel, optionValues = {}) {
	await page.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle' });
	await page.waitForSelector('h1');
	for (const [key, value] of Object.entries(optionValues)) {
		await page.selectOption(`#option-${key}`, value);
	}
	await addFiles(files);

	const button = page.getByRole('button', { name: new RegExp(`Convert ${countLabel}`) });
	await button.waitFor({ state: 'visible', timeout: 15_000 });
	await page.waitForFunction(
		() => !document.querySelector('button.btn-primary')?.hasAttribute('disabled')
	);
	await button.click();

	// The queue never auto-downloads; the user picks files individually or zips the batch.
	await page.waitForSelector('.alert-success', { timeout: 120_000 });
	const downloadButton = page.locator('button[aria-label^="Download "]').first();
	await downloadButton.waitFor({ state: 'visible', timeout: 30_000 });

	const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
	await downloadButton.click();
	const download = await downloadPromise;
	const target = join(OUT, `${slug}-${download.suggestedFilename()}`);
	await download.saveAs(target);
	return target;
}

/* ---------- 1. Image ---------- */
/* ---------- Audio: WAV, MP3 and MPEG audio ---------- */
{
	const mp3 = await convert('audio-converter', join(FIXTURES, 'tone.wav'), '1 file');
	const bytes = await readFile(mp3);
	check('audio: WAV to MP3 has MPEG audio frames', mp3.endsWith('.mp3') && (bytes[0] === 0xff || bytes.toString('ascii', 0, 3) === 'ID3'));
	const mpeg = join(OUT, 'tone.mpeg');
	await copyFile(mp3, mpeg);
	const wav = await convert('audio-converter', mpeg, '1 file', { format: 'wav' });
	const head = await readFile(wav);
	check('audio: MPEG audio to WAV has PCM header', wav.endsWith('.wav') && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE' && head.readUInt16LE(20) === 1);
	const again = await convert('audio-converter', mp3, '1 file', { format: 'wav' });
	check('audio: MP3 input decodes', (await signature(again, 4)) === 'RIFF');
}

/* ---------- Mobile file actions ---------- */
{
	await page.setViewportSize({ width: 320, height: 800 });
	await page.goto(`${BASE}/audio-converter`, { waitUntil: 'networkidle' });
	await addFiles(join(FIXTURES, 'tone.wav'));
	check('mobile: queued file does not overflow', await page.evaluate(() => document.documentElement.scrollWidth === innerWidth));
	await page.getByRole('button', { name: /Convert 1 file/ }).click();
	await page.locator('.alert-success').waitFor();
	check('mobile: download label stays visible', await page.getByRole('button', { name: 'Download tone.mp3' }).getByText('Download').isVisible());
	check('mobile: completed batch hides empty Convert action', await page.locator('button.btn-primary').count() === 0);
	check('mobile: audio picker omits PDF limit', !(await page.locator('.dropzone').innerText()).includes('PDFs up to'));
	await page.setViewportSize({ width: 1280, height: 900 });
}

/* ---------- 1. Image ---------- */
{
	const file = await convert('image-converter', join(FIXTURES, 'pixel.png'), '1 file');
	check('image: yields a PNG', (await signature(file, 8)).includes('PNG'), file);
	check('image: filename keeps .png', file.endsWith('.png'), file);

	const largest = await page.evaluate(() =>
		Math.max(...performance.getEntriesByType('resource').map((entry) => entry.encodedBodySize))
	);
	check('perf: image tool never downloads the PDF engine', largest < 200_000, `${largest} bytes`);
}

/* ---------- 1b. Image format → format ---------- */
{
	const jpeg = await convert('image-converter', join(FIXTURES, 'pixel.png'), '1 file', {
		format: 'jpeg'
	});
	check('image: outputs JPEG', (await signature(jpeg, 3)) === '\xFF\xD8\xFF', jpeg);
	check('image: JPEG filename', jpeg.endsWith('.jpg'), jpeg);

	const webp = await convert('image-converter', join(FIXTURES, 'pixel.png'), '1 file', {
		format: 'webp'
	});
	const webpHead = await signature(webp, 12);
	check('image: outputs WebP', webpHead.startsWith('RIFF') && webpHead.endsWith('WEBP'), webp);
	check('image: WebP filename', webp.endsWith('.webp'), webp);
}

/* ---------- 2. Word to PDF: layout fidelity against the DOCX itself ---------- */
{
	const file = await convert('word-to-pdf', join(FIXTURES, 'letter.docx'), '1 file');
	check('word→pdf: yields a PDF', (await signature(file, 5)) === '%PDF-', file);
	const text = await pdfText(file);
	const pages = await pdfDetail(file);

	check('word→pdf: keeps heading text', text.includes('Project update'));
	check('word→pdf: keeps table cells', text.includes('Design') && text.includes('Done'));

	// Geometry comes from the document's own sectPr (A4: 595.28 × 841.89 pt).
	check(
		'word→pdf: page size matches the document sectPr',
		Math.abs(pages[0].width - 595.28) < 1 && Math.abs(pages[0].height - 841.89) < 1,
		`${pages[0].width} × ${pages[0].height} pt`
	);

	// Left margin = 1440 twips = 72 pt; the heading must start there.
	const heading = pages[0].items.find((item) => item.str.includes('Project update'));
	check(
		'word→pdf: text starts at the document margin (72pt)',
		heading && Math.abs(heading.x - 72) <= 4,
		`x=${heading?.x}`
	);

	// Heading run is 16pt in the fixture; body runs are 11pt.
	const body = pages[0].items.find((item) => item.str.includes('paragraph with'));
	check(
		'word→pdf: heading font larger than body font',
		heading && body && heading.size > body.size + 2,
		`heading=${heading?.size}pt body=${body?.size}pt`
	);

	// Document header (right-aligned italic) and footer PAGE/NUMPAGES fields.
	check('word→pdf: renders the document header', text.includes('Confidential draft'));
	check('word→pdf: renders footer PAGE field', /Page \d+ of \d+/.test(text), text.slice(-60));
	check(
		'word→pdf: no injected page markers the document did not ask for',
		!/\d+\s*\/\s*\d+/.test(text),
		text.slice(-60)
	);
}

/* ---------- 3. Excel to PDF ---------- */
{
	const file = await convert('excel-to-pdf', join(FIXTURES, 'data.xlsx'), '1 file');
	check('excel→pdf: yields a PDF', (await signature(file, 5)) === '%PDF-', file);
	const text = await pdfText(file);
	check('excel→pdf: keeps sheet name', text.includes('Sales'));
	check('excel→pdf: keeps values', text.includes('Notebook') && text.includes('1260'));
}

/* ---------- 4. PDF to Word ---------- */
{
	const file = await convert('pdf-to-word', join(FIXTURES, 'report.pdf'), '1 file');
	const zip = unzipSync(new Uint8Array(await readFile(file)));
	const xml = zip['word/document.xml'] ? new TextDecoder().decode(zip['word/document.xml']) : '';
	check('pdf→word: valid docx zip', Object.keys(zip).includes('word/document.xml'), file);
	check('pdf→word: keeps first-page text', xml.includes('Quarterly'));
	check('pdf→word: keeps second-page text', xml.includes('Second') && xml.includes('page'));
	check('pdf→word: table is editable cells', /<w:tbl[ >]/.test(xml) && /<w:tc[ >][\s\S]*?North[\s\S]*?<\/w:tc>/.test(xml));
	check('pdf→word: keeps PDF page size', (xml.match(/<w:pgSz w:w="11906" w:h="16838"/g) ?? []).length === 2);
	check('pdf→word: keeps heading sizes', /<w:sz w:val="36"\/>[\s\S]*?Quarterly report/.test(xml) && /<w:sz w:val="28"\/>[\s\S]*?Method notes/.test(xml));
	check('pdf→word: keeps page break', (xml.match(/<w:sectPr/g) ?? []).length === 2);
}

/* ---------- 5. Image ↔ PDF and worker execution ---------- */
{
	const file = await convert('jpg-to-pdf', join(FIXTURES, 'photo.jpg'), '1 file');
	check('jpg→pdf: yields a PDF', (await signature(file, 5)) === '%PDF-', file);
	const workers = await page.evaluate(() => window.__workerCount ?? 0);
	check('perf: image conversion ran in a worker', workers > 0, `${workers} worker(s)`);
}

{
	const file = await convert('image-to-pdf', join(FIXTURES, 'pixel.png'), '1 file');
	check('image→pdf: yields a PDF', (await signature(file, 5)) === '%PDF-', file);
}

{
	const file = await convert('pdf-to-jpg', join(FIXTURES, 'report.pdf'), '1 file');
	check('pdf→jpg: multi-page output is a ZIP', file.endsWith('.zip'), file);
	const entries = unzipSync(new Uint8Array(await readFile(file)));
	const pages = Object.keys(entries).filter((name) => name.endsWith('.jpg')).sort();
	check('pdf→jpg: one JPG per page', pages.length === 2, pages.join(','));
	check(
		'pdf→jpg: valid JPEG bytes',
		pages.length > 0 && entries[pages[0]][0] === 0xff && entries[pages[0]][1] === 0xd8,
		pages[0]
	);
}

/* ---------- 5b. Audio routes ---------- */
{
	const file = await convert('mp3-converter', join(FIXTURES, 'tone.wav'), '1 file');
	check('mp3-converter: yields an MP3', file.endsWith('.mp3'), file);
}

{
	if (existsSync(join(FIXTURES, 'clip.mp4'))) {
		const file = await convert('mp4-to-mp3', join(FIXTURES, 'clip.mp4'), '1 file');
		const bytes = await readFile(file);
		check(
			'mp4→mp3: yields MPEG audio frames',
			file.endsWith('.mp3') && (bytes[0] === 0xff || bytes.toString('ascii', 0, 3) === 'ID3'),
			file
		);
	} else {
		console.log('skip  mp4→mp3: clip.mp4 fixture is missing (needs ffmpeg)');
	}
}

/* ---------- 6. Batch of 3 + ZIP ---------- */
{
	await page.goto(`${BASE}/image-converter`, { waitUntil: 'networkidle' });
	const batch = [1, 2, 3].map((n) => join(FIXTURES, 'pixel.png'));
	await addFiles(batch);
	await page.waitForSelector('text=3 files');

	await page.getByRole('button', { name: /Convert 3 files/ }).click();
	await page.getByRole('button', { name: 'Download all (3)' }).waitFor({ timeout: 120_000 });
	const zipPromise = page.waitForEvent('download', { timeout: 30_000 });
	await page.getByRole('button', { name: 'Download all (3)' }).click();
	const zipDownload = await zipPromise;
	const zipPath = join(OUT, 'batch.zip');
	await zipDownload.saveAs(zipPath);

	const entries = Object.keys(unzipSync(new Uint8Array(await readFile(zipPath))));
	check('batch: three results in the ZIP', entries.length === 3, entries.join(','));
	check('batch: no duplicate names', new Set(entries).size === 3, entries.join(','));
	check('batch: success summary shown', await page.locator('.alert-success').isVisible());
}

/* ---------- 7. Small files are not subject to an arbitrary count cap ---------- */
{
	await page.goto(`${BASE}/image-converter`, { waitUntil: 'networkidle' });
	const eleven = [];
	for (let index = 0; index < 11; index += 1) {
		const copy = join(OUT, `copy-${index}.png`);
		await copyFile(join(FIXTURES, 'pixel.png'), copy);
		eleven.push(copy);
	}
	await addFiles(eleven);
	await page.waitForTimeout(800);
	check('batch: accepts 11 small files', await page.locator('li:has(.badge-neutral)').count() >= 11);
}

/* ---------- 8. Wrong file type is explained ---------- */
{
	await page.goto(`${BASE}/image-converter`, { waitUntil: 'networkidle' });
	await addFiles(join(FIXTURES, 'report.pdf'));
	await page.waitForSelector('.alert', { timeout: 10_000 });
	const notice = await page.locator('.alert').first().innerText();
	check('validation: rejects a PDF in the image tool', notice.includes('.pdf') || notice.includes('PDF'), notice);
}

/* ---------- 9. Scanned PDF is refused, not silently emptied ---------- */
{
	await page.goto(`${BASE}/pdf-to-word`, { waitUntil: 'networkidle' });
	await addFiles(join(FIXTURES, 'scan.pdf'));
	await page.waitForFunction(
		() => !document.querySelector('button.btn-primary')?.hasAttribute('disabled')
	);
	await page.getByRole('button', { name: /Convert 1 file/ }).click();
	await page.waitForSelector('.badge-danger', { timeout: 30_000 });
	const message = await page.locator('text=/scan|text layer/i').first().innerText();
	check('scan: explains the missing text layer', /scan|text layer/i.test(message), message);
	check('scan: no download offered', (await page.locator('button[aria-label^="Download "]').count()) === 0);
}

/* ---------- 10. Theme toggle + dark mode parity ---------- */
{
	await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
	const before = await page.evaluate(() => document.documentElement.dataset.theme);
	await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click();
	const after = await page.evaluate(() => document.documentElement.dataset.theme);
	check('theme: toggles', before !== after, `${before} → ${after}`);
}

/* ---------- 11. Privacy: no request ever carries a file ---------- */
{
	check('privacy: no non-GET requests', nonGetRequests.length === 0, nonGetRequests.join(', '));
	check('privacy: no request body anywhere', requestsWithBody.length === 0, requestsWithBody.join(', '));
	const thirdParty = await page.evaluate(() =>
		performance
			.getEntriesByType('resource')
			.map((entry) => entry.name)
			.filter((name) => !name.startsWith(location.origin))
	);
	check('privacy: no third-party resources', thirdParty.length === 0, thirdParty.join(', '));
}

check('console: no uncaught errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
	console.log('failures:', failed.map((result) => result.name).join(', '));
	process.exitCode = 1;
}
