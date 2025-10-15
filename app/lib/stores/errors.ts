import { atom, map } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ErrorsStore');

export interface ParsedError {
  id: string;
  type: 'module-not-found' | 'next-font' | 'typescript' | 'runtime' | 'build' | 'unknown';
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
  fullError: string;
  timestamp: number;
}

export interface ErrorFixRequest {
  error: ParsedError;
  prompt: string;
  targetFile?: string;
}

class ErrorsStore {
  #errors = map<Record<string, ParsedError>>({});
  #isFixing = atom(false);
  #currentFixRequest = atom<ErrorFixRequest | null>(null);

  get errors() {
    return this.#errors;
  }

  get isFixing() {
    return this.#isFixing;
  }

  get currentFixRequest() {
    return this.#currentFixRequest;
  }

  addError(error: ParsedError) {
    logger.info(`Adding error: ${error.type} - ${error.message}`);
    this.#errors.setKey(error.id, error);
  }

  removeError(errorId: string) {
    logger.info(`Removing error: ${errorId}`);
    const current = this.#errors.get();
    const { [errorId]: _, ...rest } = current;
    this.#errors.set(rest);
  }

  clearErrors() {
    logger.info('Clearing all errors');
    this.#errors.set({});
  }

  /**
   * Generate a focused fix prompt for a specific error
   */
  generateFixPrompt(error: ParsedError): ErrorFixRequest {
    let prompt = '';
    let targetFile: string | undefined;

    switch (error.type) {
      case 'module-not-found':
        targetFile = error.file?.replace('@/', '');
        prompt = `Fix the missing module error:

**Error:** Module not found: Can't resolve '${error.file}'

**Task:** Create the missing component file at ${targetFile}

**Requirements:**
- Create ONLY the missing file with a proper React component
- Use TypeScript
- Export the component as default
- Keep it simple and functional
- DO NOT modify any other files
- DO NOT change the existing code structure

**Example component structure:**
\`\`\`typescript
export default function ComponentName() {
  return (
    <div>
      {/* Component content */}
    </div>
  );
}
\`\`\``;
        break;

      case 'next-font':
        targetFile = error.file || 'app/layout.tsx';
        prompt = `Fix the next/font error in ${targetFile}:

**Error:** An error occurred in 'next/font'

**Problem:** Google Fonts (next/font/google) don't work in WebContainer environment

**Task:** Replace next/font/google with a local font or remove font import

**Solution Options:**
1. Remove the font import and use system fonts
2. Use a different font loading method compatible with WebContainer

**Requirements:**
- Fix ONLY the font import issue
- Keep all other code unchanged
- Ensure the layout still renders correctly
- DO NOT modify any other files

**Example fix:**
Replace:
\`\`\`typescript
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'] })
\`\`\`

With:
\`\`\`typescript
// Use system fonts instead
\`\`\``;
        break;

      case 'typescript':
        prompt = `Fix the TypeScript error:

**Error:** ${error.message}
${error.file ? `**File:** ${error.file}` : ''}

**Task:** Fix ONLY the TypeScript type error

**Requirements:**
- Fix the specific type error mentioned
- DO NOT refactor unrelated code
- Keep changes minimal
- Ensure type safety`;
        break;

      default:
        prompt = `Fix the following error:

**Error:** ${error.message}

**Full error details:**
${error.fullError}

**Requirements:**
- Analyze and fix the specific error
- Make minimal changes
- DO NOT modify unrelated code`;
    }

    return {
      error,
      prompt,
      targetFile,
    };
  }

  /**
   * Request AI to fix a specific error
   */
  async requestFix(error: ParsedError, sendMessage: (message: string) => void) {
    if (this.#isFixing.get()) {
      logger.warn('Fix already in progress, ignoring request');
      return;
    }

    logger.info(`Requesting fix for error: ${error.type}`);
    this.#isFixing.set(true);

    const fixRequest = this.generateFixPrompt(error);
    this.#currentFixRequest.set(fixRequest);

    try {
      // Send the focused fix prompt to the AI
      sendMessage(fixRequest.prompt);
      
      // Clear the fix request after a delay (AI should have received it)
      setTimeout(() => {
        this.#currentFixRequest.set(null);
      }, 1000);
    } catch (err) {
      logger.error('Failed to request fix:', err);
      this.#isFixing.set(false);
      this.#currentFixRequest.set(null);
      throw err;
    }
  }

  /**
   * Mark fix as complete (called when AI responds or fix is applied)
   */
  completeFix(errorId: string) {
    logger.info(`Fix completed for error: ${errorId}`);
    this.removeError(errorId);
    this.#isFixing.set(false);
    this.#currentFixRequest.set(null);
  }

  /**
   * Cancel ongoing fix
   */
  cancelFix() {
    logger.info('Cancelling fix');
    this.#isFixing.set(false);
    this.#currentFixRequest.set(null);
  }
}

export const errorsStore = new ErrorsStore();

