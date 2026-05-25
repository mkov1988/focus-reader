/**
 * Theme definitions shared by the storefront menu (palette picker) and the
 * App shell (which applies the active accent + light/dark mode to the document
 * root so every view — storefront AND reader — stays in sync).
 *
 * Architecture:
 *   - `mode` (light | dark) drives the *neutral* palette (bg / surface / text)
 *     via `[data-mode]` rules in index.css.
 *   - `themeIndex` drives the *accent* via the `--coral-accent-rgb` CSS var.
 *   - Tailwind colour names map to these CSS vars (see tailwind.config.js),
 *     so changing either recolours the whole app with zero per-component work.
 */

export interface ThemePalette {
    bg: string;
    surface: string;
    surfaceSunken: string;
    text: string;
    textMuted: string;
    focalRgb: string;
    accentRgb: string;
    accentText: string;
}

export interface ThemeDef {
    label: string;
    /** Four swatches shown in the menu — literal hex so each pill always
     *  renders its own palette regardless of the active theme. */
    pills: [string, string, string, string];
    light: ThemePalette;
    dark: ThemePalette;
}

export const THEMES: ThemeDef[] = [
    {
        label: 'Mocha',
        pills: ['#EADBC4', '#6B5544', '#C2674B', '#FBF5EA'],
        light: {
            bg: '234 219 196',
            surface: '245 239 235',
            surfaceSunken: '220 196 168',
            text: '44 30 22',
            textMuted: '92 74 61',
            focalRgb: '153 82 41',
            accentRgb: '107 85 68',
            accentText: '245 239 235',
        },
        dark: {
            bg: '28 18 12',
            surface: '46 32 23',
            surfaceSunken: '62 44 32',
            text: '245 239 235',
            textMuted: '184 160 138',
            focalRgb: '204 125 81',
            accentRgb: '135 106 84',
            accentText: '28 18 12',
        }
    },
    {
        label: 'Sage',
        pills: ['#FBF5EA', '#7E8F6E', '#3A2A1E', '#6B5544'],
        light: {
            bg: '235 236 228',
            surface: '248 249 243',
            surfaceSunken: '223 226 214',
            text: '47 59 44',
            textMuted: '93 107 90',
            focalRgb: '75 105 41',
            accentRgb: '100 115 88',
            accentText: '248 249 243',
        },
        dark: {
            bg: '20 26 19',
            surface: '32 42 30',
            surfaceSunken: '43 56 40',
            text: '226 232 223',
            textMuted: '154 171 149',
            focalRgb: '137 178 90',
            accentRgb: '126 143 110',
            accentText: '20 26 19',
        }
    },
    {
        label: 'Terracotta',
        pills: ['#FBF5EA', '#C2674B', '#3A2A1E', '#EADBC4'],
        light: {
            bg: '243 233 216',
            surface: '251 245 234',
            surfaceSunken: '234 219 196',
            text: '58 42 30',
            textMuted: '107 85 68',
            focalRgb: '160 45 16',
            accentRgb: '168 85 59',
            accentText: '251 245 234',
        },
        dark: {
            bg: '26 20 15',
            surface: '42 34 26',
            surfaceSunken: '52 42 32',
            text: '240 232 218',
            textMuted: '168 152 132',
            focalRgb: '235 106 72',
            accentRgb: '194 103 75',
            accentText: '26 20 15',
        }
    },
    {
        label: 'Ochre',
        pills: ['#FBF5EA', '#B07A25', '#3A2A1E', '#7E8F6E'],
        light: {
            bg: '244 238 216',
            surface: '252 251 245',
            surfaceSunken: '232 223 193',
            text: '58 42 30',
            textMuted: '107 85 68',
            focalRgb: '165 95 12',
            accentRgb: '176 122 37',
            accentText: '252 251 245',
        },
        dark: {
            bg: '28 26 18',
            surface: '44 40 27',
            surfaceSunken: '58 53 37',
            text: '242 238 214',
            textMuted: '176 169 141',
            focalRgb: '232 152 46',
            accentRgb: '176 122 37',
            accentText: '28 26 18',
        }
    },
];

export type ThemeMode = 'light' | 'dark';
