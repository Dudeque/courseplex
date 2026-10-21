import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest, NextResponse, connection } from 'next/server';

export type AiProvider = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'ollama';

export interface AiServerConfig {
  provider: AiProvider;
  model: string;
  apiKey?: string;
  ollamaUrl?: string;
}

const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  groq: 'llama-3.3-70b-versatile',
  ollama: 'llama3.2',
};

function getAiConfigPath(): string {
  if (process.env.COURSEPLEX_USER_DATA && process.env.COURSEPLEX_USER_DATA.trim()) {
    return path.join(process.env.COURSEPLEX_USER_DATA.trim(), 'courseplex-ai.json');
  }
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'CoursePlex', 'courseplex-ai.json');
  }
  return path.join(os.homedir(), '.courseplex', 'courseplex-ai.json');
}

async function readAiConfig(): Promise<AiServerConfig> {
  const filePath = getAiConfigPath();
  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      const raw = await fs.promises.readFile(/*turbopackIgnore: true*/ filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const provider: AiProvider = parsed.provider || 'gemini';
      return {
        provider,
        model: parsed.model || DEFAULT_MODELS[provider],
        apiKey: parsed.apiKey || '',
        ollamaUrl: parsed.ollamaUrl || 'http://127.0.0.1:11434',
      };
    }
  } catch {
    // ignore read error
  }

  // Fallback to environment variables if present
  if (process.env.GEMINI_API_KEY) {
    return { provider: 'gemini', model: DEFAULT_MODELS.gemini, apiKey: process.env.GEMINI_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', model: DEFAULT_MODELS.openai, apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', model: DEFAULT_MODELS.anthropic, apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.GROQ_API_KEY) {
    return { provider: 'groq', model: DEFAULT_MODELS.groq, apiKey: process.env.GROQ_API_KEY };
  }

  return {
    provider: 'ollama',
    model: DEFAULT_MODELS.ollama,
    apiKey: '',
    ollamaUrl: 'http://127.0.0.1:11434',
  };
}

async function writeAiConfig(cfg: AiServerConfig): Promise<void> {
  const filePath = getAiConfigPath();
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(/*turbopackIgnore: true*/ filePath, JSON.stringify(cfg, null, 2), 'utf-8');
}

async function callLlm(
  cfg: AiServerConfig,
  systemPrompt: string,
  userPrompt: string,
  jsonMode = false
): Promise<string> {
  const provider = cfg.provider;
  const model = cfg.model || DEFAULT_MODELS[provider];

  if (provider === 'ollama') {
    const base = (cfg.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        ...(jsonMode ? { format: 'json' } : {}),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama error (${res.status}): ${errText || 'Make sure Ollama is running and the model is pulled.'}`);
    }
    const data = await res.json();
    return data.message?.content || '';
  }

  const apiKey =
    cfg.apiKey?.trim() ||
    (provider === 'gemini'
      ? process.env.GEMINI_API_KEY
      : provider === 'openai'
        ? process.env.OPENAI_API_KEY
        : provider === 'anthropic'
          ? process.env.ANTHROPIC_API_KEY
          : process.env.GROQ_API_KEY);

  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}. Click the AI Settings gear icon to add your key or switch to Local Ollama.`);
  }

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        ...(jsonMode ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Gemini error (${res.status})`);
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Anthropic error (${res.status})`);
    }
    return data.content?.[0]?.text || '';
  }

  // OpenAI or Groq (OpenAI-compatible)
  const endpoint =
    provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `${provider} error (${res.status})`);
  }
  return data.choices?.[0]?.message?.content || '';
}

