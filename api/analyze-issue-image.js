const MAX_IMAGE_DATA_LENGTH = 4_200_000
const IMAGE_ANALYSIS_PROMPT = 'Determine whether this image clearly shows a civic/public-infrastructure issue that a citizen can report to local authorities. Valid examples include a pothole or damaged road, overflowing garbage, a broken streetlight, and a public water leak. Reject unrelated images such as selfies, pets, food, documents, indoor scenes, or ordinary scenery without a visible civic problem. Return only JSON with isCivicIssue (boolean), issueType (one of Pothole, Garbage, Streetlight, Water Leakage, Other), description, priority (Low, Medium, or High), and confidence (50-99). Set isCivicIssue to true only when a reportable civic issue is visible. Write a concise actionable English description from visible evidence. Use Other only for a visible civic issue that does not fit another type. High means immediate public safety risk, active water leak, or dangerous road damage. Medium means garbage overflow or moderate disruption. Low means minor issue.'

function sendJson(response, status, payload) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

export default async function analyzeIssueImage(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendJson(response, 405, { error: 'Method not allowed.' })
  }

  const apiKey = process.env.ZENMUX_API_KEY
  if (!apiKey) {
    return sendJson(response, 503, { error: 'AI image analysis is not configured. Add ZENMUX_API_KEY to the Vercel project environment variables.' })
  }

  let body = request.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return sendJson(response, 400, { error: 'Invalid JSON request body.' })
    }
  }

  const image = body?.image
  if (typeof image !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(image)) {
    return sendJson(response, 400, { error: 'Please select a valid JPEG, PNG, or WebP image.' })
  }
  if (image.length > MAX_IMAGE_DATA_LENGTH) {
    return sendJson(response, 413, { error: 'This image is too large to analyze. Please choose a smaller image.' })
  }

  let upstream
  try {
    upstream = await fetch('https://zenmux.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: process.env.ZENMUX_MODEL || 'openai/gpt-6-luna',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: IMAGE_ANALYSIS_PROMPT },
            { type: 'image_url', image_url: { url: image, detail: 'low' } },
          ],
        }],
      }),
    })
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError'
    return sendJson(response, timedOut ? 504 : 502, {
      error: timedOut
        ? 'ZenMux image analysis timed out. Please try again.'
        : 'Unable to reach the AI image analysis service. Please try again.',
    })
  }

  let payload
  try {
    payload = await upstream.json()
  } catch {
    return sendJson(response, 502, { error: 'ZenMux returned an invalid response. Please try again.' })
  }

  if (!upstream.ok) {
    const providerMessage = payload?.error?.message || payload?.message
    return sendJson(response, 502, {
      error: providerMessage
        ? `ZenMux request failed (HTTP ${upstream.status}): ${String(providerMessage).slice(0, 300)}`
        : `ZenMux request failed (HTTP ${upstream.status}). Check the server-side API key and model.`,
    })
  }

  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    return sendJson(response, 502, { error: 'ZenMux returned an empty image analysis.' })
  }

  try {
    const jsonText = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
    return sendJson(response, 200, JSON.parse(jsonText))
  } catch {
    return sendJson(response, 502, { error: 'ZenMux returned an unreadable image analysis. Please try again.' })
  }
}
