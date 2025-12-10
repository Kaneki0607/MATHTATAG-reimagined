export const GEMINI_API_KEY = 'AIzaSyCkLH0BgJm6i9C-lYTqKzFYVRgKeACLmCM';
export const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash-latest'];
export const GEMINI_MAX_ATTEMPTS_PER_MODEL = 3;

const parseGeminiErrorMessage = (raw: string): string => {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
    if (parsed?.message) {
      return parsed.message;
    }
  } catch {
    // ignore parse errors
  }
  return raw;
};

export const callGeminiWithFallback = async (requestBody: any): Promise<{ data: any; modelUsed: string }> => {
  let lastErrorDetails = 'Gemini request failed.';

  for (const modelName of GEMINI_MODELS) {
    let attempt = 0;

    while (attempt < GEMINI_MAX_ATTEMPTS_PER_MODEL) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          const friendlyError = parseGeminiErrorMessage(errorText);
          lastErrorDetails = `(${response.status}) ${friendlyError}`;

          if (response.status === 503) {
            attempt++;
            console.warn(`Gemini model "${modelName}" overloaded (attempt ${attempt}/${GEMINI_MAX_ATTEMPTS_PER_MODEL}). Retrying...`);
            if (attempt < GEMINI_MAX_ATTEMPTS_PER_MODEL) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            } else {
              break;
            }
          }

          if (response.status === 403 || response.status === 404) {
            console.warn(`Gemini model "${modelName}" unavailable: ${friendlyError}. Trying next fallback model...`);
            break;
          }

          throw new Error(`API request failed: ${response.status} - ${friendlyError}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.find((c: any) =>
          Array.isArray(c?.content?.parts) &&
          c.content.parts.some((part: any) => typeof part?.text === 'string' && part.text.trim().length > 0)
        );

        if (!candidate) {
          lastErrorDetails = 'Invalid response from AI service';
          break;
        }

        return { data, modelUsed: modelName };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastErrorDetails = message;
        console.warn(`Gemini request failed for model "${modelName}" (attempt ${attempt + 1}/${GEMINI_MAX_ATTEMPTS_PER_MODEL}):`, error);

        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes('permission') || lowerMessage.includes('403') || lowerMessage.includes('404')) {
          break;
        }

        attempt++;
        if (attempt < GEMINI_MAX_ATTEMPTS_PER_MODEL) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
  }

  throw new Error(lastErrorDetails);
};

export const extractGeminiText = (data: any): string => {
  if (!data?.candidates) {
    return '';
  }

  for (const candidate of data.candidates) {
    if (!candidate?.content?.parts) continue;
    const parts = candidate.content.parts
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean);

    const text = parts.join('\n').trim();
    if (text) {
      return text;
    }
  }

  return '';
};

const stripCodeFences = (text: string): string =>
  text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

const removeTrailingCommas = (text: string): string =>
  text.replace(/,\s*([}\]])/g, '$1');

const ensureClosingDelimiter = (text: string): string => {
  if (!text) return text;
  const startsWithArray = text.trim().startsWith('[');
  const startsWithObject = text.trim().startsWith('{');
  if (startsWithArray && !text.trim().endsWith(']')) {
    return `${text.trim()}]`;
  }
  if (startsWithObject && !text.trim().endsWith('}')) {
    return `${text.trim()}}`;
  }
  return text;
};

export const parseGeminiJson = <T>(responseText: string): T => {
  if (!responseText) {
    throw new Error('Empty Gemini response');
  }

  let cleanedText = stripCodeFences(responseText)
    .replace(/[“”]/g, '"')
    .replace(/\r\n/g, '\n')
    .trim();

  const firstArray = cleanedText.indexOf('[');
  const firstObject = cleanedText.indexOf('{');

  if (firstArray !== -1 && (firstArray < firstObject || firstObject === -1)) {
    const lastArray = cleanedText.lastIndexOf(']');
    cleanedText = lastArray !== -1
      ? cleanedText.slice(firstArray, lastArray + 1)
      : `${cleanedText.slice(firstArray)}]`;
  } else if (firstObject !== -1) {
    const lastObject = cleanedText.lastIndexOf('}');
    cleanedText = lastObject !== -1
      ? cleanedText.slice(firstObject, lastObject + 1)
      : `${cleanedText.slice(firstObject)}}`;
  } else {
    throw new Error('No JSON payload found in Gemini response');
  }

  cleanedText = removeTrailingCommas(cleanedText);
  cleanedText = ensureClosingDelimiter(cleanedText);

  try {
    return JSON.parse(cleanedText) as T;
  } catch (error) {
    console.warn('Failed to parse Gemini JSON on first attempt. Retrying with sanitized payload.', error);
    cleanedText = ensureClosingDelimiter(removeTrailingCommas(cleanedText));
    return JSON.parse(cleanedText) as T;
  }
};
