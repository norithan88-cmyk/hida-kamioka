import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT_PATH = fileURLToPath(new URL('./jobs.json', import.meta.url));
const SOURCE = { label: '募集', url: 'https://www.city.hida.gifu.jp/rss/10/list7.xml' };
const KEYWORD = '神岡';

function decodeHtml(text) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ', '#160': ' ' };
  return text
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, name) => {
      const key = name.toLowerCase();
      if (entities[key] !== undefined) return entities[key];
      if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
      if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10));
      return all;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function field(block, tag) {
  const escaped = tag.replace(':', '\\:');
  const match = block.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match ? decodeHtml(match[1]) : '';
}

function parseRss(xml) {
  const items = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = field(block, 'title');
    const url = field(block, 'link');
    const description = field(block, 'description');
    const date = field(block, 'dc:date');
    const subject = field(block, 'dc:subject');
    if (!title) continue;
    if (!url) continue;
    if (!date) continue;
    items.push({
      title,
      type: '募集',
      summary: description,
      url,
      updated_date: date.slice(0, 10),
      organization: subject || '飛騨市',
      source: '飛騨市公式サイト',
    });
  }
  return items;
}

function isKamiokaRelated(item) {
  return item.title.includes(KEYWORD) || item.summary.includes(KEYWORD);
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: { 'user-agent': 'kamioka-navi-jobs-collector/1.0 (+https://kamioka-navi.gifu.email/)' },
  });
  if (!response.ok) throw new Error(`取得失敗: ${response.status} ${source.url}`);
  return parseRss(await response.text());
}

async function main() {
  const collected = await fetchSource(SOURCE);
  const seen = new Set();
  const jobs = collected
    .filter(isKamiokaRelated)
    .sort((a, b) => b.updated_date.localeCompare(a.updated_date))
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, 20);

  const payload = {
    updated_at: new Date().toISOString(),
    source_name: '飛騨市公式サイト 募集RSS（「神岡」を含むもののみ）',
    job_count: jobs.length,
    jobs,
  };
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`${jobs.length}件の神岡関連募集情報を更新しました。`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
