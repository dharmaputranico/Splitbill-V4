import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[scan-receipt] ANTHROPIC_API_KEY is not set');
    return Response.json({ error: 'API key not configured', debug: 'ANTHROPIC_API_KEY environment variable is missing' }, { status: 500 });
  }

  let imageBase64, mediaType;
  try {
    const body = await request.json();
    imageBase64 = body.imageBase64;
    mediaType = body.mediaType;
  } catch (e) {
    return Response.json({ error: 'Invalid request body', debug: e.message }, { status: 400 });
  }

  if (!imageBase64) return Response.json({ error: 'No image provided' }, { status: 400 });

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const safeMediaType = allowedTypes.includes(mediaType) ? mediaType : 'image/jpeg';

  console.log(`[scan-receipt] Starting scan. mediaType=${safeMediaType}, imageSize=${imageBase64.length} chars`);

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: safeMediaType, data: imageBase64 } },
          {
            type: 'text',
            text: `You are a receipt scanner for an Indonesian restaurant bill splitter app.

Carefully read every line of this receipt and extract the data into JSON.

OUTPUT FORMAT — respond ONLY with this JSON, no markdown, no backticks, no explanation:
{"restaurant":"","items":[{"name":"","qty":1,"price":0}],"svc_pct":0,"svc_fixed":0,"tax_pct":0,"tax_fixed":0,"other_fixed":0}

STRICT RULES FOR ITEMS:
1. Only include ORDERED MENU ITEMS — food and drinks that were purchased.
2. DO NOT include: Subtotal, Total, Cash, Change, Balance, Grand Total, or any payment summary lines. These are not menu items.
3. "price" must be the UNIT price (price for 1 piece). If the receipt shows a total line price, divide by qty to get unit price. Example: "2 Nasi Sayur 40,000" means qty=2, unit price=20,000.
4. Read item names carefully and exactly as written. Do not guess or substitute names.
5. qty must be an integer. price must be a number (no commas, no currency symbols).

RULES FOR CHARGES (svc, tax, other):
6. Only fill svc/tax fields if the receipt explicitly shows a service charge or tax (PPN) line.
7. If no service charge on receipt → svc_pct=0 and svc_fixed=0.
8. If no tax on receipt → tax_pct=0 and tax_fixed=0.
9. Do NOT invent charges that are not printed on the receipt.
10. If charge is shown as percentage (e.g. "PPN 11%") → use pct field (value: 11). If shown as fixed amount → use fixed field.
11. other_fixed = only explicit extra charges that are NOT service or tax (e.g. packaging fee). Do NOT put change/cash here.

Indonesian receipt context: service charge is calculated on subtotal; tax (PPN) is calculated on subtotal + service charge.`
          }
        ]
      }]
    });
  } catch (e) {
    console.error('[scan-receipt] Anthropic API call failed:', e.message, e.status);
    return Response.json({ error: 'Anthropic API call failed', debug: e.message, status: e.status || null, anthropic_error: e.error || null }, { status: 500 });
  }

  const rawText = response.content.map(b => b.type === 'text' ? b.text : '').join('').trim();
  console.log('[scan-receipt] Raw Claude response:', rawText.slice(0, 300));

  try {
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    console.log(`[scan-receipt] Success. Found ${parsed.items?.length || 0} items.`);
    return Response.json({ result: parsed });
  } catch (e) {
    console.error('[scan-receipt] JSON parse failed. Raw text was:', rawText);
    return Response.json({ error: 'Failed to parse Claude response as JSON', debug: e.message, raw_response: rawText.slice(0, 500) }, { status: 500 });
  }
}
