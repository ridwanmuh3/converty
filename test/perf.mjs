import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

process.env.TMPDIR = '/tmp';
const paths = (process.env.BASE_PATH ?? '/converty').replace(/\/+$/, '');
const PORT = 4176;
const BASE = `http://localhost:${PORT}${paths}`;
const FIXTURES = join(process.cwd(), 'test', 'fixtures');
const OUT_FILE = process.env.PERF_BASELINE ?? join(process.cwd(), 'test', 'perf-baseline.json');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/chromium-browser';

const PIPELINES = [
	{ slug: 'audio-converter', fixture: 'tone.wav', options: { format: 'mp3' }, label: 'Audio (WAV→MP3)' },
	{ slug: 'image-converter', fixture: 'photo.jpg', options: { format: 'webp' }, label: 'Image (JPG→WebP)' },
	{ slug: 'word-to-pdf', fixture: 'letter.docx', options: {}, label: 'Word→PDF' },
	{ slug: 'excel-to-pdf', fixture: 'data.xlsx', options: {}, label: 'Excel→PDF' },
	{ slug: 'pdf-to-word', fixture: 'report.pdf', options: {}, label: 'PDF→Word' },
	{ slug: 'jpg-to-pdf', fixture: 'photo.jpg', options: {}, label: 'JPG→PDF' },
	{ slug: 'pdf-to-jpg', fixture: 'report.pdf', options: {}, label: 'PDF→JPG' },
	{ slug: 'mp4-to-mp3', fixture: 'clip.mp4', options: {}, label: 'MP4→MP3' }
];

