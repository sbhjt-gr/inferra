export const Fonts = {
  inter: {
    300: 'Inter-Light',
    400: 'Inter-Regular',
    500: 'Inter-Medium',
    600: 'Inter-SemiBold', 
    700: 'Inter-Bold',
    800: 'Inter-ExtraBold',
  }
};

export const fontWeights = {
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export const getFontFamily = (weight: keyof typeof fontWeights = 'normal') => {
  return Fonts.inter[fontWeights[weight] as keyof typeof Fonts.inter];
}; 