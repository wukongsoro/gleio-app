import { globSync } from 'fast-glob';
import fs from 'node:fs/promises';
import { basename } from 'node:path';
import { defineConfig, presetIcons, presetUno, transformerDirectives } from 'unocss';

const iconPaths = globSync('./icons/*.svg');

const collectionName = 'conformity';

const customIconCollection = iconPaths.reduce(
  (acc, iconPath) => {
    const [iconName] = basename(iconPath).split('.');

    acc[collectionName] ??= {};
    acc[collectionName][iconName] = async () => fs.readFile(iconPath, 'utf8');

    return acc;
  },
  {} as Record<string, Record<string, () => Promise<string>>>,
);

const BASE_COLORS = {
  white: '#FFFFFF',
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0A0A0A',
  },
  accent: {
    50: '#EEF9FF',
    100: '#D8F1FF',
    200: '#BAE7FF',
    300: '#8ADAFF',
    400: '#53C4FF',
    500: '#2BA6FF',
    600: '#1488FC',
    700: '#0D6FE8',
    800: '#1259BB',
    900: '#154E93',
    950: '#122F59',
  },
  green: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
    950: '#052E16',
  },
  orange: {
    50: '#FFFAEB',
    100: '#FEEFC7',
    200: '#FEDF89',
    300: '#FEC84B',
    400: '#FDB022',
    500: '#F79009',
    600: '#DC6803',
    700: '#B54708',
    800: '#93370D',
    900: '#792E0D',
  },
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    950: '#450A0A',
  },
};

const COLOR_PRIMITIVES = {
  ...BASE_COLORS,
  alpha: {
    white: generateAlphaPalette(BASE_COLORS.white),
    gray: generateAlphaPalette(BASE_COLORS.gray[900]),
    red: generateAlphaPalette(BASE_COLORS.red[500]),
    accent: generateAlphaPalette(BASE_COLORS.accent[500]),
  },
};

