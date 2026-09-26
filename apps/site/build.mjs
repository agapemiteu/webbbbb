import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const site = resolve(import.meta.dirname);
const demo = resolve(site, '../demo');
const output = resolve(site, 'dist');

await mkdir(resolve(output, 'demo'), { recursive: true });

for (const file of ['index.html', 'style.css', 'privacy.html']) {
  await cp(resolve(site, file), resolve(output, file));
}

for (const file of ['index.html', 'style.css', 'app.js', 'tutorial.html', 'tutorial.css', 'tutorial.js', 'form.html', 'form.css', 'form.js', 'teams.html', 'teams.css', 'teams.js']) {
  await cp(resolve(demo, file), resolve(output, 'demo', file));
}

console.log(`Static site ready: ${output}`);
