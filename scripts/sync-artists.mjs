// Обновляет локальный каталог и автономный JS-файл из первоисточника.
// npm run sync — обязательное обновление; npm run build — попытка обновления при деплое.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = resolve(root, 'data', 'artists.json');
const jsPath = resolve(root, 'artists-data.js');
const url = 'https://raw.githubusercontent.com/sologle/zvuka-v-ukho-artists/main/data/artists.json';
const optional = process.argv.includes('--optional');

function validate(data) {
  if (!data || !['popular', 'cis', 'world'].every(key => Array.isArray(data[key]) && data[key].length > 0 && data[key].every(n => typeof n === 'string'))) {
    throw new Error('Неожиданный формат каталога');
  }
  return data;
}

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const artists = validate(await response.json());
  await mkdir(resolve(root, 'data'), { recursive: true });
  await writeFile(jsonPath, JSON.stringify(artists, null, 2) + '\n');
  await writeFile(jsPath, `// Автономный список исполнителей из открытого каталога «Звука в ухо».\nwindow.ARTISTS_DATA = ${JSON.stringify(artists)};\n`);
  console.log(`Каталог обновлён: ${new Set([...artists.cis, ...artists.world]).size} уникальных имён`);
} catch (error) {
  try {
    const artists = validate(JSON.parse(await readFile(jsonPath, 'utf8')));
    await writeFile(jsPath, `// Автономный список исполнителей из открытого каталога «Звука в ухо».\nwindow.ARTISTS_DATA = ${JSON.stringify(artists)};\n`);
    console.warn(`Обновление не удалось (${error.message}). Использована локальная копия: ${new Set([...artists.cis, ...artists.world]).size} имён.`);
  } catch (innerError) {
    console.error('Нет рабочей локальной копии каталога:', innerError.message);
    process.exitCode = 1;
  }
}
