import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'largeDesktop';
export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface ResponsiveConfig {
  deviceType: DeviceType;
  breakpoint: Breakpoint;
  columns: number;
  gutter: number;
  margin: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isLargeDesktop: boolean;
  width: number;
  height: number;
  scale: (size: number) => number;
  fontSize: (size: number) => number;
  spacing: (multiplier: number) => number;
  getGridItemWidth: (span: number) => number | string;
}

// Breakpoint definitions
const BREAKPOINTS = {
  xs: 0,    // Mobile small
  sm: 480,  // Mobile large
  md: 768,  // Tablet
  lg: 1024, // Desktop
  xl: 1440, // Large desktop
};

export function useResponsive(): ResponsiveConfig {
  const { width, height } = useWindowDimensions();

  const config = useMemo(() => {
    // Determine device type and breakpoint
    let deviceType: DeviceType = 'mobile';
    let breakpoint: Breakpoint = 'xs';
    let columns = 4;
    let gutter = 12;
    let margin = 16;

    if (width >= BREAKPOINTS.xl) {
      deviceType = 'largeDesktop';
      breakpoint = 'xl';
      columns = 12;
      gutter = 24;
      margin = 48;
    } else if (width >= BREAKPOINTS.lg) {
      deviceType = 'desktop';
      breakpoint = 'lg';
      columns = 12;
      gutter = 20;
      margin = 40;
    } else if (width >= BREAKPOINTS.md) {
      deviceType = 'tablet';
      breakpoint = 'md';
      columns = 8;
      gutter = 16;
      margin = 24;
    } else if (width >= BREAKPOINTS.sm) {
      deviceType = 'mobile';
      breakpoint = 'sm';
      columns = 4;
      gutter = 12;
      margin = 16;
    } else {
      deviceType = 'mobile';
      breakpoint = 'xs';
      columns = 4;
      gutter = 8;
      margin = 12;
    }

    // Helper functions
    const scale = (size: number): number => {
      const baseWidth = 375; // iPhone X base width
      return Math.round((width / baseWidth) * size);
    };

    const fontSize = (size: number): number => {
      const scaleFactor = Math.min(width / 375, 1.5); // Cap at 1.5x
      return Math.round(size * scaleFactor);
    };

    const spacing = (multiplier: number): number => {
      const baseSpacing = 8;
      return baseSpacing * multiplier;
    };

    const getGridItemWidth = (span: number): number | string => {
      if (span > columns) span = columns;
      const totalGutters = columns - 1;
      const availableWidth = width - (margin * 2) - (totalGutters * gutter);
      const columnWidth = availableWidth / columns;
      const itemGutters = span - 1;
      return columnWidth * span + itemGutters * gutter;
    };

    return {
      deviceType,
      breakpoint,
      columns,
      gutter,
      margin,
      isMobile: deviceType === 'mobile',
      isTablet: deviceType === 'tablet',
      isDesktop: deviceType === 'desktop',
      isLargeDesktop: deviceType === 'largeDesktop',
      width,
      height,
      scale,
      fontSize,
      spacing,
      getGridItemWidth,
    };
  }, [width, height]);

  return config;
}

// Grid container helper
export function useGridContainer() {
  const responsive = useResponsive();
  
  return {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    marginHorizontal: -responsive.gutter / 2,
    paddingHorizontal: responsive.margin,
  };
}

// Grid item helper
export function useGridItem(span: number = 1, offset: number = 0) {
  const responsive = useResponsive();
  
  const itemWidth = useMemo(() => {
    const totalSpan = Math.min(span, responsive.columns);
    const percentage = (totalSpan / responsive.columns) * 100;
    return `${percentage}%`;
  }, [span, responsive.columns]);

  const offsetWidth = useMemo(() => {
    if (offset === 0) return 0;
    const percentage = (Math.min(offset, responsive.columns) / responsive.columns) * 100;
    return `${percentage}%`;
  }, [offset, responsive.columns]);

  return {
    width: itemWidth,
    marginLeft: offsetWidth,
    paddingHorizontal: responsive.gutter / 2,
    marginBottom: responsive.gutter,
  };
}

// Responsive value selector
export function useResponsiveValue<T>(values: {
  xs?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  default: T;
}): T {
  const { breakpoint } = useResponsive();
  
  // Return most specific matching value
  if (breakpoint === 'xl' && values.xl !== undefined) return values.xl;
  if ((breakpoint === 'xl' || breakpoint === 'lg') && values.lg !== undefined) return values.lg;
  if ((breakpoint === 'xl' || breakpoint === 'lg' || breakpoint === 'md') && values.md !== undefined) return values.md;
  if (values.sm !== undefined && breakpoint !== 'xs') return values.sm;
  if (values.xs !== undefined) return values.xs;
  
  return values.default;
}

// Card grid helper - common pattern for dashboard cards
export function useCardGrid(cardsPerRow?: { xs?: number; sm?: number; md?: number; lg?: number; xl?: number }) {
  const responsive = useResponsive();
  
  const columns = useResponsiveValue({
    xs: cardsPerRow?.xs ?? 1,
    sm: cardsPerRow?.sm ?? 1,
    md: cardsPerRow?.md ?? 2,
    lg: cardsPerRow?.lg ?? 3,
    xl: cardsPerRow?.xl ?? 4,
    default: 1,
  });

  const cardWidth = useMemo(() => {
    const percentage = (1 / columns) * 100;
    return `${percentage}%`;
  }, [columns]);

  return {
    containerStyle: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      marginHorizontal: -responsive.gutter / 2,
    },
    cardStyle: {
      width: cardWidth,
      paddingHorizontal: responsive.gutter / 2,
      marginBottom: responsive.gutter * 2,
    },
  };
}

