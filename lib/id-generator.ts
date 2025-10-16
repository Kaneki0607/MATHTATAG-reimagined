/**
 * Centralized ID Generator for MATHTATAG Project
 * 
 * Generates human-readable, traceable IDs for all entities in the system.
 * Format: PREFIX-XXXX (e.g., PARENT-0001, TEACHER-0001, STUDENT-SECT-0001)
 * 
 * Features:
 * - Sequential numbering with zero-padding
 * - Automatic collision detection
 * - Consistent formatting across all entity types
 * - Easy to trace and debug
 */

import { readData, writeData } from './firebase-database';

// Entity type definitions
export type EntityType = 
  | 'PARENT'
  | 'TEACHER' 
  | 'STUDENT'
  | 'CLASS'
  | 'EXERCISE'
  | 'ASSIGNED'
  | 'QUESTION'
  | 'RESULT'
  | 'ANNOUNCEMENT'
  | 'TASK'
  | 'ADMIN';

// Entity type to prefix mapping
const ENTITY_PREFIXES: Record<EntityType, string> = {
  'PARENT': 'P',
  'TEACHER': 'T',
  'STUDENT': 'S',
  'CLASS': 'C',
  'EXERCISE': 'E',
  'ASSIGNED': 'A',
  'QUESTION': 'Q',
  'RESULT': 'R',
  'ANNOUNCEMENT': 'N',
  'TASK': 'K',
  'ADMIN': 'M'
};

// ID counter storage path in Firebase
const ID_COUNTERS_PATH = '/system/idCounters';

/**
 * Get the current counter value for an entity type
 */
async function getCounter(entityType: EntityType): Promise<number> {
  try {
    const result = await readData(`${ID_COUNTERS_PATH}/${entityType}`);
    return result.data?.count || 0;
  } catch (error) {
    console.warn(`[IDGenerator] Failed to get counter for ${entityType}, starting from 0:`, error);
    return 0;
  }
}

/**
 * Increment and save the counter for an entity type
 */
