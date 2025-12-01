import { useMemo } from 'react';
import { Dimensions, Platform, useWindowDimensions } from 'react-native';
import { useResponsive } from './useResponsive';

export interface ResponsiveLayoutConfig {
  // Container layouts
  containerPadding: number;
  sectionSpacing: number;
  cardSpacing: number;
  
  // Typography
  titleFontSize: number;
  subtitleFontSize: number;
  bodyFontSize: number;
  captionFontSize: number;
  
  // Component sizes
  iconSize: number;
  buttonHeight: number;
  inputHeight: number;
  avatarSize: number;
  
  // Modal dimensions
  modalMaxWidth: number;
  modalPadding: number;
  
  // Grid layouts
  cardsPerRow: number;
  gridGap: number;
  
  // Navigation
  bottomNavHeight: number;
  headerHeight: number;
  
  // Screen-specific adjustments
  isLandscape: boolean;
  screenRatio: number;
  safeAreaAdjustments: {
    top: number;
    bottom: number;
    horizontal: number;
  };
}

export function useResponsiveLayout(): ResponsiveLayoutConfig {
  const { width, height } = useWindowDimensions();
  const responsive = useResponsive();
  
  return useMemo(() => {
    const isLandscape = width > height;
    const screenRatio = width / height;
    
    // Base dimensions for iPhone X (375x812)
    const baseWidth = 375;
    const baseHeight = 812;
    
    // Scale factors
    const widthScale = width / baseWidth;
    const heightScale = height / baseHeight;
    const scale = Math.min(widthScale, heightScale);
    
    // Device-specific adjustments
    const isTablet = responsive.isTablet;
    const isDesktop = responsive.isDesktop;
    const isLargeDesktop = responsive.isLargeDesktop;
    
    // Container layouts
    const containerPadding = responsive.isMobile 
      ? responsive.spacing(2) 
      : responsive.spacing(3);
    
    const sectionSpacing = responsive.isMobile 
      ? responsive.spacing(4) 
      : responsive.spacing(6);
    
    const cardSpacing = responsive.isMobile 
      ? responsive.spacing(3) 
      : responsive.spacing(4);
    
    // Typography - responsive font sizes
    const titleFontSize = responsive.fontSize(isDesktop ? 28 : isTablet ? 24 : 20);
    const subtitleFontSize = responsive.fontSize(isDesktop ? 20 : isTablet ? 18 : 16);
    const bodyFontSize = responsive.fontSize(isDesktop ? 16 : isTablet ? 15 : 14);
    const captionFontSize = responsive.fontSize(isDesktop ? 14 : isTablet ? 13 : 12);
    
    // Component sizes
    const iconSize = responsive.scale(isDesktop ? 32 : isTablet ? 28 : 24);
    const buttonHeight = responsive.scale(isDesktop ? 56 : isTablet ? 52 : 48);
    const inputHeight = responsive.scale(isDesktop ? 56 : isTablet ? 52 : 48);
    const avatarSize = responsive.scale(isDesktop ? 80 : isTablet ? 64 : 48);
    
    // Modal dimensions
    const modalMaxWidth = responsive.isDesktop ? Math.min(width * 0.8, 600) : width;
    const modalPadding = responsive.isMobile 
      ? responsive.spacing(4) 
      : responsive.spacing(6);
    
    // Grid layouts
    const cardsPerRow = isLargeDesktop ? 4 : isDesktop ? 3 : isTablet ? 2 : 1;
    const gridGap = responsive.gutter;
    
    // Navigation
    const bottomNavHeight = responsive.scale(Platform.OS === 'ios' ? 90 : 70);
    const headerHeight = responsive.scale(Platform.OS === 'ios' ? 100 : 80);
    
    // Safe area adjustments
    const safeAreaAdjustments = {
      top: responsive.scale(Platform.OS === 'ios' ? 44 : 24),
      bottom: responsive.scale(Platform.OS === 'ios' ? 34 : 16),
      horizontal: responsive.spacing(2),
    };
    
    return {
      containerPadding,
      sectionSpacing,
      cardSpacing,
      titleFontSize,
      subtitleFontSize,
      bodyFontSize,
      captionFontSize,
      iconSize,
      buttonHeight,
      inputHeight,
      avatarSize,
      modalMaxWidth,
      modalPadding,
      cardsPerRow,
      gridGap,
      bottomNavHeight,
      headerHeight,
      isLandscape,
      screenRatio,
      safeAreaAdjustments,
    };
  }, [width, height, responsive]);
}

// Helper function for responsive styles
export function createResponsiveStyles<T extends Record<string, any>>(
  styleFactory: (layout: ResponsiveLayoutConfig) => T
): T {
  // This will be called in the component where useResponsiveLayout is available
  return {} as T;
}

// Platform-specific adjustments
export function usePlatformAdjustments() {
  return useMemo(() => {
    const { width, height } = Dimensions.get('window');
    
    return {
      // iOS specific adjustments
      ios: {
        statusBarHeight: 44,
        homeIndicatorHeight: 34,
        notchHeight: 44,
        safeAreaTop: 44,
        safeAreaBottom: 34,
      },
      // Android specific adjustments
      android: {
        statusBarHeight: 24,
        navigationBarHeight: 48,
        safeAreaTop: 24,
        safeAreaBottom: 16,
      },
      // Web specific adjustments
      web: {
        minWidth: 320,
        maxWidth: 1440,
        sidebarWidth: 280,
        headerHeight: 64,
      },
    };
  }, []);
}

// Responsive breakpoint utilities
export function useBreakpoint() {
  const { width } = useWindowDimensions();
  
  return useMemo(() => ({
    isXs: width < 480,
    isSm: width >= 480 && width < 768,
    isMd: width >= 768 && width < 1024,
    isLg: width >= 1024 && width < 1440,
    isXl: width >= 1440,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
  }), [width]);
}

// Responsive value selector with more options
export function useResponsiveValue<T>(values: {
  xs?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  mobile?: T;
  tablet?: T;
  desktop?: T;
  default: T;
}): T {
  const breakpoint = useBreakpoint();
  
  // Return most specific matching value
  if (breakpoint.isXl && values.xl !== undefined) return values.xl;
  if (breakpoint.isLg && values.lg !== undefined) return values.lg;
  if (breakpoint.isMd && values.md !== undefined) return values.md;
  if (breakpoint.isSm && values.sm !== undefined) return values.sm;
  if (breakpoint.isXs && values.xs !== undefined) return values.xs;
  
  // Device type fallbacks
  if (breakpoint.isDesktop && values.desktop !== undefined) return values.desktop;
  if (breakpoint.isTablet && values.tablet !== undefined) return values.tablet;
  if (breakpoint.isMobile && values.mobile !== undefined) return values.mobile;
  
  return values.default;
}
