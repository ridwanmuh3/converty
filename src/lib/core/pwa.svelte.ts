import { asset } from '$app/paths';

/**
 * Small PWA surface shared by the UI and the queue: install availability,
 * offline state, and the "an update is waiting" flag. Everything here is
 * browser-only and degrades to no-ops when service workers are unavailable.
 */

interface InstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const pwa = $state({
	canInstall: false,
	converted: false,
	dismissed: false,
	offline: false,
	updateReady: false
});

let deferredPrompt: InstallPromptEvent | null = null;
let reloadRequested = false;
let started = false;

/** Called after a conversion succeeds — install is only offered once the app has proven useful. */
export function noteConversion(): void {
	pwa.converted = true;
}

export async function requestInstall(): Promise<void> {
	if (!deferredPrompt) return;
	const prompt = deferredPrompt;
	deferredPrompt = null;
	pwa.canInstall = false;
	await prompt.prompt();
	const choice = await prompt.userChoice;
	if (choice.outcome === 'accepted') pwa.converted = false;
}

export function dismissInstall(): void {
	pwa.dismissed = true;
}

export function applyUpdate(): void {
	reloadRequested = true;
	void navigator.serviceWorker
		?.getRegistration()
		.then((registration) => registration?.waiting?.postMessage({ type: 'SKIP_WAITING' }));
}

export function startPwa(): () => void {
	if (typeof window === 'undefined' || started) return () => {};
	started = true;
	pwa.offline = !navigator.onLine;

	const onOnline = () => {
		pwa.offline = false;
	};
	const onOffline = () => {
		pwa.offline = true;
	};
	const onInstallPrompt = (event: Event) => {
		event.preventDefault();
		deferredPrompt = event as InstallPromptEvent;
		pwa.canInstall = true;
	};
	const onInstalled = () => {
		deferredPrompt = null;
		pwa.canInstall = false;
	};
	const onControllerChange = () => {
		// Only reload when the user asked for the waiting update, not on first install.
		if (reloadRequested) location.reload();
	};
	const watch = (registration: ServiceWorkerRegistration) => {
		const check = () => {
			if (registration.waiting && navigator.serviceWorker.controller) pwa.updateReady = true;
		};
		check();
		registration.addEventListener('updatefound', () => {
			registration.installing?.addEventListener('statechange', check);
		});
	};

	window.addEventListener('online', onOnline);
	window.addEventListener('offline', onOffline);
	window.addEventListener('beforeinstallprompt', onInstallPrompt);
	window.addEventListener('appinstalled', onInstalled);
	navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);

	// SvelteKit 3 does not register a worker for us, so do it here. A failure is
	// fine: the app works online exactly as before, just without offline support.
	// The template is only filled in by the build, so skip it during `dev`.
	if (!import.meta.env.DEV) {
		const swUrl = asset('service-worker.js');
		// The worker lives at the base path, so its own directory is the scope.
		const scope = new URL(swUrl, location.href).pathname.replace(/service-worker\.js$/, '');
		void navigator.serviceWorker
			?.register(swUrl, { scope })
			.then(watch)
			.catch(() => {});
	}

	return () => {
		window.removeEventListener('online', onOnline);
		window.removeEventListener('offline', onOffline);
		window.removeEventListener('beforeinstallprompt', onInstallPrompt);
		window.removeEventListener('appinstalled', onInstalled);
		navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
		started = false;
	};
}
