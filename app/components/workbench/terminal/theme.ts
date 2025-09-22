import type { ITheme } from '@xterm/xterm';

const style = getComputedStyle(document.documentElement);
const cssVar = (token: string) => style.getPropertyValue(token) || undefined;

export function getTerminalTheme(overrides?: ITheme): ITheme {
  return {
    cursor: cssVar('--conformity-elements-terminal-cursorColor'),
    cursorAccent: cssVar('--conformity-elements-terminal-cursorColorAccent'),
    foreground: cssVar('--conformity-elements-terminal-textColor'),
    background: cssVar('--conformity-elements-terminal-backgroundColor'),
    selectionBackground: cssVar('--conformity-elements-terminal-selection-backgroundColor'),
    selectionForeground: cssVar('--conformity-elements-terminal-selection-textColor'),
    selectionInactiveBackground: cssVar('--conformity-elements-terminal-selection-backgroundColorInactive'),

    // ansi escape code colors
    black: cssVar('--conformity-elements-terminal-color-black'),
    red: cssVar('--conformity-elements-terminal-color-red'),
    green: cssVar('--conformity-elements-terminal-color-green'),
    yellow: cssVar('--conformity-elements-terminal-color-yellow'),
    blue: cssVar('--conformity-elements-terminal-color-blue'),
    magenta: cssVar('--conformity-elements-terminal-color-magenta'),
    cyan: cssVar('--conformity-elements-terminal-color-cyan'),
    white: cssVar('--conformity-elements-terminal-color-white'),
    brightBlack: cssVar('--conformity-elements-terminal-color-brightBlack'),
    brightRed: cssVar('--conformity-elements-terminal-color-brightRed'),
    brightGreen: cssVar('--conformity-elements-terminal-color-brightGreen'),
    brightYellow: cssVar('--conformity-elements-terminal-color-brightYellow'),
    brightBlue: cssVar('--conformity-elements-terminal-color-brightBlue'),
    brightMagenta: cssVar('--conformity-elements-terminal-color-brightMagenta'),
    brightCyan: cssVar('--conformity-elements-terminal-color-brightCyan'),
    brightWhite: cssVar('--conformity-elements-terminal-color-brightWhite'),

    ...overrides,
  };
}