export default defineConfig({
  shortcuts: {
    'conformity-ease-cubic-bezier': 'ease-[cubic-bezier(0.4,0,0.2,1)]',
    'transition-theme': 'transition-[background-color,border-color,color] duration-150 conformity-ease-cubic-bezier',
    kdb: 'bg-conformity-elements-code-background text-conformity-elements-code-text py-1 px-1.5 rounded-md',
    'max-w-chat': 'max-w-[var(--chat-max-width)]',
  },
  rules: [
    /**
     * This shorthand doesn't exist in Tailwind and we overwrite it to avoid
     * any conflicts with minified CSS classes.
     */
    ['b', {}],
  ],
  theme: {
    colors: {
      ...COLOR_PRIMITIVES,
      conformity: {
        elements: {
          borderColor: 'var(--conformity-elements-borderColor)',
          borderColorActive: 'var(--conformity-elements-borderColorActive)',
          background: {
            depth: {
              1: 'var(--conformity-elements-bg-depth-1)',
              2: 'var(--conformity-elements-bg-depth-2)',
              3: 'var(--conformity-elements-bg-depth-3)',
              4: 'var(--conformity-elements-bg-depth-4)',
            },
          },
          textPrimary: 'var(--conformity-elements-textPrimary)',
          textSecondary: 'var(--conformity-elements-textSecondary)',
          textTertiary: 'var(--conformity-elements-textTertiary)',
          code: {
            background: 'var(--conformity-elements-code-background)',
            text: 'var(--conformity-elements-code-text)',
          },
          button: {
            primary: {
              background: 'var(--conformity-elements-button-primary-background)',
              backgroundHover: 'var(--conformity-elements-button-primary-backgroundHover)',
              text: 'var(--conformity-elements-button-primary-text)',
            },
            secondary: {
              background: 'var(--conformity-elements-button-secondary-background)',
              backgroundHover: 'var(--conformity-elements-button-secondary-backgroundHover)',
              text: 'var(--conformity-elements-button-secondary-text)',
            },
            danger: {
              background: 'var(--conformity-elements-button-danger-background)',
              backgroundHover: 'var(--conformity-elements-button-danger-backgroundHover)',
              text: 'var(--conformity-elements-button-danger-text)',
            },
          },
          item: {
            contentDefault: 'var(--conformity-elements-item-contentDefault)',
            contentActive: 'var(--conformity-elements-item-contentActive)',
            contentAccent: 'var(--conformity-elements-item-contentAccent)',
            contentDanger: 'var(--conformity-elements-item-contentDanger)',
            backgroundDefault: 'var(--conformity-elements-item-backgroundDefault)',
            backgroundActive: 'var(--conformity-elements-item-backgroundActive)',
            backgroundAccent: 'var(--conformity-elements-item-backgroundAccent)',
            backgroundDanger: 'var(--conformity-elements-item-backgroundDanger)',
          },
          actions: {
            background: 'var(--conformity-elements-actions-background)',
            code: {
              background: 'var(--conformity-elements-actions-code-background)',
            },
          },
          artifacts: {
            background: 'var(--conformity-elements-artifacts-background)',
            backgroundHover: 'var(--conformity-elements-artifacts-backgroundHover)',
            borderColor: 'var(--conformity-elements-artifacts-borderColor)',
            inlineCode: {
              background: 'var(--conformity-elements-artifacts-inlineCode-background)',
              text: 'var(--conformity-elements-artifacts-inlineCode-text)',
            },
          },
          messages: {
            background: 'var(--conformity-elements-messages-background)',
            linkColor: 'var(--conformity-elements-messages-linkColor)',
            code: {
              background: 'var(--conformity-elements-messages-code-background)',
            },
            inlineCode: {
              background: 'var(--conformity-elements-messages-inlineCode-background)',
              text: 'var(--conformity-elements-messages-inlineCode-text)',
            },
          },
          icon: {
            success: 'var(--conformity-elements-icon-success)',
            error: 'var(--conformity-elements-icon-error)',
            primary: 'var(--conformity-elements-icon-primary)',
            secondary: 'var(--conformity-elements-icon-secondary)',
            tertiary: 'var(--conformity-elements-icon-tertiary)',
          },
          preview: {
            addressBar: {
              background: 'var(--conformity-elements-preview-addressBar-background)',
              backgroundHover: 'var(--conformity-elements-preview-addressBar-backgroundHover)',
              backgroundActive: 'var(--conformity-elements-preview-addressBar-backgroundActive)',
              text: 'var(--conformity-elements-preview-addressBar-text)',
              textActive: 'var(--conformity-elements-preview-addressBar-textActive)',
            },
          },
          terminals: {
            background: 'var(--conformity-elements-terminals-background)',
            buttonBackground: 'var(--conformity-elements-terminals-buttonBackground)',
          },
          dividerColor: 'var(--conformity-elements-dividerColor)',
          loader: {
            background: 'var(--conformity-elements-loader-background)',
            progress: 'var(--conformity-elements-loader-progress)',
          },
          prompt: {
            background: 'var(--conformity-elements-prompt-background)',
          },
          sidebar: {
            dropdownShadow: 'var(--conformity-elements-sidebar-dropdownShadow)',
            buttonBackgroundDefault: 'var(--conformity-elements-sidebar-buttonBackgroundDefault)',
            buttonBackgroundHover: 'var(--conformity-elements-sidebar-buttonBackgroundHover)',
            buttonText: 'var(--conformity-elements-sidebar-buttonText)',
          },
          cta: {
            background: 'var(--conformity-elements-cta-background)',
            text: 'var(--conformity-elements-cta-text)',
          },
        },
      },
    },
  },
  transformers: [transformerDirectives()],
  presets: [
    presetUno({
      dark: {
        light: '[data-theme="light"]',
        dark: '[data-theme="dark"]',
      },
    }),
    presetIcons({
      warn: true,
      collections: {
        ...customIconCollection,
      },
    }),
  ],
});

/**
 * Generates an alpha palette for a given hex color.
 *
 * @param hex - The hex color code (without alpha) to generate the palette from.
 * @returns An object where keys are opacity percentages and values are hex colors with alpha.
 *
 * Example:
 *
 * ```
 * {
 *   '1': '#FFFFFF03',
 *   '2': '#FFFFFF05',
 *   '3': '#FFFFFF08',
 * }
 * ```
 */
function generateAlphaPalette(hex: string) {
  return [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].reduce(
    (acc, opacity) => {
      const alpha = Math.round((opacity / 100) * 255)
        .toString(16)
        .padStart(2, '0');

      acc[opacity] = `${hex}${alpha}`;

      return acc;
    },
    {} as Record<number, string>,
  );
}
