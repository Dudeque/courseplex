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
