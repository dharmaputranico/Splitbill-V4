import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  console.log('[scan-receipt] Request received');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[scan-receipt] ANTHROPIC_API_KEY is missing');
    return Response.json(
      { error: 'API key not configured', debug: 'ANTHROPIC_API_KEY environment variable is missing' },
      { status: 500 }
    );
  }

  let imageBase64, mediaType;
  try {
    const body = await request.json();
    imageBase64 = body.imageBase64;
    mediaType = body.mediaType;
    console.log('[scan-receipt] Body parsed, mediaType:', mediaType, 'imageBase64 length:', imageBase64?.length);
  } catch (e) {
    console.error('[scan-receipt] Failed to parse request body:', e.message);
    return Response.json({ error: 'Invalid request body', debug: e.message }, { status: 400 });
  }

  if (!imageBase64) {
    console.error('[scan-receipt] No image provided');
    return Response.json({ error: 'No image provided' }, { status: 400 });
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const safeMediaType = allowedTypes.includes(mediaType) ? mediaType : 'image/jpeg';
  console.log('[scan-receipt] Using mediaType:', safeMediaType);

  let response;
  try {
    console.log('[scan-receipt] Calling Anthropic API...');
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: safeMediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `You are a receipt OCR tool. Extract ONLY the ordered menu items from this restaurant receipt.

STRICT RULES:
1. Extract ONLY food and drink items that were ordered. Do NOT include: Subtotal, Total, Tax, Service Charge, PPN, Cash, Change, Discount, or any payment summary lines.
2. For unit price: if quantity > 1, unit price = the line total divided by quantity. Example: "2x Nasi Goreng 60,000" → unit price is 30,000 (not 60,000).
3. Do NOT invent charges. Only extract items explicitly listed on the receipt.
4. Read item names exactly as written on the receipt. Do not translate or paraphrase.
5. Ignore printed headers, restaurant name, address, date, table number, cashier name.

Return ONLY a JSON array with this exact format, no explanation, no markdown:
[{"name": "Item Name", "qty": 1, "price": 25000}]

Where "price" is the unit price (per single item), and "qty" is the quantity ordered.`,
            },
          ],
        },
      ],
    });
    console.log('[scan-receipt] Anthropic API call successful');
  } catch (e) {
    console.error('[scan-receipt] Anthropic API call failed:', e.message, 'status:', e.status);
    return Response.json(
      {
        error: 'Anthropic API call failed',
        debug: e.message,
        status: e.status || null,
        anthropic_error: e.error || null,
      },
      { status: 500 }
    );
  }

  const rawText = response.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();

  console.log('[scan-receipt] Raw response:', rawText.slice(0, 200));

  try {
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    console.log('[scan-receipt] Parsed successfully, items:', parsed.length);
    return Response.json({ result: parsed });
  } catch (e) {
    console.error('[scan-receipt] JSON parse failed:', e.message);
    return Response.json(
      {
        error: 'Failed to parse Claude response as JSON',
        debug: e.message,
        raw_response: rawText.slice(0, 500),
      },
      { status: 500 }
    );
  }
}
