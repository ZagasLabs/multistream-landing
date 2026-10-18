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
          const sparkContainer = doc.querySelector('.brand__sparks');
          const sparks = [...doc.querySelectorAll('.brand__spark')];
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
              filter: style.filter,
            };
          });

          const liveStyle = live ? view.getComputedStyle(live) : null;
          const bodyStyle = view.getComputedStyle(doc.body);
          const brandGlowStyle = brand ? view.getComputedStyle(brand, '::after') : null;
          const platformGlowStyle = platformLinks
            ? view.getComputedStyle(platformLinks, '::before')
            : null;
          let sparkTrajectory = null;
          let sparkOrigins = [];

          if (live) {
            const liveRect = live.getBoundingClientRect();
            sparkOrigins = sparks.map((spark) => {
              const animation = spark.getAnimations()[0];

              if (animation) {
                animation.pause();
                animation.currentTime = 0;
              }

              const originRect = spark.getBoundingClientRect();
              return {
                xRatio: (originRect.left + originRect.width / 2 - liveRect.left) / liveRect.width,
                yRatio: (originRect.top + originRect.height / 2 - liveRect.top) / liveRect.height,
              };
            });
          }

          if (sparks[0] && live) {
            const animation = sparks[0].getAnimations()[0];

            if (animation) {
              const duration = Number(animation.effect.getTiming().duration);
              animation.pause();
              animation.currentTime = duration * 0.08;
              const earlyY = new DOMMatrix(view.getComputedStyle(sparks[0]).transform).m42;
              animation.currentTime = duration * 0.098;
              const lateY = new DOMMatrix(view.getComputedStyle(sparks[0]).transform).m42;
              sparkTrajectory = { earlyY, lateY };
            }
          }

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
            ambientLight: {
              brandBackground: brandGlowStyle?.backgroundImage ?? 'none',
              brandOpacity: brandGlowStyle?.opacity ?? '1',
              platformBackground: platformGlowStyle?.backgroundImage ?? 'none',
              platformOpacity: platformGlowStyle?.opacity ?? '1',
            },
            sparks: {
              ariaHidden: sparkContainer?.getAttribute('aria-hidden') ?? null,
              origin: sparkOrigins[0] ?? null,
              origins: sparkOrigins,
              trajectory: sparkTrajectory,
              items: sparks.map((spark) => {
                const style = view.getComputedStyle(spark);
                return {
                  animationName: style.animationName,
                  animationDuration: style.animationDuration,
                  animationDelay: style.animationDelay,
                  width: style.width,
                  height: style.height,
                };
              }),
            },
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

export async function capturePixelSamples(points, { width = 1440, height = 900 } = {}) {
  const scratch = await mkdtemp(join(tmpdir(), 'zagas-pixel-test-'));
  const profile = join(scratch, 'profile');
  const screenshotPath = join(scratch, 'page.png');
  const samplerPath = join(scratch, 'sample-pixels.ps1');
  const siteUrl = pathToFileURL(resolve('index.html')).href;
  const powershell = `
    param([string]$ImagePath, [string]$PointsBase64)
    Add-Type -AssemblyName System.Drawing
    $bitmap = [System.Drawing.Bitmap]::FromFile($ImagePath)
    $pointsJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($PointsBase64))
    $points = ConvertFrom-Json $pointsJson
    $samples = foreach ($point in $points) {
      $color = $bitmap.GetPixel([int]$point.x, [int]$point.y)
      [pscustomobject]@{ name = $point.name; r = $color.R; g = $color.G; b = $color.B }
    }
    $bitmap.Dispose()
    ConvertTo-Json @($samples) -Compress
  `;

  try {
    await writeFile(samplerPath, powershell, 'utf8');
    await execFileAsync(
      browserPath(),
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        `--user-data-dir=${profile}`,
        `--window-size=${width},${height}`,
        '--virtual-time-budget=770',
        `--screenshot=${screenshotPath}`,
        siteUrl,
      ],
      { encoding: 'utf8', timeout: 15_000, windowsHide: true },
    );

    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        samplerPath,
        '-ImagePath',
        screenshotPath,
        '-PointsBase64',
        Buffer.from(JSON.stringify(points), 'utf8').toString('base64'),
      ],
      { encoding: 'utf8', timeout: 15_000, windowsHide: true },
    );

    return JSON.parse(stdout);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
