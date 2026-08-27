import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT_PATH = fileURLToPath(new URL('./events.json', import.meta.url));
const SOURCE = { label: 'イベント', url: 'https://www.city.hida.gifu.jp/rss/10/list5.xml' };
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

function toDateOnly(isoLike) {
  if (!isoLike) return '';
  const match = isoLike.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function parseRss(xml) {
  const items = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = field(block, 'title');
    const url = field(block, 'link');
    const description = field(block, 'description');
    const date = field(block, 'dc:date');
    const eventStart = field(block, 'nc:event_sdate');
    const eventEnd = field(block, 'nc:event_edate');
    if (!title) continue;
    if (!url) continue;
    items.push({
      title,
      url,
      summary: description,
      start_date: toDateOnly(eventStart) || toDateOnly(date),
      end_date: toDateOnly(eventEnd) || toDateOnly(eventStart) || toDateOnly(date),
      category: '飛騨市公式',
      source: '飛騨市公式サイト',
      published_at: date,
    });
  }
  return items;
}

function isKamiokaRelated(item) {
  return item.title.includes(KEYWORD) || item.summary.includes(KEYWORD);
}

function isNotPast(item) {
  if (!item.end_date) return true;
  const today = new Date().toISOString().slice(0, 10);
  return item.end_date >= today;
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: { 'user-agent': 'kamioka-navi-events-collector/1.0 (+https://kamioka-navi.gifu.email/)' },
  });
  if (!response.ok) throw new Error(`取得失敗: ${response.status} ${source.url}`);
  return parseRss(await response.text());
}

async function main() {
  const collected = await fetchSource(SOURCE);
  const seen = new Set();
  const events = collected
    .filter(isKamiokaRelated)
    .filter(isNotPast)
    .sort((a, b) => (a.start_date || '9999').localeCompare(b.start_date || '9999'))
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, 30);

  if (events.length === 0) throw new Error('神岡関連のイベントを1件も取得できなかったため、既存データを保持します。');

  const payload = {
    updated_at: new Date().toISOString(),
    source_name: '飛騨市公式サイト イベントRSS（「神岡」を含むもののみ）',
    source_urls: [SOURCE.url],
    event_count: events.length,
    events,
  };
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`${events.length}件の神岡関連イベントを更新しました。`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
