import { useMemo } from 'react';
import { Fonts, fontWeights } from '../constants/fonts';

type FontWeight = keyof typeof fontWeights;

export const InterFont = () => {
  const getInterFont = useMemo(() => {
    return (weight: FontWeight = 'normal') => {
      const fontFamily = Fonts.inter[fontWeights[weight] as keyof typeof Fonts.inter];
      return { fontFamily };
    };
  }, []);

  return {
    getInterFont,
    fonts: {
      light: { fontFamily: 'Inter-Light' },
      regular: { fontFamily: 'Inter-Regular' },
      medium: { fontFamily: 'Inter-Medium' },
      semibold: { fontFamily: 'Inter-SemiBold' },
      bold: { fontFamily: 'Inter-Bold' },
      extrabold: { fontFamily: 'Inter-ExtraBold' },
    }
  };
}; 