async function incrementCounter(entityType: EntityType, newCount: number): Promise<void> {
  try {
    await writeData(`${ID_COUNTERS_PATH}/${entityType}`, {
      count: newCount,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[IDGenerator] Failed to increment counter for ${entityType}:`, error);
    throw new Error(`Failed to update ID counter for ${entityType}`);
  }
}

/**
 * Format number with zero padding
 */
function padNumber(num: number, length: number = 4): string {
  return num.toString().padStart(length, '0');
}

/**
 * Generate random 3-letter code (uppercase)
 * Uses letters that are easy to distinguish (no I, O to avoid confusion with 1, 0)
 */
function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 24 letters (excluded I, O)
  let code = '';
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Build ID string with random code for uniqueness
 * Format: PREFIX-XXX-XXXX (e.g., T-ABA-0001, S-XYZ-0023)
 */
function buildId(entityType: EntityType, number: number): string {
  const prefix = ENTITY_PREFIXES[entityType];
  const randomCode = generateRandomCode();
  return `${prefix}-${randomCode}-${padNumber(number)}`;
}

/**
 * Check if an ID already exists in the database
 */
async function idExists(path: string, id: string): Promise<boolean> {
  try {
    const result = await readData(`${path}/${id}`);
    return result.data !== null && result.data !== undefined;
  } catch (error) {
    return false;
  }
}

/**
 * Generate hierarchical ID for results
 * Format: EXERCISE-ID-R-XXX-XXXX (e.g., E-GTK-0004-R-ABC-0001)
 * 
 * @param exerciseId - Parent exercise ID
 * @param databasePath - Path for collision check
 * @returns Promise<string> - Generated hierarchical ID
 */
export async function generateResultId(
  exerciseId: string,
  databasePath?: string
): Promise<string> {
  const maxAttempts = 100;
  let attempt = 0;
  
  while (attempt < maxAttempts) {
    try {
      // Get current counter for results
      const currentCount = await getCounter('RESULT');
      const nextCount = currentCount + 1;
      
      // Build hierarchical ID: EXERCISE-ID-R-XXX-XXXX
      const randomCode = generateRandomCode();
      const resultPart = `R-${randomCode}-${padNumber(nextCount)}`;
      const hierarchicalId = `${exerciseId}-${resultPart}`;
      
      // Check for collisions if database path provided
      if (databasePath) {
        const exists = await idExists(databasePath, hierarchicalId);
        if (exists) {
          console.warn(`[IDGenerator] Result ID collision detected, regenerating...`);
          attempt++;
          continue;
        }
      }
      
      // No collision, increment counter and return
      await incrementCounter('RESULT', nextCount);
      console.log(`[IDGenerator] Generated result ID: ${hierarchicalId}`);
      return hierarchicalId;
      
    } catch (error) {
      console.error(`[IDGenerator] Error generating result ID:`, error);
      attempt++;
      
      if (attempt >= maxAttempts) {
        throw new Error(`Failed to generate unique result ID after ${maxAttempts} attempts`);
      }
    }
  }
  
  throw new Error('Failed to generate unique result ID');
}

/**
 * Generate the next available ID for an entity type
 * 
 * Format: PREFIX-XXX-XXXX (e.g., T-ABA-0001, S-XYZ-0023)
 * - PREFIX: Single letter representing entity type (T=Teacher, S=Student, etc.)
 * - XXX: Random 3-letter code for uniqueness (prevents collisions)
 * - XXXX: Sequential 4-digit number
 * 
 * @param entityType - Type of entity (PARENT, TEACHER, STUDENT, etc.)
 * @param section - Optional section identifier (currently not used with new format)
 * @param databasePath - Path in database where entity will be stored (for collision check)
 * @returns Promise<string> - Generated ID (e.g., "T-ABA-0001", "S-XYZ-0023")
 */
export async function generateNextId(
  entityType: EntityType,
  section?: string,
  databasePath?: string
): Promise<string> {
  const maxAttempts = 100;
  let attempt = 0;
  
  while (attempt < maxAttempts) {
    try {
      // Get current counter
      const currentCount = await getCounter(entityType);
      const nextCount = currentCount + 1;
      
      // Build the ID with random code for uniqueness
      // Format: PREFIX-XXX-XXXX (e.g., T-ABA-0001)
      const generatedId = buildId(entityType, nextCount);
      
      // Check for collisions if database path provided
      if (databasePath) {
        const exists = await idExists(databasePath, generatedId);
        if (exists) {
          // Extremely rare - regenerate with new random code
          console.warn(`[IDGenerator] ID collision detected for ${generatedId}, regenerating...`);
          attempt++;
          continue; // Don't increment counter, just try again with new random code
        }
      }
      
      // No collision, increment counter and return
      await incrementCounter(entityType, nextCount);
      console.log(`[IDGenerator] Generated new ID: ${generatedId}`);
      return generatedId;
      
    } catch (error) {
      console.error(`[IDGenerator] Error generating ID for ${entityType}:`, error);
      attempt++;
      
      if (attempt >= maxAttempts) {
        throw new Error(`Failed to generate unique ID for ${entityType} after ${maxAttempts} attempts`);
      }
    }
  }
  
  throw new Error(`Failed to generate unique ID for ${entityType}`);
}

/**
 * Generate a batch of IDs for multiple entities
 * Useful when creating multiple records at once
 */
export async function generateBatchIds(
  entityType: EntityType,
  count: number,
  section?: string
): Promise<string[]> {
  const ids: string[] = [];
  
  for (let i = 0; i < count; i++) {
    const id = await generateNextId(entityType, section);
    ids.push(id);
  }
  
  return ids;
}

/**
 * Parse an ID to extract its components
 * 
 * New format: PREFIX-XXX-XXXX (e.g., "T-ABA-0001", "S-XYZ-0023")
 * Legacy format: ENTITY-0001 or ENTITY-SECTION-0001
 * 
 * @param id - ID string
 * @returns Object with type, randomCode, number, and validity
 */
export function parseId(id: string): {
  type: string;
  randomCode?: string;
  number: number;
  isValid: boolean;
  fullType?: string; // For legacy format compatibility
} {
  const parts = id.split('-');
  
  if (parts.length < 2) {
    return { type: '', number: 0, isValid: false };
  }
  
  // New format: PREFIX-XXX-XXXX (3 parts)
  if (parts.length === 3) {
    const [prefix, randomCode, numberStr] = parts;
    const number = parseInt(numberStr, 10);
    
    // Check if this is the new format (single letter prefix + 3-letter code + number)
    if (prefix.length === 1 && randomCode.length === 3 && !isNaN(number)) {
      // Map single letter prefix back to full entity type
      const typeMap: Record<string, string> = {
        'P': 'PARENT',
        'T': 'TEACHER',
        'S': 'STUDENT',
        'C': 'CLASS',
        'E': 'EXERCISE',
        'A': 'ASSIGNED',
        'Q': 'QUESTION',
        'R': 'RESULT',
        'N': 'ANNOUNCEMENT',
        'K': 'TASK',
        'M': 'ADMIN'
      };
      
      return {
        type: prefix,
        fullType: typeMap[prefix] || prefix,
        randomCode,
        number,
        isValid: !isNaN(number)
      };
    }
    
    // Legacy format with section: ENTITY-SECTION-XXXX
    return {
      type: prefix,
      fullType: prefix,
      randomCode: randomCode, // This is actually section in legacy format
      number: isNaN(number) ? 0 : number,
      isValid: !isNaN(number)
    };
  }
  
  // Legacy standard format: ENTITY-XXXX (2 parts)
  const [type, numberStr] = parts;
  const number = parseInt(numberStr, 10);
  return {
    type,
    fullType: type,
    number: isNaN(number) ? 0 : number,
    isValid: !isNaN(number)
  };
}

/**
 * Validate if an ID follows the correct format
 * 
 * New format: PREFIX-XXX-XXXX (e.g., T-ABA-0001)
 * Legacy formats also accepted for backward compatibility
 */
export function isValidId(id: string, expectedType?: EntityType): boolean {
  const parsed = parseId(id);
  
  if (!parsed.isValid) {
    return false;
  }
  
  // For new format, check if type matches expected
  if (expectedType) {
    const expectedPrefix = ENTITY_PREFIXES[expectedType];
    const actualFullType = parsed.fullType || parsed.type;
    
    // Match either the single letter prefix or full type name
    if (parsed.type !== expectedPrefix && actualFullType !== expectedType) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get all existing IDs of a specific type from the database
 * Useful for migration or verification
 */
export async function getAllIdsOfType(
  databasePath: string,
  entityType: EntityType
): Promise<string[]> {
  try {
    const result = await readData(databasePath);
    if (!result.data) {
      return [];
    }
    
    const expectedPrefix = ENTITY_PREFIXES[entityType];
    
    const ids = Object.keys(result.data).filter(id => {
      const parsed = parseId(id);
      // Match either new format (single letter) or legacy format (full name)
      return parsed.type === expectedPrefix || parsed.fullType === entityType;
    });
    
    return ids;
  } catch (error) {
    console.error(`[IDGenerator] Failed to get all IDs for ${entityType}:`, error);
    return [];
  }
}

/**
 * Reset counter for an entity type (USE WITH CAUTION)
 * Only use for testing or data migration
 */
export async function resetCounter(entityType: EntityType, startValue: number = 0): Promise<void> {
  console.warn(`[IDGenerator] Resetting counter for ${entityType} to ${startValue}`);
  await writeData(`${ID_COUNTERS_PATH}/${entityType}`, {
    count: startValue,
    lastUpdated: new Date().toISOString(),
    resetAt: new Date().toISOString()
  });
}

/**
 * Get the highest ID number currently in use for an entity type
 * Useful for initializing counters from existing data
 */
export async function getHighestIdNumber(
  databasePath: string,
  entityType: EntityType
): Promise<number> {
  try {
    const ids = await getAllIdsOfType(databasePath, entityType);
    
    if (ids.length === 0) {
      return 0;
    }
    
    const numbers = ids
      .map(id => parseId(id).number)
      .filter(num => !isNaN(num));
    
    return Math.max(...numbers);
  } catch (error) {
    console.error(`[IDGenerator] Failed to get highest ID number for ${entityType}:`, error);
    return 0;
  }
}

/**
 * Initialize counter from existing database data
 * Scans existing records and sets counter to highest ID + 1
 */
export async function initializeCounterFromExisting(
  databasePath: string,
  entityType: EntityType
): Promise<void> {
  console.log(`[IDGenerator] Initializing counter for ${entityType} from existing data...`);
  
  const highestNumber = await getHighestIdNumber(databasePath, entityType);
  await resetCounter(entityType, highestNumber);
  
  console.log(`[IDGenerator] Counter for ${entityType} initialized to ${highestNumber}`);
}

/**
 * Generate a login code (for parent login codes)
 * Format: XXXX-XXXX (8 characters, alphanumeric, no ambiguous characters)
 */
export async function generateLoginCode(): Promise<string> {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude I, O to avoid confusion
  let code = '';
  
  // Generate 8-character code
  for (let i = 0; i < 8; i++) {
    if (i === 4) {
      code += '-'; // Add separator in middle
    }
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Check if code already exists
  const exists = await idExists('/parentLoginCodes', code);
  if (exists) {
    // Recursively generate new code
    return generateLoginCode();
  }
  
  return code;
}

// Export helper functions for common use cases
export const IDGenerator = {
  generateNextId,
  generateResultId,
  generateBatchIds,
  parseId,
  isValidId,
  getAllIdsOfType,
  resetCounter,
  getHighestIdNumber,
  initializeCounterFromExisting,
  generateLoginCode
};

export default IDGenerator;

