import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT_TEXT_PATH = process.argv[2] || join(HERE, 'daily-script.txt');

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function todayLabel() {
  return new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Tokyo' }).format(new Date());
}

function makeHoroscope() {
  const zodiacSigns = ['おひつじ座', 'おうし座', 'ふたご座', 'かに座', 'しし座', 'おとめ座', 'てんびん座', 'さそり座', 'いて座', 'やぎ座', 'みずがめ座', 'うお座'];
  const fortuneTips = ['身近な人へのひと言が幸運を運びます', '焦らず丁寧に進めると良い日です', '新しい情報に小さな発見があります', 'いつもの道を少し変えると気分転換になります', '温かい飲み物でひと息つきましょう', '笑顔のあいさつが運気を明るくします'];
  const seedText = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date());
  let seed = 0;
  for (let i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
  const ranked = zodiacSigns.slice();
  for (let i = ranked.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const tmp = ranked[i];
    ranked[i] = ranked[j];
    ranked[j] = tmp;
  }
  const lines = [];
  lines.push('最後に、お楽しみの今日の十二星座占いです。');
  lines.push(`第1位は${ranked[0]}。${fortuneTips[seed % fortuneTips.length]}。`);
  lines.push(`第2位は${ranked[1]}。落ち着いた行動が吉です。`);
  lines.push(`第3位は${ranked[2]}。小さな親切が良い流れを呼びます。`);
  return lines;
}

async function main() {
  const events = await loadJson(join(ROOT, 'automation', 'events', 'events.json'), { events: [] });
  const news = await loadJson(join(ROOT, 'automation', 'news', 'news.json'), { news: [] });
  const jobs = await loadJson(join(ROOT, 'automation', 'jobs', 'jobs.json'), { jobs: [] });
  const ownerMessage = await loadJson(join(HERE, 'owner-message.json'), null);

  const segments = [];
  segments.push(`こんにちは。神岡ナビAIアナウンサーのみおんです。${todayLabel()}の地域ラジオを始めます。`);

  const ownerText = (ownerMessage && typeof ownerMessage.message === 'string') ? ownerMessage.message.trim() : '';
  if (ownerText) {
    segments.push('ここで、神岡ナビ運営者からひとことです。');
    segments.push(ownerText);
  }

  segments.push('はじめに、防災情報です。最新の警報・注意報は、神岡ナビのトップページと気象庁の公式発表をご確認ください。');

  segments.push('続いて、神岡の天気です。最新の予報は、神岡ナビのトップページでご確認ください。');

  const eventTitles = (events.events || []).slice(0, 3).map((e) => e.title).filter(Boolean);
  if (eventTitles.length > 0) {
    segments.push('続いて、イベント情報です。');
    eventTitles.forEach((title, i) => segments.push(`${i + 1}つ目は、${title}です。`));
    segments.push('詳しい日時は、神岡ナビのイベント欄でご確認ください。');
  }

  const newsTitles = (news.news || []).slice(0, 3).map((n) => n.title).filter(Boolean);
  if (newsTitles.length > 0) {
    segments.push('続いて、地域ニュースです。');
    newsTitles.forEach((title) => segments.push(`${title}。`));
  }

  const jobTitles = (jobs.jobs || []).slice(0, 2).map((j) => j.title).filter(Boolean);
  if (jobTitles.length > 0) {
    segments.push('続いて、求人と募集の情報です。');
    jobTitles.forEach((title) => segments.push(`${title}。`));
    segments.push('応募条件と締め切りは、リンク先の公式情報をご確認ください。');
  }

  segments.push(...makeHoroscope());
  segments.push('以上、今日の神岡ナビ地域ラジオでした。今日も気をつけて、よい、いちにちをお過ごしください。');

  const text = segments.join('\n');
  await writeFile(OUT_TEXT_PATH, `${text}\n`, 'utf8');
  console.log(`台本を書き出しました: ${OUT_TEXT_PATH} (${segments.length}セグメント)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

