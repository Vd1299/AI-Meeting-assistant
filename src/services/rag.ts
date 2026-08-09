import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ingestFolder } from './docIngest';

export interface Chunk {
  id: string;
  filePath: string;
  text: string;
  embedding: number[];
}

interface CacheEntry {
  hash: string;
  chunks: { id: string; text: string; embedding: number[] }[];
}
type Cache = Record<string, CacheEntry>;

const EMBEDDING_MODEL = 'text-embedding-3-small';

function chunkText(text: string, maxChars = 700): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current && (current + '\n\n' + para).length > maxChars) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
    while (current.length > maxChars * 1.5) {
      chunks.push(current.slice(0, maxChars).trim());
      current = current.slice(maxChars);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class RagIndex {
  private chunks: Chunk[] = [];
  private cachePath: string;
  private openai: OpenAI | null = null;

  constructor(private cacheDir: string) {
    this.cachePath = path.join(cacheDir, 'rag-cache.json');
  }

  setApiKey(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  get size(): number {
    return this.chunks.length;
  }

  private loadCache(): Cache {
    try {
      if (fs.existsSync(this.cachePath)) {
        return JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
      }
    } catch (err) {
      console.error('[rag] Failed to load cache:', err);
    }
    return {};
  }

  private saveCache(cache: Cache) {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(cache), 'utf-8');
    } catch (err) {
      console.error('[rag] Failed to save cache:', err);
    }
  }

  async build(docFolder: string): Promise<{ files: number; chunks: number }> {
    if (!this.openai) throw new Error('RagIndex: OpenAI API key not set');

    const docs = await ingestFolder(docFolder);
    const cache = this.loadCache();
    const nextCache: Cache = {};
    this.chunks = [];

    for (const doc of docs) {
      const existing = cache[doc.filePath];
      if (existing && existing.hash === doc.hash) {
        nextCache[doc.filePath] = existing;
        for (const c of existing.chunks) {
          this.chunks.push({ id: c.id, filePath: doc.filePath, text: c.text, embedding: c.embedding });
        }
        continue;
      }

      const pieces = chunkText(doc.text);
      const entryChunks: CacheEntry['chunks'] = [];
      for (let i = 0; i < pieces.length; i++) {
        const embedding = await this.embed(pieces[i]);
        const id = `${doc.filePath}#${i}`;
        entryChunks.push({ id, text: pieces[i], embedding });
        this.chunks.push({ id, filePath: doc.filePath, text: pieces[i], embedding });
      }
      nextCache[doc.filePath] = { hash: doc.hash, chunks: entryChunks };
    }

    this.saveCache(nextCache);
    return { files: docs.length, chunks: this.chunks.length };
  }

  private async embed(text: string): Promise<number[]> {
    if (!this.openai) throw new Error('RagIndex: OpenAI API key not set');
    const res = await this.openai.embeddings.create({ model: EMBEDDING_MODEL, input: text });
    return res.data[0].embedding;
  }

  async retrieve(query: string, k = 4): Promise<Chunk[]> {
    if (this.chunks.length === 0) return [];
    const queryEmbedding = await this.embed(query);
    const scored = this.chunks.map((c) => ({ chunk: c, score: cosineSimilarity(queryEmbedding, c.embedding) }));
    scored.sort((a, b) => b.score - a.score);
    return scored
      .slice(0, k)
      .filter((s) => s.score > 0.15)
      .map((s) => s.chunk);
  }
}
