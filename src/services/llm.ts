import OpenAI from 'openai';
import type { Chunk } from './rag';

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are the candidate in a live job interview, answering questions out loud in real time.
Speak in first person, naturally and conversationally: no bullet points, no markdown, no headings, no lists -- just how a person actually talks in an interview.
Keep answers focused and reasonably concise unless the question clearly calls for more depth.
You will be given reference material drawn from the candidate's own resume and project documentation.
- If the question is directly covered by the reference material, ground your answer in those specifics.
- If the question is hypothetical or scenario-based and the material only gives related background, reason from that background to build a confident, plausible answer as if drawing on real experience.
- If the question has nothing to do with the reference material, answer it using solid general/professional knowledge as the candidate would.
Never mention "the documents," "the context," or that you are an AI. Just answer as the candidate would.`;

export function buildMessages(question: string, context: Chunk[], history: HistoryTurn[]) {
  const contextBlock = context.length
    ? `Reference material (candidate's resume/docs):\n${context.map((c) => `- ${c.text}`).join('\n')}`
    : 'Reference material: nothing directly relevant found -- answer from general knowledge.';

  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'system' as const, content: contextBlock },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: question },
  ];
}

export async function streamAnswer(
  apiKey: string,
  model: string,
  question: string,
  context: Chunk[],
  history: HistoryTurn[],
  onToken: (token: string) => void
): Promise<string> {
  const openai = new OpenAI({ apiKey });
  const messages = buildMessages(question, context, history);

  const stream = await openai.chat.completions.create({
    model,
    messages,
    stream: true,
    temperature: 0.6,
  });

  let full = '';
  for await (const part of stream) {
    const token = part.choices[0]?.delta?.content || '';
    if (token) {
      full += token;
      onToken(token);
    }
  }
  return full;
}
