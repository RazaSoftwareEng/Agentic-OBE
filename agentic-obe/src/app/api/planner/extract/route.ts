import { NextResponse } from 'next/server';
import { getCurrentUser, STAFF_ROLES } from '@/lib/auth';
import { extractPlan } from '@/lib/ai';
import { analyzeClo } from '@/lib/ai/nlp';

export const runtime = 'nodejs';
export const maxDuration = 60; // Gemini calls can take a while

async function fileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith('.pdf')) {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : text;
  }
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    return value;
  }
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) {
    return new TextDecoder().decode(buf);
  }
  throw new Error('Unsupported file type — upload a PDF, DOCX or TXT file.');
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !STAFF_ROLES.includes(user.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  try {
    const fd = await req.formData();
    const file = fd.get('file');
    let text = String(fd.get('text') ?? '');
    if (file && typeof file === 'object' && (file as File).size > 0) {
      if ((file as File).size > 10 * 1024 * 1024) throw new Error('File is larger than 10 MB.');
      text = await fileToText(file as File);
    }
    text = text.trim();
    if (text.length < 30) throw new Error('The outline is too short — paste the course contents or upload the outline file.');
    const totalWeeks = Math.min(20, Math.max(8, Number(fd.get('total_weeks')) || 16));
    const hasLab = fd.get('has_lab') === 'true';
    const plan = await extractPlan(text, { totalWeeks, hasLab });
    if (!plan.topics.length) throw new Error('No topics could be found. Make sure the outline lists course contents (one topic per line or comma-separated).');
    const cloChecks = plan.clos.map((c) => analyzeClo(c.description));
    return NextResponse.json({ plan, text, cloChecks });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
