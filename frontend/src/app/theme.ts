import { createTheme } from '@mantine/core';

const indigo = [
  '#eef2ff',
  '#e0e7ff',
  '#c7d2fe',
  '#a5b4fc',
  '#818cf8',
  '#6366f1',
  '#4f46e5',
  '#4338ca',
  '#3730a3',
  '#312e81',
] as const;

const dark = [
  '#C9C9D3',
  '#B0B0BE',
  '#9898AD',
  '#7E7E96',
  '#65657E',
  '#4D4D66',
  '#383850',
  '#2B2B3D',
  '#1E1E2E',
  '#14141F',
] as const;

const theme = createTheme({
  colors: {
    indigo,
    dark,
  },
  primaryColor: 'indigo',
  respectReducedMotion: true,
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  headings: {
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontWeight: '600',
  },
  defaultRadius: 'md',
  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  spacing: {
    xs: '8px',
    sm: '12px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  components: {
    AppShell: {
      defaultProps: {
        padding: 'lg',
        transitionDuration: 200,
      },
      styles: {
        main: {
          backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))',
        },
      },
    },
    Card: {
      defaultProps: {
        radius: 'lg',
        padding: 'lg',
      },
      styles: {
        root: {
          transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease',
          '&:hover': {
            boxShadow: 'var(--mantine-shadow-md)',
          },
        },
      },
    },
    Button: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        root: {
          transition: 'transform 100ms ease, box-shadow 100ms ease',
          '&:active': {
            transform: 'scale(0.98)',
          },
        },
      },
    },
    ActionIcon: {
      styles: {
        root: {
          transition: 'transform 100ms ease',
          '&:active': {
            transform: 'scale(0.92)',
          },
        },
      },
    },
    Modal: {
      defaultProps: {
        transitionProps: { transition: 'pop', duration: 200 },
      },
    },
    Drawer: {
      defaultProps: {
        transitionProps: { duration: 250 },
      },
    },
    Menu: {
      defaultProps: {
        transitionProps: { transition: 'pop', duration: 150 },
      },
    },
    Popover: {
      defaultProps: {
        transitionProps: { transition: 'pop', duration: 150 },
      },
    },
    Tooltip: {
      defaultProps: {
        transitionProps: { transition: 'fade', duration: 150 },
      },
    },
    Accordion: {
      defaultProps: {
        transitionDuration: 200,
      },
    },
    SegmentedControl: {
      defaultProps: {
        transitionDuration: 200,
      },
    },
    Burger: {
      defaultProps: {
        transitionDuration: 200,
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          transition: 'box-shadow 150ms ease',
          '&:focus-within': {
            boxShadow: '0 0 0 3px var(--mantine-color-primary-light)',
          },
        },
      },
    },
    PasswordInput: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          transition: 'box-shadow 150ms ease',
          '&:focus-within': {
            boxShadow: '0 0 0 3px var(--mantine-color-primary-light)',
          },
        },
      },
    },
    Textarea: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          transition: 'box-shadow 150ms ease',
          '&:focus-within': {
            boxShadow: '0 0 0 3px var(--mantine-color-primary-light)',
          },
        },
      },
    },
    Select: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          transition: 'box-shadow 150ms ease',
          '&:focus-within': {
            boxShadow: '0 0 0 3px var(--mantine-color-primary-light)',
          },
        },
      },
    },
    NavLink: {
      styles: {
        root: {
          borderRadius: '8px',
          transition: 'background-color 120ms ease, color 120ms ease',
        },
      },
    },
    Table: {
      defaultProps: {
        horizontalSpacing: 'md',
        verticalSpacing: 'sm',
      },
      styles: {
        tr: {
          transition: 'background-color 120ms ease',
        },
      },
    },
    Badge: {
      styles: {
        root: {
          transition: 'background-color 120ms ease',
        },
      },
    },
    Anchor: {
      styles: {
        root: {
          transition: 'color 120ms ease',
        },
      },
    },
  },
});

export { theme };
