export const BREAKPOINTS = {
  PHONE: 480,
  TABLET: 768,
  LARGE_TABLET: 1024
} as const;

export const RESPONSIVE_SPACING = {
  PHONE: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32
  },
  TABLET: {
    xs: 6,
    sm: 12,
    md: 24,
    lg: 36,
    xl: 48
  }
} as const;

export const RESPONSIVE_GRID = {
  PHONE: {
    COLUMNS: 1,
    GAP: 12
  },
  LARGE_PHONE: {
    COLUMNS: 1,
    GAP: 16
  },
  TABLET: {
    COLUMNS: 2,
    GAP: 20
  }
} as const;