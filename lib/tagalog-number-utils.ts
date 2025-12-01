/**
 * Tagalog Number Conversion Utilities
 * Converts numbers in text to proper Tagalog words for TTS pronunciation
 */

/**
 * Convert a single number to Tagalog word
 */
function numberToTagalog(num: number): string {
  if (num === 0) return 'zero';
  if (num < 0) return 'negatibong ' + numberToTagalog(-num);
  
  // Basic numbers 1-10
  const basic: { [key: number]: string } = {
    1: 'isa',
    2: 'dalawa',
    3: 'tatlo',
    4: 'apat',
    5: 'lima',
    6: 'anim',
    7: 'pito',
    8: 'walo',
    9: 'siyam',
    10: 'sampu'
  };
  
  if (num <= 10) return basic[num];
  
  // 11-19
  if (num < 20) {
    const ones = num - 10;
    if (ones === 1) return 'labing-isa';
    if (ones === 2) return 'labindalawa';
    if (ones === 3) return 'labintatlo';
    if (ones === 4) return 'labing-apat';
    if (ones === 5) return 'labinlima';
    if (ones === 6) return 'labing-anim';
    if (ones === 7) return 'labimpito';
    if (ones === 8) return 'labingwalo';
    if (ones === 9) return 'labinsiyam';
  }
  
  // 20-99
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    
    let result = '';
    if (tens === 2) result = 'dalawampu';
    else if (tens === 3) result = 'tatlumpu';
    else if (tens === 4) result = 'apatnapu';
    else if (tens === 5) result = 'limampu';
    else if (tens === 6) result = 'animnapu';
    else if (tens === 7) result = 'pitumpu';
    else if (tens === 8) result = 'walumpu';
    else if (tens === 9) result = 'siyamnapu';
    
    if (ones > 0) {
      result += "'t " + basic[ones];
    }
    
    return result;
  }
  
  // 100-999
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const remainder = num % 100;
    
    let result = '';
    if (hundreds === 1) result = 'isang daan';
    else result = basic[hundreds] + 'ng daan';
    
    if (remainder > 0) {
      result += ' ' + numberToTagalog(remainder);
    }
    
    return result;
  }
  
  // 1000+
  if (num < 1000000) {
    const thousands = Math.floor(num / 1000);
    const remainder = num % 1000;
    
    let result = '';
    if (thousands === 1) result = 'isang libo';
    else result = numberToTagalog(thousands) + 'ng libo';
    
    if (remainder > 0) {
      result += ' ' + numberToTagalog(remainder);
    }
    
    return result;
  }
  
  // For very large numbers, return as is (or could extend further)
  return num.toString();
}

/**
 * Convert all numbers in text to Tagalog words
 * Handles standalone numbers and numbers in context
 */
export function convertNumbersToTagalog(text: string): string {
  if (!text) return text;
  
  // Pattern to match numbers (integers and decimals)
  // Matches: standalone numbers, numbers with punctuation, numbers in parentheses
  const numberPattern = /\b(\d+(?:\.\d+)?)\b/g;
  
  return text.replace(numberPattern, (match, numStr) => {
    const num = parseFloat(numStr);
    
    // Skip if it's a decimal with fractional part (could be measurements, etc.)
    // Only convert whole numbers for now
    if (numStr.includes('.') && parseFloat(numStr) % 1 !== 0) {
      // For decimals, convert the whole part and keep the decimal
      const parts = numStr.split('.');
      const wholePart = parseInt(parts[0]);
      const decimalPart = parts[1];
      
      // Convert decimal digits individually
      const decimalWords = decimalPart.split('').map((d: string) => numberToTagalog(parseInt(d))).join(' ');
      
      return numberToTagalog(wholePart) + ' punto ' + decimalWords;
    }
    
    // Convert whole numbers
    if (Number.isInteger(num)) {
      return numberToTagalog(num);
    }
    
    return match;
  });
}

/**
 * Enhanced conversion that also handles common number patterns
 * like "12 items", "21 students", etc.
 */
export function convertNumbersToTagalogEnhanced(text: string): string {
  let result = convertNumbersToTagalog(text);
  
  // Handle common patterns like "dose" -> "labindalawa", "bente" -> "dalawampu"
  const commonMistakes: { [key: string]: string } = {
    'dose': 'labindalawa',
    'bente': 'dalawampu',
    'bente uno': 'dalawampu\'t isa',
    'bente dos': 'dalawampu\'t dalawa',
    'treinta': 'tatlumpu',
    'kuwarenta': 'apatnapu',
    'singkwenta': 'limampu',
  };
  
  // Replace common mistakes (case-insensitive)
  Object.entries(commonMistakes).forEach(([wrong, correct]) => {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    result = result.replace(regex, correct);
  });
  
  return result;
}

