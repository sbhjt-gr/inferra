export const Fonts = {
  openSans: {
    '300': 'OpenSans-Light',
    '400': 'OpenSans-Regular',
    '500': 'OpenSans-Medium',
    '600': 'OpenSans-SemiBold', 
    '700': 'OpenSans-Bold',
    '800': 'OpenSans-ExtraBold',
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
  return Fonts.openSans[fontWeights[weight]];
}; 