function percentile(values, p) {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = (p / 100) * (sorted.length - 1);
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	const weight = index - lower;
	return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

const server = await startServer(PORT);
const browser = await chromium.launch({
	executablePath: CHROME,
	args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info']
});

const results = {};
const ITERATIONS = 3;
// `npm run test:perf` compares against the recorded baseline; --update records it.
const UPDATE = process.argv.includes('--update');
const previous = existsSync(OUT_FILE) && !UPDATE ? JSON.parse(await readFile(OUT_FILE, 'utf-8')) : null;
// A baseline older than this format is a flat map of pipelines with no calibration.
const previousPipelines = previous ? (previous.pipelines ?? previous) : null;
const previousCalibration = previous?.calibration_ms ?? null;

/**
 * A fixed CPU workload, timed in the same browser that runs the conversions.
 * Absolute times say nothing about other machines, so the comparison scales the
 * recorded baseline by how much slower or faster this host is than the one that
 * recorded it. The workload is independent of the app, so app changes cannot
 * move it.
 */
async function measureCalibration() {
	const page = await browser.newPage();
	await page.goto('about:blank');
	const median = await page.evaluate(() => {
		const runs = [];
		for (let run = 0; run < 5; run += 1) {
			const start = performance.now();
			let hash = 2166136261;
			// Sized for roughly 200 ms per run, so host jitter cannot swing the
			// factor the way a 25 ms sample did.
			for (let i = 0; i < 64_000_000; i += 1) {
				hash ^= i;
				hash = Math.imul(hash, 16777619);
			}
			let x = 0.25;
			for (let i = 0; i < 6_400_000; i += 1) x = Math.sqrt(x + 1) * 1.000001;
			runs.push(performance.now() - start);
			// Keep both results observable so neither loop can be optimised away.
			if (hash === 42 && x < 0) runs.pop();
		}
		runs.sort((a, b) => a - b);
		return Math.round(runs[Math.floor(runs.length / 2)]);
	});
	await page.close();
	return median;
}

try {
	const calibration = await measureCalibration();
	const override = Number(process.env.PERF_HARDWARE_FACTOR);
	const rawFactor =
		Number.isFinite(override) && override > 0
			? override
			: previousCalibration
				? calibration / previousCalibration
				: 1;
	// A wildly different factor means the machine changed shape (fewer cores,
	// emulation); clamp it so the gate stays meaningful instead of unbounded.
	const factor = Math.min(4, Math.max(0.33, rawFactor));
	// Scaling only ever widens the budget: a faster host still gets the plain 20%
	// band, while a slower one gets the same converted into its own speed.
	const budgetFactor = Math.max(1, factor);
	const allowance = 1 + 0.2 * budgetFactor;
	const longTaskLimit = Math.min(400, Math.round(200 * budgetFactor));

	if (previousCalibration) {
		console.log(
			`Machine calibration: ${calibration} ms (baseline ${previousCalibration} ms, ×${factor.toFixed(2)} vs reference)`
		);
	} else if (previous) {
		console.log(
			`Machine calibration: ${calibration} ms (baseline has no calibration, assuming this is the reference machine)`
		);
	} else {
		console.log(`Machine calibration: ${calibration} ms (no baseline yet, recording one)`);
	}

	console.log(`Running performance harness (${ITERATIONS} iterations per pipeline)...\n`);

	for (const { slug, fixture, options, label } of PIPELINES) {
		const fixturePath = join(FIXTURES, fixture);
		if (!existsSync(fixturePath)) {
			console.warn(`Skipping ${slug}: fixture ${fixture} not found.`);
			continue;
		}

		const wallClockRuns = [];
		const longTaskMaxRuns = [];
		const longTaskCountRuns = [];
		const peakMemoryRuns = [];

		for (let i = 0; i < ITERATIONS; i++) {
			const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
			const page = await context.newPage();

			await page.addInitScript(() => {
				window.__longTasks = [];
				try {
					const observer = new PerformanceObserver((list) => {
						for (const entry of list.getEntries()) {
							window.__longTasks.push({
								duration: entry.duration,
								startTime: entry.startTime
							});
						}
					});
					observer.observe({ entryTypes: ['longtask'] });
				} catch {}
			});

			await page.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle' });
			await page.waitForSelector('h1');

			for (const [key, value] of Object.entries(options)) {
				await page.selectOption(`#option-${key}`, value);
			}

			await page.setInputFiles('input[type=file]', fixturePath);

			const button = page.getByRole('button', { name: /Convert 1 file/ });
			await button.waitFor({ state: 'visible', timeout: 15_000 });
			await page.waitForFunction(
				() => !document.querySelector('button.btn-primary')?.hasAttribute('disabled')
			);

			// A fresh profile pays service-worker install and the first worker
			// bundle fetch on its first conversion. Warm that once, then measure a
			// reload so the numbers describe conversion cost rather than cold start.
			await button.click();
			await page.waitForSelector('.alert-success', { timeout: 120_000 });
			await page.reload({ waitUntil: 'networkidle' });
			await page.waitForSelector('h1');
			await page.setInputFiles('input[type=file]', fixturePath);
			await button.waitFor({ state: 'visible', timeout: 15_000 });
			await page.waitForFunction(
				() => !document.querySelector('button.btn-primary')?.hasAttribute('disabled')
			);

			// Measure conversion execution
			const startWallClock = Date.now();
			await button.click();
			await page.waitForSelector('.alert-success', { timeout: 120_000 });
			const elapsed = Date.now() - startWallClock;
			wallClockRuns.push(elapsed);

			// Extract performance metrics
			const metrics = await page.evaluate(() => {
				const tasks = window.__longTasks || [];
				const maxLongTask = tasks.length > 0 ? Math.max(...tasks.map((t) => t.duration)) : 0;
				const longTasksOver50 = tasks.filter((t) => t.duration >= 50).length;
				const longTasksOver200 = tasks.filter((t) => t.duration >= 200).length;
				const mem = performance.memory ? performance.memory.usedJSHeapSize : 0;
				return {
					maxLongTask: Math.round(maxLongTask),
					longTasksOver50,
					longTasksOver200,
					heapBytes: mem
				};
			});

			longTaskMaxRuns.push(metrics.maxLongTask);
			longTaskCountRuns.push(metrics.longTasksOver50);
			if (metrics.heapBytes > 0) {
				peakMemoryRuns.push(Math.round(metrics.heapBytes / (1024 * 1024)));
			}

			await context.close();
		}

		const p50 = percentile(wallClockRuns, 50);
		const p95 = percentile(wallClockRuns, 95);
		const maxLongTask = Math.max(...longTaskMaxRuns);
		const maxHeapMb = peakMemoryRuns.length > 0 ? Math.max(...peakMemoryRuns) : null;

		results[slug] = {
			label,
			fixture,
			p50_ms: p50,
			p95_ms: p95,
			max_long_task_ms: maxLongTask,
			long_tasks_count_p50: percentile(longTaskCountRuns, 50),
			peak_memory_mb: maxHeapMb
		};

		console.log(
			`  ${label.padEnd(20)} | wall p50: ${String(p50).padStart(5)}ms | wall p95: ${String(p95).padStart(5)}ms | max long task: ${String(maxLongTask).padStart(4)}ms | peak heap: ${maxHeapMb ? `${maxHeapMb} MB` : 'n/a'}`
		);
	}

	// Acceptance gates: the median wall clock may not exceed the recorded median
	// by more than 20% once the baseline is scaled to this machine's measured
	// speed, and no main-thread task may exceed 200 ms (scaled the same way, so a
	// slower runner is not punished for the same code). p95 is reported but not
	// gated: over three samples it is just the slowest run, which one host stall
	// moves arbitrarily.
	const regressions = [];
	for (const [slug, row] of Object.entries(results)) {
		if (row.max_long_task_ms > longTaskLimit) {
			regressions.push(
				`${slug}: main-thread task ${row.max_long_task_ms} ms > ${longTaskLimit} ms limit`
			);
		}
		const before = previousPipelines?.[slug];
		if (!before?.p50_ms) continue;
		const limit = Math.round(before.p50_ms * allowance);
		if (row.p50_ms > limit) {
			regressions.push(
				`${slug}: p50_ms regressed ${Math.round(((row.p50_ms - before.p50_ms) / before.p50_ms) * 100)}% (${before.p50_ms} → ${row.p50_ms} ms, limit ${limit} ms at ×${factor.toFixed(2)} hardware)`
			);
		}
	}

	if (UPDATE || !previous) {
		await writeFile(
			OUT_FILE,
			JSON.stringify({ calibration_ms: calibration, pipelines: results }, null, 2),
			'utf-8'
		);
		console.log(`\nBaseline recorded to ${OUT_FILE}`);
	} else {
		console.log(`\nCompared against ${OUT_FILE} (allowance ${Math.round((allowance - 1) * 100)}% over baseline at ×${factor.toFixed(2)} hardware)`);
	}

	if (regressions.length > 0) {
		console.error('\nPerformance gate failed:');
		for (const line of regressions) console.error(`  - ${line}`);
		process.exitCode = 1;
	} else {
		console.log(
			'Performance gate passed (median within the hardware-scaled 20% allowance, no main-thread task over the scaled 200 ms limit; p95 reported above).'
		);
	}
} finally {
	await browser.close();
	await new Promise((resolve) => server.close(resolve));
}
