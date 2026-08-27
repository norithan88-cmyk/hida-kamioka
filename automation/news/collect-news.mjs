import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT_PATH = fileURLToPath(new URL('./news.json', import.meta.url));
const SOURCE = { label: 'お知らせ', url: 'https://www.city.hida.gifu.jp/rss/10/list1.xml' };
const KEYWORD = '神岡';
const SKIP_TITLES = /^(概要・報告書|メンテナンス情報)$/;

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

function parseRss(xml, source) {
  const items = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = field(block, 'title');
    const url = field(block, 'link');
    const description = field(block, 'description');
    const date = field(block, 'dc:date');
    const category = field(block, 'dc:subject');
    if (!title) continue;
    if (!url) continue;
    if (!date) continue;
    items.push({
      title,
      url,
      summary: description,
      category: category || source.label,
      published_at: date,
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
    headers: { 'user-agent': 'kamioka-navi-news-collector/1.0 (+https://kamioka-navi.gifu.email/)' },
  });
  if (!response.ok) throw new Error(`取得失敗: ${response.status} ${source.url}`);
  return parseRss(await response.text(), source);
}

async function main() {
  const collected = await fetchSource(SOURCE);
  const seen = new Set();
  const news = collected
    .filter(isKamiokaRelated)
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .filter((item) => {
      if (SKIP_TITLES.test(item.title)) return false;
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, 40);

  if (news.length === 0) throw new Error('神岡関連の新着情報を1件も取得できなかったため、既存データを保持します。');

  const payload = {
    updated_at: new Date().toISOString(),
    source_name: '飛騨市公式サイト お知らせRSS（「神岡」を含むもののみ）',
    source_urls: [SOURCE.url],
    news_count: news.length,
    news,
  };
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`${news.length}件の神岡関連ニュースを更新しました。`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
