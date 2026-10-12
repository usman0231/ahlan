/**
 * Tailwind is the token surface, not a place for ad-hoc values.
 *
 * Every colour, radius and spacing step a component may use is declared here
 * and mapped to a CSS variable defined in `global.css`, which is what makes a
 * single class work in both light and dark mode. A component that needs a value
 * not in this file needs a token added, not a hex code inlined.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // `global.css` defines the dark tokens under `.dark:root`, not a
  // prefers-color-scheme media query, because the app lets the user override
  // the system setting. That is a class strategy, so Tailwind has to be told:
  // left on the default 'media', NativeWind refuses `colorScheme.set()` on web
  // and the theme toggle throws. On native it makes no difference.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--color-surface-raised) / <alpha-value>)',
        'surface-sunken': 'rgb(var(--color-surface-sunken) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        'border-strong': 'rgb(var(--color-border-strong) / <alpha-value>)',
        'card-border': 'rgb(var(--color-card-border) / <alpha-value>)',
        fg: 'rgb(var(--color-fg) / <alpha-value>)',
        'fg-muted': 'rgb(var(--color-fg-muted) / <alpha-value>)',
        'fg-subtle': 'rgb(var(--color-fg-subtle) / <alpha-value>)',
        'fg-inverse': 'rgb(var(--color-fg-inverse) / <alpha-value>)',
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        'primary-pressed': 'rgb(var(--color-primary-pressed) / <alpha-value>)',
        'primary-strong': 'rgb(var(--color-primary-strong) / <alpha-value>)',
        'primary-soft': 'rgb(var(--color-primary-soft) / <alpha-value>)',
        'primary-fill': 'rgb(var(--color-primary-fill) / <alpha-value>)',
        'on-primary': 'rgb(var(--color-on-primary) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--color-accent-soft) / <alpha-value>)',
        'on-hero': 'rgb(var(--color-on-hero) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        'success-soft': 'rgb(var(--color-success-soft) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        'warning-soft': 'rgb(var(--color-warning-soft) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        'danger-soft': 'rgb(var(--color-danger-soft) / <alpha-value>)',
        info: 'rgb(var(--color-info) / <alpha-value>)',
        'info-soft': 'rgb(var(--color-info-soft) / <alpha-value>)',
        'severity-low': 'rgb(var(--color-severity-low) / <alpha-value>)',
        'severity-medium': 'rgb(var(--color-severity-medium) / <alpha-value>)',
        'severity-high': 'rgb(var(--color-severity-high) / <alpha-value>)',
        'severity-critical': 'rgb(var(--color-severity-critical) / <alpha-value>)',
      },
      borderRadius: {
        xs: '10px',
        sm: '14px',
        md: '20px',
        lg: '24px',
        xl: '32px',
      },
      spacing: {
        /** The minimum touch target: 48dp, per the UI standards. */
        touch: '48px',
        gutter: '20px',
      },
      fontSize: {
        // Sizes only; the family (and therefore the weight) comes from the
        // Text component: Space Grotesk for display roles, Inter for reading.
        numeral: ['56px', { lineHeight: '58px', letterSpacing: '-2.4px' }],
        display: ['34px', { lineHeight: '38px', letterSpacing: '-1.4px' }],
        title: ['26px', { lineHeight: '31px', letterSpacing: '-0.9px' }],
        heading: ['18px', { lineHeight: '24px', letterSpacing: '-0.3px' }],
        body: ['15px', { lineHeight: '22px', letterSpacing: '-0.1px' }],
        callout: ['14px', { lineHeight: '20px', letterSpacing: '-0.1px' }],
        caption: ['12.5px', { lineHeight: '17px' }],
        overline: ['11px', { lineHeight: '14px', letterSpacing: '1.2px' }],
      },
    },
  },
  plugins: [],
};
