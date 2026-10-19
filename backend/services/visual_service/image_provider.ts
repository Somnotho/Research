import { z } from 'zod';
export async function generate_image(prompt: string) {
  const url = new URL(process.env.AZURE_IMAGE_ENDPOINT!);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error('Image endpoint must be an HTTPS images/generations URL without credentials or fragment');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.RESEARCH_AZURE_KEY!,
      Authorization: `Bearer ${process.env.RESEARCH_AZURE_KEY}`,
    },
    body: JSON.stringify({ model: process.env.AZURE_IMAGE_MODEL, prompt, n: 1, size: '1024x1024' }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`Image provider returned HTTP ${response.status}`);
  const result = z
    .object({ data: z.array(z.object({ b64_json: z.string().min(10).max(30000000) })).min(1) })
    .parse(await response.json());
  const contents = Buffer.from(result.data[0].b64_json, 'base64');
  if (!contents.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new Error('Image provider did not return a base64 PNG. Use a compatible image deployment.');
  return result.data[0].b64_json;
}
