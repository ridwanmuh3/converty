<script lang="ts">
	import { resolve } from '$app/paths';
	import Footer from '#lib/components/Footer.svelte';
	import FidelityBadge from '#lib/components/FidelityBadge.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Nav from '#lib/components/Nav.svelte';
	import type { IconName } from '#lib/components/icon-names';
	import { LIMITS } from '#lib/core/limits';
	import { SITE_ORIGIN } from '#lib/core/site';
	import { TOOLS, type ToolCategory, type ToolDef } from '#lib/tools/registry';

	const groups: { id: ToolCategory; label: string; blurb: string; tools: ToolDef[] }[] = [
		{
			id: 'audio',
			label: 'Audio',
			blurb: 'MP3, WAV, MP4 and video audio',
			tools: TOOLS.filter((tool) => tool.category === 'audio')
		},
		{
			id: 'image',
			label: 'Images',
			blurb: 'JPG, PNG, WebP, HEIC and PDF',
			tools: TOOLS.filter((tool) => tool.category === 'image')
		},
		{
			id: 'document',
			label: 'Documents',
			blurb: 'Word, Excel and PDF',
			tools: TOOLS.filter((tool) => tool.category === 'document')
		}
	];

	const steps: { icon: IconName; title: string; body: string }[] = [
		{
			icon: 'spark',
			title: 'Pick a converter',
			body: 'Convert audio, images, Word, Excel, and PDF.'
		},
		{
			icon: 'upload',
			title: 'Add files',
			body: 'Files load straight into this tab. Nothing is sent anywhere.'
		},
		{
			icon: 'download',
			title: 'Convert and download',
			body: 'Each file on its own, or the whole batch in one ZIP.'
		}
	];

	const privacyPoints: { icon: IconName; title: string; body: string }[] = [
		{
			icon: 'shield',
			title: 'No upload, by construction',
			body: 'There is no server endpoint that accepts a file. The conversion runs on your own CPU.'
		},
		{
			icon: 'lock',
			title: 'No account, no email',
			body: 'Open the page and convert. Nothing is stored, because nothing is collected.'
		},
		{
			icon: 'spark',
			title: 'Conversion runs in this tab',
			body: 'Files are processed in your browser. Keep the tab open until conversion finishes.'
		},
		{
			icon: 'file',
			title: 'Why there are size caps',
			body: `Each file is capped at ${LIMITS.maxFileBytes / 1024 / 1024} MB and each batch at ${LIMITS.maxTotalBytes / 1024 / 1024} MB of input. These caps keep the tab inside its memory budget on your device; they are not a server quota. A bigger file may work on a stronger machine, but is refused here rather than crashing the tab.`
		}
	];

	/** Canonical and og:url share one value: the base-prefixed site root. */
	const canonicalUrl = (() => {
		const root = resolve('/');
		return `${SITE_ORIGIN}${root.endsWith('/') ? root : `${root}/`}`;
	})();

	const faqs: { q: string; a: string }[] = [
		{
			q: 'Are my files uploaded?',
			a: 'No. This site is a set of static files. When you pick a file, the browser reads it locally and the conversion happens in the tab. Open DevTools → Network while converting: the only requests are for the page’s own scripts and fonts.'
		},
		{
			q: 'Why isn’t PDF → Word perfect?',
			a: 'PDF text is placed at coordinates, not stored as editable paragraphs. Conversion rebuilds paragraphs and some aligned tables; reading order, images and fonts can differ.'
		},
		{
			q: 'Can it convert scanned PDFs?',
			a: 'Not yet. A scan is an image with no text layer, so there is nothing to extract without OCR. The tool detects this and tells you instead of producing an empty document.'
		},
		{
			q: 'Is it actually free?',
			a: 'Yes. No account, no watermark, no “upgrade to download”. There are no ads and no trackers on the converter pages either.'
		},
		{
			q: 'What about .doc and .xls files?',
			a: 'Only the modern formats are supported. Open the file in Word or Excel and use Save As to create a .docx or .xlsx, then drop that in.'
		},
		{
			q: 'How many files can I convert together?',
			a: `There is no file-count cap. Each file is capped at ${LIMITS.maxFileBytes / 1024 / 1024} MB and each batch at ${LIMITS.maxTotalBytes / 1024 / 1024} MB of input. Those numbers are client-side caps that keep the tab within browser memory, not a server quota, so they apply the same on every device. Files are converted one at a time, and decoded data can need several times the input size.`
		}
	];
