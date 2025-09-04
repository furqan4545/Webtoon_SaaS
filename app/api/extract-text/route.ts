import { NextRequest, NextResponse } from "next/server";

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

    const type = (file.type || '').toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // .txt
    if (type.startsWith('text/plain')) {
      const text = buffer.toString('utf8');
      return NextResponse.json({ text });
    }

    // .pdf
    if (type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
      // Try pdf-parse first; if it fails (e.g., in some serverless envs), fallback to pdfjs-dist
      try {
        const mod: any = await import('pdf-parse');
        const pdfParse = mod?.default || mod;
        const data = await pdfParse(buffer);
        return NextResponse.json({ text: String(data?.text || '') });
      } catch (e: any) {
        try {
          // Fallback using pdfjs-dist (no rendering, text only)
          const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
          const doc = await pdfjs.getDocument({ data: buffer }).promise;
          let text = '';
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            const strings = (content.items || []).map((it: any) => it.str).join(' ');
            text += strings + '\n\n';
          }
          return NextResponse.json({ text });
        } catch (e2: any) {
          return NextResponse.json({ error: 'PDF parsing failed', details: e2?.message || e?.message || 'unknown' }, { status: 500 });
        }
      }
    }

    // .docx
    if (
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name?.toLowerCase().endsWith('.docx')
    ) {
      try {
        const mammoth = await import('mammoth');
        const result = await (mammoth as any).extractRawText({ buffer });
        return NextResponse.json({ text: String(result?.value || '') });
      } catch (e: any) {
        return NextResponse.json({ error: 'DOCX parsing failed', details: e?.message || 'unknown' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: `Unsupported file type: ${type || file.name}` }, { status: 415 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to extract text', details: error?.message || 'Unknown' }, { status: 500 });
  }
}


