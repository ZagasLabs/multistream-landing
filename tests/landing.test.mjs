import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import { capturePixelSamples, probePage } from './browser-page.mjs';

function maximumShadowAlpha(filter) {
  const alphaValues = [...filter.matchAll(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/g)].map(
    ([, alpha]) => Number.parseFloat(alpha),
  );

  return Math.max(...alphaValues);
}

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

test('bleeds subtle platform and Live color into the background', () => {
  const light = page.ambientLight;
  const [twitch, kick] = page.links;

  assert.notEqual(light.brandBackground, 'none');
  assert.notEqual(light.platformBackground, 'none');
  assert.ok(Number.parseFloat(light.brandOpacity) >= 0.5);
  assert.ok(Number.parseFloat(light.brandOpacity) <= 0.65);
  assert.match(twitch.filter, /145, 71, 255/);
  assert.match(kick.filter, /83, 252, 24/);
  assert.ok(maximumShadowAlpha(twitch.filter) >= 0.08);
  assert.ok(maximumShadowAlpha(twitch.filter) <= 0.15);
  assert.ok(maximumShadowAlpha(kick.filter) >= 0.08);
  assert.ok(maximumShadowAlpha(kick.filter) <= 0.15);
});

test('keeps platform color as faint ambient light with only a slight local bleed', async () => {
  const [twitch, kick] = page.links;
  const samples = await capturePixelSamples([
    {
      name: 'purple-ambient',
      x: 1120,
      y: 300,
    },
    {
      name: 'green-ambient',
      x: 320,
      y: 700,
    },
    {
      name: 'twitch-local',
      x: Math.round((twitch.rect.left + twitch.rect.right) / 2),
      y: Math.round(twitch.rect.bottom + 8),
    },
    {
      name: 'kick-local',
      x: Math.round((kick.rect.left + kick.rect.right) / 2),
      y: Math.round(kick.rect.bottom + 8),
    },
  ]);
  const purpleAmbient = samples.find(({ name }) => name === 'purple-ambient');
  const greenAmbient = samples.find(({ name }) => name === 'green-ambient');
  const twitchLocal = samples.find(({ name }) => name === 'twitch-local');
  const kickLocal = samples.find(({ name }) => name === 'kick-local');
  const purpleAmbientDominance = purpleAmbient.b - Math.max(purpleAmbient.r, purpleAmbient.g);
  const greenAmbientDominance = greenAmbient.g - Math.max(greenAmbient.r, greenAmbient.b);
  const twitchLocalDominance = twitchLocal.b - Math.max(twitchLocal.r, twitchLocal.g);
  const kickLocalDominance = kickLocal.g - Math.max(kickLocal.r, kickLocal.b);

  assert.ok(purpleAmbientDominance >= 4 && purpleAmbientDominance <= 12);
  assert.ok(greenAmbientDominance >= 4 && greenAmbientDominance <= 12);
  assert.ok(twitchLocalDominance >= 2 && twitchLocalDominance <= 8);
  assert.ok(kickLocalDominance >= 2 && kickLocalDominance <= 8);
});

test('emits occasional decorative sparks from the broken neon', () => {
  assert.equal(page.sparks.ariaHidden, 'true');
  assert.ok(page.sparks.items.length >= 3);
  assert.ok(page.sparks.items.every(({ animationName }) => animationName !== 'none'));
  assert.ok(
    page.sparks.items.every(({ animationDuration }) => Number.parseFloat(animationDuration) >= 6),
  );
});

test('pulls sparks downward after their initial upward impulse', () => {
  assert.ok(page.sparks.trajectory.earlyY < 0);
  assert.ok(page.sparks.trajectory.lateY > 0);
  assert.ok(page.sparks.trajectory.lateY > page.sparks.trajectory.earlyY);
});

test('restores the distributed Live spark emission points', () => {
  const xRatios = page.sparks.origins.map(({ xRatio }) => xRatio);
  const yRatios = page.sparks.origins.map(({ yRatio }) => yRatio);

  assert.ok(Math.min(...xRatios) < 0.7);
  assert.ok(Math.max(...xRatios) > 0.95);
  assert.ok(Math.min(...yRatios) < 0.25);
  assert.ok(Math.max(...yRatios) > 0.8);
});

test('varies spark silhouettes and emission timing', () => {
  const silhouettes = new Set(page.sparks.items.map(({ width, height }) => `${width}x${height}`));
  const delays = new Set(page.sparks.items.map(({ animationDelay }) => animationDelay));

  assert.ok(silhouettes.size >= 3);
  assert.ok(delays.size >= 3);
  assert.ok(
    page.sparks.items.some(({ width, height }) => Number.parseFloat(height) > Number.parseFloat(width)),
  );
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
  assert.ok(reduced.sparks.items.every(({ animationName }) => animationName === 'none'));
});