</script>

<svelte:head>
	<title>Converty — convert audio, PDF, Word, Excel and images in your browser</title>
	<meta
		name="description"
		content="Convert MP3, WAV, MPEG audio, PDF, Word, Excel and images in your browser. No uploads, no account, nothing to install."
	/>
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Converty" />
	<meta property="og:title" content="Converty — convert audio, PDF, Word, Excel and images in your browser" />
	<meta
		property="og:description"
		content="Convert MP3, WAV, MPEG audio, PDF, Word, Excel and images in your browser. No uploads, no account, nothing to install."
	/>
	<meta property="og:url" content={canonicalUrl} />
	<meta name="twitter:card" content="summary" />
</svelte:head>

<Nav />

<main id="main">
	<section class="hero-glow border-b border-line">
		<div class="mx-auto max-w-[1200px] px-5 pb-14 pt-14 md:px-6 md:pb-20 md:pt-20 lg:px-8">
			<div class="max-w-[760px]">
				<span class="badge badge-neutral">
					<span class="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true"></span>
					100% in your browser
				</span>

				<h1 class="t-display-xl mt-5 text-ink">Convert files without uploading them.</h1>

				<p class="t-body-lg mt-4 max-w-[580px] text-body">
					Convert audio, PDF, Word, Excel and images in this tab. Files are not uploaded for conversion.
				</p>

				<div class="mt-8 flex flex-wrap gap-3">
					<a href="#tools" class="btn btn-primary">
						Choose a converter
						<Icon name="arrow-right" size={18} />
					</a>
					<a href="#how" class="btn btn-secondary">See how it works</a>
				</div>

				<ul class="t-body-sm mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-body">
					<li class="flex items-center gap-1.5">
						<Icon name="check" size={16} /> Files processed one at a time
					</li>
					<li class="flex items-center gap-1.5">
						<Icon name="check" size={16} /> No account, no watermark
					</li>
				</ul>
			</div>
		</div>
	</section>

	<section id="tools" class="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-16 md:px-6 md:py-24 lg:px-8">
		<div class="max-w-[620px]">
			<h2 class="t-display-lg text-ink">Pick a converter</h2>
			<p class="t-body-lg mt-2 text-body">
				Each tool lists supported formats and known limits before conversion.
			</p>
		</div>

		<div class="mt-8 space-y-10">
			{#each groups as group}
				{#if group.tools.length > 0}
					<section aria-labelledby="group-{group.id}">
						<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
							<h3 id="group-{group.id}" class="t-heading-md text-ink">{group.label}</h3>
							<p class="t-body-sm text-mute">{group.blurb}</p>
						</div>

						<ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{#each group.tools as tool}
								<li>
									<a
										href={`${resolve('/')}${tool.slug}`}
										class="card flex h-full flex-col gap-4 p-6 transition hover:border-line-strong hover:shadow-[var(--shadow-2)]"
									>
										<div class="flex items-start justify-between gap-3">
											<span
												class="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-bone text-ink"
											>
												<Icon name={tool.icon} size={21} />
											</span>
											<FidelityBadge fidelity={tool.fidelity} />
										</div>

										<div>
											<h3 class="t-heading-md text-ink">{tool.name}</h3>
											<p class="t-body-md mt-1 text-body">{tool.tagline}</p>
										</div>

										<span class="t-body-sm mt-auto inline-flex items-center gap-1 font-semibold text-ink">
											Open tool
											<Icon name="arrow-right" size={16} />
										</span>
									</a>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/each}
		</div>
	</section>

	<section id="how" class="scroll-mt-20 border-y border-line bg-bone">
		<div class="mx-auto max-w-[1200px] px-5 py-16 md:px-6 md:py-24 lg:px-8">
			<h2 class="t-display-lg text-ink">Three steps, no sign-up</h2>
			<p class="t-body-lg mt-2 max-w-[560px] text-body">
				The page does the work. Your files stay where they are.
			</p>

			<ol class="mt-8 grid gap-4 md:grid-cols-3">
				{#each steps as step, index}
					<li class="card p-6">
						<div class="flex items-center gap-3">
							<span
								class="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-bone text-ink"
							>
								<Icon name={step.icon} size={20} />
							</span>
							<span class="t-caption tabular text-mute">STEP {index + 1}</span>
						</div>
						<h3 class="t-subtitle mt-4 text-ink">{step.title}</h3>
						<p class="t-body-md mt-1 text-body">{step.body}</p>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<section id="privacy" class="scroll-mt-20">
		<div class="mx-auto max-w-[1200px] px-5 py-16 md:px-6 md:py-24 lg:px-8">
			<div class="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
				<div>
					<span class="badge badge-neutral">Privacy by architecture</span>
					<h2 class="t-display-lg mt-4 text-ink">Files stay in this tab during conversion.</h2>
					<p class="t-body-lg mt-3 max-w-[480px] text-body">
						Conversion runs in your browser. The page may load its own scripts, but file contents are not sent to a conversion server.
					</p>

					<div class="card mt-6 p-5">
						<p class="t-body-sm font-semibold text-ink">Check it yourself</p>
						<p class="t-body-sm mt-1 text-body">
							Open DevTools → Network, then convert a file. No request carries your document —
							only the page’s own scripts load.
						</p>
					</div>
				</div>

				<ul class="grid gap-3 sm:grid-cols-2">
					{#each privacyPoints as point}
						<li class="card p-5">
							<span
								class="flex h-9 w-9 items-center justify-center rounded-full bg-bone text-ink"
							>
								<Icon name={point.icon} size={18} />
							</span>
							<h3 class="t-subtitle mt-3 text-ink">{point.title}</h3>
							<p class="t-body-sm mt-1 text-body">{point.body}</p>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</section>

	<section id="limits" class="scroll-mt-20 border-y border-line bg-bone">
		<div class="mx-auto max-w-[1200px] px-5 py-16 md:px-6 md:py-24 lg:px-8">
			<div class="max-w-[620px]">
				<h2 class="t-display-lg text-ink">Why these limits exist</h2>
				<p class="t-body-lg mt-2 text-body">
					Conversion runs in this tab, so the caps come from your device’s memory budget, not from a server. Decoded images, audio and output files can need several times their input size, so the ceilings below keep the tab from running out of memory.
				</p>
			</div>

			<div class="mt-8 grid gap-4 sm:grid-cols-2">
				<div class="card p-6">
					<p class="t-display-lg tabular text-ink">{LIMITS.maxFileBytes / 1024 / 1024} MB</p>
					<p class="t-body-md mt-1 text-body">per file</p>
					<p class="t-body-sm mt-2 text-mute">
						{LIMITS.maxTotalBytes / 1024 / 1024} MB of input across one batch. Enforced in the browser, so it applies on every device.
					</p>
				</div>
				<div class="card p-6">
					<p class="t-display-lg tabular text-ink">{LIMITS.maxPdfPages}</p>
					<p class="t-body-md mt-1 text-body">pages per PDF</p>
					<p class="t-body-sm mt-2 text-mute">
						Applies to PDF inputs. Longer files are refused before rendering rather than exhausting memory.
					</p>
				</div>
			</div>
		</div>
	</section>

	<section id="faq" class="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-16 md:px-6 md:py-24 lg:px-8">
		<div class="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
			<div>
				<h2 class="t-display-lg text-ink">Questions people actually ask</h2>
				<p class="t-body-md mt-3 text-body">
					If something is missing, the limitation is probably documented on the tool page itself.
				</p>
			</div>

			<div>
				{#each faqs as faq}
					<details class="disclosure">
						<summary>{faq.q}</summary>
						<div class="disclosure-body">{faq.a}</div>
					</details>
				{/each}
			</div>
		</div>
	</section>
</main>

<Footer />
