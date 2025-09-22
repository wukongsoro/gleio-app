import { memo, useEffect, useState } from 'react';
import { bundledLanguages, codeToHtml, isSpecialLang, type BundledLanguage, type SpecialLanguage } from 'shiki';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';

import styles from './CodeBlock.module.scss';

const logger = createScopedLogger('CodeBlock');

interface CodeBlockProps {
  className?: string;
  code: string;
  language?: BundledLanguage | SpecialLanguage;
  theme?: 'light-plus' | 'dark-plus';
  disableCopy?: boolean;
}

export const CodeBlock = memo(
  ({ className, code, language = 'plaintext', theme = 'dark-plus', disableCopy = false }: CodeBlockProps) => {
    const [html, setHTML] = useState<string | undefined>(undefined);
    const [copied, setCopied] = useState(false);

    const copyToClipboard = () => {
      if (copied) {
        return;
      }

      navigator.clipboard.writeText(code);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    };

    useEffect(() => {
      if (language && !isSpecialLang(language) && !(language in bundledLanguages)) {
        logger.warn(`Unsupported language '${language}'`);
      }

      logger.trace(`Language = ${language}`);

      const processCode = async () => {
        setHTML(await codeToHtml(code, { lang: language, theme }));
      };

      processCode();
    }, [code]);

    return (
      <div className={classNames('relative group text-left my-4', className)}>
        {/* Code Block Container */}
        <div className="relative bg-[#0d1117] border border-[#21262d] rounded-xl overflow-hidden shadow-2xl">
          {/* Header with language and copy button */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#21262d]">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 bg-[#ff5f57] rounded-full"></div>
                <div className="w-3 h-3 bg-[#ffbd2e] rounded-full"></div>
                <div className="w-3 h-3 bg-[#28ca42] rounded-full"></div>
              </div>
              <span className="text-[#8b949e] text-sm font-medium ml-2">
                {language || 'plaintext'}
              </span>
            </div>
            
          {!disableCopy && (
            <button
              className={classNames(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200 text-sm font-medium border',
                {
                    'bg-[#238636] border-[#238636] text-white': copied,
                    'bg-[#21262d] border-[#30363d] text-[#f0f6fc] hover:bg-[#30363d] hover:border-[#8b949e]': !copied,
                },
              )}
                title={copied ? 'Copied!' : 'Copy Code'}
              onClick={() => copyToClipboard()}
            >
                <div className={classNames('text-sm', {
                  'i-ph:check-bold': copied,
                  'i-ph:copy': !copied,
                })}></div>
                <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}
          </div>
          
          {/* Code Content */}
          <div className="overflow-x-auto">
            <div 
              className={classNames(styles.CodeContent, 'p-4 text-sm leading-relaxed font-mono')}
              dangerouslySetInnerHTML={{ __html: html ?? '' }}
            />
          </div>
        </div>
      </div>
    );
  },
);
