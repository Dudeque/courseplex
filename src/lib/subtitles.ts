export interface SubtitleCue {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

/**
 * Zero-dependency in-memory SRT to WebVTT converter.
 * HTML5 <video> <track> requires WebVTT format.
 */
export async function createVttBlobUrlFromSrtFile(file: File): Promise<string> {
  const rawText = await file.text();
  return createVttBlobUrlFromSrtText(rawText);
}

export function convertSrtTextToVtt(rawText: string): string {
  const trimmed = rawText.trim();
  if (trimmed.startsWith('WEBVTT')) {
    return trimmed;
  }

  // Convert SRT comma millisecond syntax (00:01:23,456) to WebVTT period syntax (00:01:23.456)
  const normalized = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

  return `WEBVTT - Converted by CoursePlex\n\n${normalized.trim()}\n`;
}

export function createVttBlobUrlFromSrtText(rawText: string): string {
  const vttContent = convertSrtTextToVtt(rawText);
  const blob = new Blob([vttContent], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}

function parseTimecode(tc: string): number {
  const clean = tc.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return 0;
}

/**
 * Parses WebVTT or SRT text into clean, deduplicated SubtitleCue items for the live Transcript & AI Tutor.
 */
export function parseSubtitleCues(rawText: string): SubtitleCue[] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0 || lines[0].startsWith('WEBVTT') || lines[0].startsWith('NOTE')) {
      continue;
    }

    const arrowIdx = lines.findIndex((l) => l.includes('-->'));
    if (arrowIdx === -1) continue;

    const timeLine = lines[arrowIdx];
    const [startRaw, endRawWithSettings] = timeLine.split('-->');
    if (!startRaw || !endRawWithSettings) continue;

    const endRaw = endRawWithSettings.trim().split(/\s+/)[0];
    const startSeconds = parseTimecode(startRaw);
    const endSeconds = parseTimecode(endRaw);

    const textLines = lines
      .slice(arrowIdx + 1)
      .map((l) => l.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);

    const text = textLines.join(' ').trim();
    if (!text) continue;

    // Deduplicate rolling caption lines if identical to previous cue
    const prev = cues[cues.length - 1];
    if (prev && prev.text === text) {
      prev.endSeconds = Math.max(prev.endSeconds, endSeconds);
      continue;
    }

    cues.push({ startSeconds, endSeconds, text });
  }

  return cues;
}
