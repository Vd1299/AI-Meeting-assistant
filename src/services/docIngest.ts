import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export interface IngestedDoc {
  filePath: string;
  text: string;
  hash: string;
}

const SUPPORTED_EXT = /\.(pdf|docx|md|txt)$/i;

export async function ingestFolder(folder: string): Promise<IngestedDoc[]> {
  if (!folder || !fs.existsSync(folder)) return [];

  const files = fs
    .readdirSync(folder)
    .filter((f) => SUPPORTED_EXT.test(f))
    .map((f) => path.join(folder, f));

  const docs: IngestedDoc[] = [];

  for (const filePath of files) {
    try {
      const buffer = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      const ext = path.extname(filePath).toLowerCase();

      let text = '';
      if (ext === '.pdf') {
        text = (await pdfParse(buffer)).text;
      } else if (ext === '.docx') {
        text = (await mammoth.extractRawText({ buffer })).value;
      } else {
        text = buffer.toString('utf-8');
      }

      text = text.trim();
      if (text) {
        docs.push({ filePath, text, hash });
      }
    } catch (err) {
      console.error(`[docIngest] Failed to parse ${filePath}:`, err);
    }
  }

  return docs;
}