export async function GET(req: NextRequest) {
  await connection();
  void req.nextUrl.searchParams;
  const cfg = await readAiConfig();
  let ollamaModels: string[] = [];

  try {
    const base = (cfg.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${base}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      ollamaModels = (data.models || []).map((m: { name: string }) => m.name);
    }
  } catch {
    // Ollama not running locally
  }

  return NextResponse.json({
    provider: cfg.provider,
    model: cfg.model,
    hasApiKey: Boolean(cfg.apiKey && cfg.apiKey.trim().length > 0),
    ollamaUrl: cfg.ollamaUrl || 'http://127.0.0.1:11434',
    ollamaModels,
    defaultModels: DEFAULT_MODELS,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Save AI Configuration
    if (body.action === 'save_config') {
      const current = await readAiConfig();
      const provider: AiProvider = body.provider || current.provider || 'gemini';
      const updated: AiServerConfig = {
        provider,
        model: body.model?.trim() || DEFAULT_MODELS[provider],
        apiKey: body.apiKey !== undefined ? (body.apiKey || '').trim() : current.apiKey,
        ollamaUrl: body.ollamaUrl?.trim() || current.ollamaUrl || 'http://127.0.0.1:11434',
      };
      await writeAiConfig(updated);
      return NextResponse.json({
        success: true,
        provider: updated.provider,
        model: updated.model,
        hasApiKey: Boolean(updated.apiKey),
        ollamaUrl: updated.ollamaUrl,
      });
    }

    const cfg = await readAiConfig();
    const {
      action,
      courseTitle,
      lessonTitle,
      currentTimeFormatted,
      nearbyTranscript,
      fullTranscriptExcerpt,
      notesText,
      question,
      history,
    } = body;

    // 2. Generate Auto-Chapters
    if (action === 'chapters') {
      const sys = `You are an expert technical course curriculum analyzer.
Given a video lesson's title and its timed transcript (or context), divide the lesson into 4 to 8 logical chapters.
Return ONLY a valid JSON object with the exact shape:
{ "chapters": [ { "title": "Short chapter title", "startSeconds": 0, "summary": "1-sentence summary" } ] }
Ensure startSeconds are numbers sorted in ascending order starting at 0.`;

      const usr = `Course: ${courseTitle || 'Course'}
Lesson: ${lessonTitle || 'Lesson'}
Transcript:
${fullTranscriptExcerpt || nearbyTranscript || 'No subtitle transcript available; infer logical study chapters from the lesson title.'}`;

      const raw = await callLlm(cfg, sys, usr, true);
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);
      const chapters = Array.isArray(parsed.chapters) ? parsed.chapters : Array.isArray(parsed) ? parsed : [];
      return NextResponse.json({ chapters });
    }

    // 3. Generate Lesson Cheat-Sheet Summary
    if (action === 'summary') {
      const sys = `You are an expert AI Study Tutor built into CoursePlex.
Create a concise, high-signal Markdown Cheat-Sheet for this video lesson.
Include:
- **Core Concept / TL;DR** (2-3 sentences)
- **Key Takeaways & Timestamps** (use [MM:SS] format when referencing moments from the transcript)
- **Code / Practical Patterns** (if applicable)
Keep it scannable and actionable for a student's Second Brain notes.`;

      const usr = `Course: ${courseTitle || 'Course'}
Lesson: ${lessonTitle || 'Lesson'}
Student's Existing Notes:
${notesText || 'None yet'}

Lesson Transcript:
${fullTranscriptExcerpt || nearbyTranscript || 'No transcript available; summarize key concepts for this topic.'}`;

      const markdown = await callLlm(cfg, sys, usr, false);
      return NextResponse.json({ markdown });
    }

    // 4. Context-Aware AI Lesson Tutor Chat
    const sys = `You are the CoursePlex AI Tutor helping a student master "${courseTitle || 'a video course'}".
Current Lesson: "${lessonTitle || 'Lesson'}" (Student's video player is currently at [${currentTimeFormatted || '00:00'}]).
Whenever you reference a specific moment from the transcript, format the timestamp as [MM:SS] so the student can click it.
Be clear, concise, and pedagogical. Use Markdown and code blocks where helpful.`;

    const historyText = Array.isArray(history)
      ? history
          .slice(-6)
          .map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
          .join('\n\n')
      : '';

    const usr = `${
      nearbyTranscript
        ? `Transcript around current playback time [${currentTimeFormatted || '00:00'}]:\n${nearbyTranscript}\n\n`
        : ''
    }${fullTranscriptExcerpt ? `Broader Lesson Transcript Excerpt:\n${fullTranscriptExcerpt}\n\n` : ''}${
      notesText ? `Student's Notes in this Lesson:\n${notesText}\n\n` : ''
    }${historyText ? `Recent Conversation:\n${historyText}\n\n` : ''}Student Question: ${
      question || 'Explain what the instructor just covered around this timestamp.'
    }`;

    const answer = await callLlm(cfg, sys, usr, false);
    return NextResponse.json({ answer });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI request failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
