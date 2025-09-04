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

    // PDFs are not supported per product requirement

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


