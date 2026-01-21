import Constants from 'expo-constants';

// Load Gemini API key from environment variables via Expo Constants
// The key is set in .env file and loaded through app.config.js
const getGeminiApiKey = (): string => {
  const apiKey = Constants.expoConfig?.extra?.geminiApiKey as string;
  
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add it to your .env file:\n' +
      'GEMINI_API_KEY=your_api_key_here'
    );
  }
  
  return apiKey;
};

export const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'];
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
  // Validate API key is configured (throws if missing)
  const GEMINI_API_KEY = getGeminiApiKey();
  
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

          // Handle 429 (Rate Limit/Quota Exceeded)
          if (response.status === 429) {
            console.warn(`Gemini model "${modelName}" quota exceeded. Trying next fallback model...`);
            // Extract retry-after time if present in error message
            const retryMatch = errorText.match(/retry in ([\d.]+)s/i);
            if (retryMatch && parseFloat(retryMatch[1]) < 5) {
              // If retry time is less than 5 seconds, wait and retry same model
              const retrySeconds = parseFloat(retryMatch[1]);
              attempt++;
              if (attempt < GEMINI_MAX_ATTEMPTS_PER_MODEL) {
                console.warn(`Waiting ${retrySeconds}s before retrying...`);
                await new Promise(resolve => setTimeout(resolve, retrySeconds * 1000));
                continue;
              }
            }
            // Otherwise, skip to next model
            break;
          }

          // Handle 503 (Service Overloaded)
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

          // Handle 403/404 (Permission/Not Found)
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
        
        // Skip to next model for permission errors or quota issues
        if (lowerMessage.includes('permission') || 
            lowerMessage.includes('403') || 
            lowerMessage.includes('404') ||
            lowerMessage.includes('429') ||
            lowerMessage.includes('quota') ||
            lowerMessage.includes('rate limit')) {
          console.warn(`Skipping to next model due to: ${message}`);
          break;
        }

        attempt++;
        if (attempt < GEMINI_MAX_ATTEMPTS_PER_MODEL) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
  }

  // Provide user-friendly error message for quota issues
  if (lastErrorDetails.toLowerCase().includes('quota') || 
      lastErrorDetails.toLowerCase().includes('429') ||
      lastErrorDetails.toLowerCase().includes('rate limit')) {
    throw new Error(
      'AI service quota temporarily exceeded. This usually resolves within a few minutes. ' +
      'Please try again shortly or contact support if the issue persists.'
    );
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