import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function browserPath() {
  const browser = browserCandidates.find(existsSync);

  if (!browser) {
    throw new Error('No Chromium browser is available for integration tests.');
  }

  return browser;
}

function decodeResult(markup) {
  const match = markup.match(/data-result="([^"]+)"/);

  if (!match) {
    throw new Error('The browser probe did not return a result.');
  }

  return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
}

export async function probePage({ width = 1440, height = 900, reducedMotion = false } = {}) {
  const scratch = await mkdtemp(join(tmpdir(), 'zagas-browser-test-'));
  const profile = join(scratch, 'profile');
  const siteUrl = pathToFileURL(resolve('index.html')).href;
  const probePath = join(scratch, 'probe.html');
  const probeUrl = pathToFileURL(probePath).href;

  const probeMarkup = `<!doctype html>
<html>
  <head>
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      iframe { display: block; width: ${width}px; height: ${height}px; border: 0; }
    </style>
  </head>
  <body>
    <iframe id="site" src="${siteUrl}"></iframe>
    <script>
      const frame = document.querySelector('#site');

      function publish(value) {
        const bytes = new TextEncoder().encode(JSON.stringify(value));
        document.documentElement.dataset.result = btoa(String.fromCharCode(...bytes));
      }

      frame.addEventListener('load', () => {
        try {
          const doc = frame.contentDocument;
          const view = frame.contentWindow;
          const brand = doc.querySelector('.brand');
          const live = doc.querySelector('.brand__live');
          const platformLinks = doc.querySelector('.platform-links');
          const stylesheet = doc.querySelector('link[rel="stylesheet"]');
          const anchors = [...doc.querySelectorAll('a')];

          anchors[0]?.focus();

          const linkDetails = anchors.map((link) => {
            const style = view.getComputedStyle(link);
            const rect = link.getBoundingClientRect();

            return {
              href: link.href,
              text: link.textContent.replace(/\\s+/g, ' ').trim(),
              rect: {
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              },
              backgroundColor: style.backgroundColor,
              borderColor: style.borderTopColor,
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
              transitionDuration: style.transitionDuration,
            };
          });

          const liveStyle = live ? view.getComputedStyle(live) : null;
          const bodyStyle = view.getComputedStyle(doc.body);

          publish({
            mainCount: doc.querySelectorAll('main').length,
            brandText: brand?.textContent.replace(/\\s+/g, ' ').trim() ?? '',
            liveText: doc.querySelector('.brand__live')?.textContent.trim() ?? '',
            links: linkDetails,
            decorations: [...doc.querySelectorAll('[data-decoration]')].map((node) => ({
              ariaHidden: node.getAttribute('aria-hidden'),
            })),
            stylesheet: stylesheet?.getAttribute('href') ?? null,
            viewport: {
              width: view.innerWidth,
              height: view.innerHeight,
              documentWidth: doc.documentElement.scrollWidth,
            },
            overflowX: bodyStyle.overflowX,
            gridTemplateColumns: platformLinks
              ? view.getComputedStyle(platformLinks).gridTemplateColumns
              : null,
            live: liveStyle
              ? {
                  animationName: liveStyle.animationName,
                  color: liveStyle.color,
                  textShadow: liveStyle.textShadow,
                }
              : null,
          });
        } catch (error) {
          publish({ error: error.message });
        }
      });

      setTimeout(() => {
        if (!document.documentElement.dataset.result) {
          publish({ error: 'Timed out while loading the site.' });
        }
      }, 1000);
    </script>
  </body>
</html>`;

  await writeFile(probePath, probeMarkup, 'utf8');

  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--allow-file-access-from-files',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--virtual-time-budget=1800',
    '--dump-dom',
  ];

  if (reducedMotion) {
    args.push('--force-prefers-reduced-motion=reduce');
  }

  args.push(probeUrl);

  try {
    const { stdout } = await execFileAsync(browserPath(), args, {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      timeout: 15_000,
      windowsHide: true,
    });

    return decodeResult(stdout);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
