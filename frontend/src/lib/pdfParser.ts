import * as pdfjsLib from 'pdfjs-dist';

// Use CDN worker for maximum cross-browser and Vite bundler compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface PdfParseResult {
  text: string;
  pageCount: number;
  needsPassword?: boolean;
}

export async function extractTextFromPdf(
  fileBuffer: ArrayBuffer,
  password?: string
): Promise<PdfParseResult> {
  try {
    // Clone buffer so PDF.js worker transfer does NOT neuter/detach the original ArrayBuffer
    const cloned = fileBuffer.slice(0);
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(cloned),
      password: password || undefined,
    });

    const doc = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageStrings = content.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ');
      fullText += `--- Page ${i} ---\n${pageStrings}\n\n`;
    }

    return {
      text: fullText.trim(),
      pageCount: doc.numPages,
      needsPassword: false,
    };
  } catch (err: any) {
    if (
      err?.name === 'PasswordException' ||
      err?.code === 1 || // PasswordException.NEED_PASSWORD
      err?.code === 2 || // PasswordException.INCORRECT_PASSWORD
      err?.message?.toLowerCase().includes('password')
    ) {
      return {
        text: '',
        pageCount: 0,
        needsPassword: true,
      };
    }
    throw err;
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer.slice(0));
  const len = bytes.byteLength;
  const chunkSize = 0x8000; // 32KB chunks
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return window.btoa(binary);
}
