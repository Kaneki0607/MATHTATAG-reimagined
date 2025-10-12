import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useGridContainer, useGridItem, useResponsive } from '../hooks/useResponsive';

interface GridContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const GridContainer: React.FC<GridContainerProps> = ({ children, style }) => {
  const containerStyle = useGridContainer();
  
  return (
    <View style={[containerStyle, style]}>
      {children}
    </View>
  );
};

interface GridItemProps {
  children: React.ReactNode;
  xs?: number;
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
  offset?: number;
  style?: StyleProp<ViewStyle>;
}

export const GridItem: React.FC<GridItemProps> = ({
  children,
  xs = 4,
  sm = 4,
  md = 4,
  lg = 4,
  xl = 4,
  offset = 0,
  style
}) => {
  const responsive = useResponsive();
  
  // Determine span based on current breakpoint
  let span = xs;
  if (responsive.breakpoint === 'xl') span = xl;
  else if (responsive.breakpoint === 'lg') span = lg;
  else if (responsive.breakpoint === 'md') span = md;
  else if (responsive.breakpoint === 'sm') span = sm;
  
  const itemStyle = useGridItem(span, offset);
  
  return (
    <View style={[itemStyle, style]}>
      {children}
    </View>
  );
};

interface ResponsiveCardsProps {
  children: React.ReactNode;
  cardsPerRow?: {
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  style?: StyleProp<ViewStyle>;
}

export const ResponsiveCards: React.FC<ResponsiveCardsProps> = ({
  children,
  cardsPerRow = { xs: 1, sm: 1, md: 2, lg: 3, xl: 4 },
  style
}) => {
  const responsive = useResponsive();
  
  const columns = responsive.breakpoint === 'xl' ? (cardsPerRow.xl ?? 4)
    : responsive.breakpoint === 'lg' ? (cardsPerRow.lg ?? 3)
    : responsive.breakpoint === 'md' ? (cardsPerRow.md ?? 2)
    : responsive.breakpoint === 'sm' ? (cardsPerRow.sm ?? 1)
    : (cardsPerRow.xs ?? 1);

  const cardWidth = `${(100 / columns)}%`;

  return (
    <View style={[{
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -responsive.gutter / 2,
    }, style]}>
      {React.Children.map(children, (child) => (
        <View style={{
          width: cardWidth,
          paddingHorizontal: responsive.gutter / 2,
          marginBottom: responsive.gutter * 2,
        }}>
          {child}
        </View>
      ))}
    </View>
  );
};

