// 番組用の穏やかな伴奏。既存の録音・楽曲を使用せず、同じ譜面から毎回合成する。
import { writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export async function createMusic(path) {
  const rate = 24000;
  const seconds = 32;
  const samples = new Float64Array(rate * seconds);
  const chords = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]];
  function note(midi, start, duration, gain) {
    const hz = 440 * 2 ** ((midi - 69) / 12);
    for (let i = 0; i < duration * rate; i++) {
      const t = i / rate;
      const envelope = Math.min(1, t / 0.12) * Math.min(1, (duration - t) / 0.7) * Math.exp(-t / 2.8);
      const tone = Math.sin(2 * Math.PI * hz * t) + 0.16 * Math.sin(4 * Math.PI * hz * t);
      samples[(Math.round(start * rate) + i) % samples.length] += gain * envelope * tone;
    }
  }
  chords.forEach((chord, bar) => {
    chord.forEach(midi => note(midi, bar * 8, 8, 0.07));
    [0, 2, 1, 3].forEach((index, beat) => note(chord[index] + 12, bar * 8 + beat * 2, 3.2, 0.055));
  });
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((value, i) => wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2));
  await writeFile(path, wav);
}

export async function mixBackground(voice, temp) {
  if (process.env.RADIO_BGM === 'off') return voice;
  const input = join(temp, 'voice.mp3');
  const music = join(temp, 'music.wav');
  const output = join(temp, 'mixed.mp3');
  await writeFile(input, voice);
  await createMusic(music);
  const probe = spawnSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', input], { encoding: 'utf8' });
  const duration = Number(probe.stdout);
  if (probe.error || probe.status !== 0 || !Number.isFinite(duration) || duration <= 0) throw new Error('BGM用の音声時間を取得できません');
  // 声を-18 LUFS、伴奏を-40 LUFSに調整。伴奏は冒頭と末尾をフェード。
  const filters = `[0:a]loudnorm=I=-18:TP=-2:LRA=11,aresample=24000[voice];[1:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,loudnorm=I=-40:TP=-9:LRA=7,aresample=24000,afade=t=in:d=3,afade=t=out:st=${Math.max(0, duration - 4)}:d=4[bgm];[voice][bgm]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.891:level=false:latency=true[out]`;
  const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-stream_loop', '-1', '-i', music, '-filter_complex', filters, '-map', '[out]', '-t', String(duration), '-codec:a', 'libmp3lame', '-b:a', '128k', '-ac', '1', '-ar', '24000', output], { timeout: 180000 });
  if (result.error || result.status !== 0) throw new Error('BGMのミックスに失敗しました');
  console.log(`小音量BGMを追加: ${Math.round(duration)}秒、声より22 LU小さい伴奏`);
  return readFile(output);
}
