import { useMemo } from 'react';
import { Fonts, fontWeights } from '../constants/fonts';

type FontWeight = keyof typeof fontWeights;

export const OpenSansFont = () => {
  const getOpenSansFont = useMemo(() => {
    return (weight: FontWeight = 'normal') => {
      const fontFamily = Fonts.openSans[fontWeights[weight]];
      return { fontFamily };
    };
  }, []);

  return {
    getOpenSansFont,
    fonts: {
      light: { fontFamily: 'OpenSans-Light' },
      regular: { fontFamily: 'OpenSans-Regular' },
      medium: { fontFamily: 'OpenSans-Medium' },
      semibold: { fontFamily: 'OpenSans-SemiBold' },
      bold: { fontFamily: 'OpenSans-Bold' },
      extrabold: { fontFamily: 'OpenSans-ExtraBold' },
    }
  };
}; 
