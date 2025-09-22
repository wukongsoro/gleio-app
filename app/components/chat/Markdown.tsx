import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import type { BundledLanguage } from 'shiki';
import { createScopedLogger } from '~/utils/logger';
import { rehypePlugins, remarkPlugins, allowedHTMLElements } from '~/utils/markdown';
import { Artifact } from './Artifact';
import { CodeBlock } from './CodeBlock';

import styles from './Markdown.module.scss';

const logger = createScopedLogger('MarkdownComponent');

interface MarkdownProps {
  children: string;
  html?: boolean;
  limitedMarkdown?: boolean;
}

export const Markdown = memo(({ children, html = false, limitedMarkdown = false }: MarkdownProps) => {
  logger.trace('Render');
  // Debug: Markdown component processing content

  const components = useMemo(() => {
    return {
      div: ({ className, children, node, ...props }) => {
        if (className?.includes('__boltArtifact__')) {
          const messageId = node?.properties.dataMessageId as string;

          if (!messageId) {
            logger.error(`Invalid message id ${messageId}`);
          }

          return <Artifact messageId={messageId} />;
        }

        return (
          <div className={className} {...props}>
            {children}
          </div>
        );
      },
      pre: (props) => {
        const { children, node, ...rest } = props;

        const [firstChild] = node?.children ?? [];

        if (
          firstChild &&
          firstChild.type === 'element' &&
          firstChild.tagName === 'code'
        ) {
          const codeElement = firstChild;
          const { className } = codeElement.properties || {};
          
          // Get the text content from the code element
          const textContent = codeElement.children
            ?.filter((child: any) => child.type === 'text')
            ?.map((child: any) => child.value)
            ?.join('') || String(children);

          const [, language = 'plaintext'] = /language-(\w+)/.exec(String(className) || '') ?? [];

          return <CodeBlock code={textContent} language={language as BundledLanguage} {...rest} />;
        }

        return <pre {...rest}>{children}</pre>;
      },
      code({ node, className, children, ...props }) {
        const match = /language-(\w+)/.exec(className || '');
        
        // If there's no language specified, treat as inline code
        // Block code should typically have a language class
        const isInline = !match;

        if (isInline) {
          return (
            <code className="bg-gray-200 dark:bg-gray-800 rounded-md px-2 py-1 text-sm font-mono" {...props}>
              {children}
            </code>
          );
        }

        // This case is handled by the pre handler above, but keep as fallback
        return (
          <CodeBlock
            code={String(children).replace(/\n$/, '')}
            language={match[1] as BundledLanguage}
            {...props}
          />
        );
      },
    } satisfies Components;
  }, []);

  return (
    <ReactMarkdown
      allowedElements={allowedHTMLElements}
      className={styles.MarkdownContent}
      components={components}
      remarkPlugins={remarkPlugins(limitedMarkdown)}
      rehypePlugins={rehypePlugins(html)}
    >
      {children}
    </ReactMarkdown>
  );
});
