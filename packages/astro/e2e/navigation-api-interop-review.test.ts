import { expect } from '@playwright/test';
import { type DevServer, testFactory, warmupDevServer } from './test-utils.ts';

const test = testFactory(import.meta.url, { root: './fixtures/view-transitions/' });

let devServer: DevServer;

test.beforeAll(async ({ astro, browser }) => {
	devServer = await astro.startDevServer();
	await warmupDevServer(browser, astro.resolveUrl('/one'));
});

test.afterAll(async () => {
	await devServer.stop();
});

test('does not claim same-document entries owned by another Navigation API router', async ({
	page,
	astro,
}) => {
	await page.goto(astro.resolveUrl('/one'));
	const supported = await page.evaluate(
		() =>
			typeof (window as Window & { navigation?: unknown }).navigation === 'object' &&
			typeof (window as Window & { NavigationPrecommitController?: unknown })
				.NavigationPrecommitController === 'function',
	);
	if (!supported) test.skip();

	await page.evaluate(() => {
		const navigation = (window as Window & { navigation: any }).navigation;
		navigation.addEventListener('navigate', (event: any) => {
			const destination = new URL(event.destination.url);
			if (
				destination.pathname === '/one' &&
				(event.info?.externalRouter === true || event.navigationType === 'traverse')
			) {
				event.intercept({ handler: async () => {} });
			}
		});
	});

	await page.evaluate(async () => {
		const navigation = (window as Window & { navigation: any }).navigation;
		await navigation.navigate('/one?external-router=1', {
			info: { externalRouter: true },
		}).finished;
	});
	await expect(page).toHaveURL(/\/one\?external-router=1$/);

	await page.evaluate(() => {
		(window as Window & { astroPreparations?: number }).astroPreparations = 0;
		document.addEventListener('astro:before-preparation', () => {
			(window as Window & { astroPreparations?: number }).astroPreparations!++;
		});
	});

	await page.evaluate(async () => {
		const navigation = (window as Window & { navigation: any }).navigation;
		await navigation.back().finished;
	});
	await expect(page).toHaveURL(/\/one$/);
	expect(
		await page.evaluate(
			() => (window as Window & { astroPreparations?: number }).astroPreparations,
		),
	).toBe(0);
});
