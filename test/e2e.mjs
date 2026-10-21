import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { startServer } from './serve.mjs';

const BASE = 'http://localhost:4173';
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
	return text;
}

const server = await startServer(4173);
const browser = await chromium.launch({
	executablePath: CHROME,
	args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });

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

/* ---------- 2. Word to PDF ---------- */
{
	const file = await convert('word-to-pdf', join(FIXTURES, 'letter.docx'), '1 file');
	check('word→pdf: yields a PDF', (await signature(file, 5)) === '%PDF-', file);
	const text = await pdfText(file);
	check('word→pdf: keeps heading text', text.includes('Project update'));
	check('word→pdf: keeps table cells', text.includes('Design') && text.includes('Done'));
	check('word→pdf: has more than one page marker', /\d+ \/ \d+/.test(text), text.slice(-40));
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
}

/* ---------- 5. PDF to Excel ---------- */
{
	const file = await convert('pdf-to-excel', join(FIXTURES, 'report.pdf'), '1 file');
	const workbook = XLSX.read(await readFile(file), { type: 'buffer' });
	const sheet = workbook.Sheets[workbook.SheetNames[0]];
	const cells = Object.values(sheet)
		.filter((cell) => cell && typeof cell === 'object' && 'v' in cell)
		.map((cell) => String(cell.v));
	check('pdf→excel: creates worksheets', workbook.SheetNames.length >= 1, workbook.SheetNames.join(','));
	check('pdf→excel: places header in cells', cells.includes('Region'), cells.slice(0, 8).join('|'));
	check('pdf→excel: places numbers in cells', cells.includes('North') && cells.includes('1200'));
}

/* ---------- 6. Batch of 3 + ZIP ---------- */
{
	await page.goto(`${BASE}/image-converter`, { waitUntil: 'networkidle' });
	const batch = [1, 2, 3].map((n) => join(FIXTURES, 'pixel.png'));
	await addFiles(batch);
	await page.waitForSelector('text=/3 \\/ 10/');

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

/* ---------- 7. Eleven files are rejected at the cap ---------- */
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
	const counter = await page.locator('text=/\\d+ \\/ 10/').first().innerText();
	check('limit: never exceeds 10 files', counter.trim() === '10 / 10', counter);
	check(
		'limit: explains the cap',
		(await page.locator('.alert').first().innerText()).toLowerCase().includes('only 10 files')
	);
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
	check('scan: no download offered', (await page.locator('text=Download').count()) === 0);
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
