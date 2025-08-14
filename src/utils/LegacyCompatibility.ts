import { ViewStyle } from 'react-native';

export const createLegacyGapStyles = (
  gapSize: number,
  direction: 'row' | 'column' = 'row'
): {
  container: ViewStyle;
  child: ViewStyle;
  firstChild: ViewStyle;
  lastChild: ViewStyle;
} => {
  const marginProperty = direction === 'row' ? 'marginRight' : 'marginBottom';
  const negativeMarginProperty = direction === 'row' ? 'marginLeft' : 'marginTop';
  
  return {
    container: {
      [negativeMarginProperty]: -gapSize / 2,
      [`margin${direction === 'row' ? 'Right' : 'Bottom'}`]: -gapSize / 2,
    },
    child: {
      [negativeMarginProperty]: gapSize / 2,
      [marginProperty]: gapSize / 2,
    },
    firstChild: {
      [negativeMarginProperty]: gapSize / 2,
      [marginProperty]: gapSize / 2,
    },
    lastChild: {
      [negativeMarginProperty]: gapSize / 2,
      [marginProperty]: 0,
    }
  };
};

export const getFlexGapStyle = (
  gapSize: number, 
  direction: 'row' | 'column' = 'row'
): ViewStyle => {
  if (direction === 'row') {
    return {
      paddingRight: gapSize / 2,
      paddingLeft: gapSize / 2,
      marginHorizontal: -gapSize / 2,
    };
  } else {
    return {
      paddingTop: gapSize / 2,
      paddingBottom: gapSize / 2,
      marginVertical: -gapSize / 2,
    };
  }
};