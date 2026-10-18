import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import { probePage } from './browser-page.mjs';

let page;

before(async () => {
  page = await probePage();
});

test('renders the Zagas Live identity in one main landmark', () => {
  assert.equal(page.error, undefined);
  assert.equal(page.mainCount, 1);
  assert.equal(page.brandText, 'ZAGAS LIVE');
  assert.equal(page.liveText, 'LIVE');
});

test('provides exactly the requested platform destinations', () => {
  assert.equal(page.error, undefined);
  assert.deepEqual(
    page.links.map(({ href, text }) => ({ href, text })),
    [
      { href: 'https://twitch.zagas.id/', text: 'TWITCH' },
      { href: 'https://kick.zagas.id/', text: 'KICK' },
    ],
  );
});

test('keeps decorative fragments out of the accessibility tree', () => {
  assert.equal(page.error, undefined);
  assert.ok(page.decorations.length >= 2);
  assert.ok(page.decorations.every(({ ariaHidden }) => ariaHidden === 'true'));
});

test('loads the site stylesheet', () => {
  assert.equal(page.error, undefined);
  assert.equal(page.stylesheet, 'styles.css');
});

test('gives each platform a distinct high-energy accent', () => {
  const [twitch, kick] = page.links;

  assert.notEqual(twitch.borderColor, 'rgba(0, 0, 0, 0)');
  assert.notEqual(kick.borderColor, 'rgba(0, 0, 0, 0)');
  assert.notEqual(twitch.borderColor, kick.borderColor);
});

test('renders the Live marker as active broken neon', () => {
  assert.notEqual(page.live.textShadow, 'none');
  assert.notEqual(page.live.animationName, 'none');
});

test('shows a visible keyboard focus treatment', () => {
  const [focusedLink] = page.links;

  assert.notEqual(focusedLink.outlineStyle, 'none');
  assert.ok(Number.parseFloat(focusedLink.outlineWidth) >= 2);
});

test('uses a two-column desktop layout without horizontal overflow', () => {
  const [twitch, kick] = page.links;

  assert.ok(kick.rect.left > twitch.rect.right);
  assert.ok(Math.abs(kick.rect.top - twitch.rect.top) <= 2);
  assert.ok(page.viewport.documentWidth <= page.viewport.width);
  assert.equal(page.overflowX, 'hidden');
});

test('stacks touch-friendly links on narrow screens without overflow', async () => {
  const mobile = await probePage({ width: 390, height: 844 });
  const [twitch, kick] = mobile.links;

  assert.ok(kick.rect.top > twitch.rect.bottom);
  assert.ok(twitch.rect.width <= mobile.viewport.width - 32);
  assert.ok(twitch.rect.height >= 64);
  assert.ok(mobile.viewport.documentWidth <= mobile.viewport.width);
});

test('removes motion when reduced motion is requested', async () => {
  const reduced = await probePage({ reducedMotion: true });

  assert.notEqual(page.live.animationName, 'none');
  assert.ok(page.links.every(({ transitionDuration }) => transitionDuration !== '0s'));
  assert.equal(reduced.live.animationName, 'none');
  assert.ok(reduced.links.every(({ transitionDuration }) => transitionDuration === '0s'));
});
