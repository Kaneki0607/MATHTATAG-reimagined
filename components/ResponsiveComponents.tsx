import React from 'react';
import { Modal, StyleSheet, Text, TextInput, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

// Responsive Container Component
interface ResponsiveContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: boolean;
  margin?: boolean;
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  style,
  padding = true,
  margin = true,
}) => {
  const layout = useResponsiveLayout();
  
  const containerStyle = {
    paddingHorizontal: padding ? layout.containerPadding : 0,
    marginHorizontal: margin ? layout.sectionSpacing : 0,
  };
  
  return (
    <View style={[containerStyle, style]}>
      {children}
    </View>
  );
};

// Responsive Card Component
interface ResponsiveCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  elevation?: boolean;
  rounded?: boolean;
}

export const ResponsiveCard: React.FC<ResponsiveCardProps> = ({
  children,
  style,
  elevation = true,
  rounded = true,
}) => {
  const layout = useResponsiveLayout();
  const responsive = useResponsive();
  
  const cardStyle = {
    backgroundColor: '#ffffff',
    borderRadius: rounded ? 16 : 0,
    padding: layout.cardSpacing,
    marginBottom: layout.cardSpacing,
    shadowColor: elevation ? '#000' : 'transparent',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: elevation ? 0.1 : 0,
    shadowRadius: elevation ? 4 : 0,
    elevation: elevation ? 3 : 0,
    borderWidth: responsive.isDesktop ? 1 : 0,
    borderColor: '#f1f5f9',
  };
  
  return (
    <View style={[cardStyle, style]}>
      {children}
    </View>
  );
};

// Responsive Text Component
interface ResponsiveTextProps {
  children: React.ReactNode;
  type?: 'title' | 'subtitle' | 'body' | 'caption';
  style?: TextStyle;
  color?: string;
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  align?: 'left' | 'center' | 'right';
}

export const ResponsiveText: React.FC<ResponsiveTextProps> = ({
  children,
  type = 'body',
  style,
  color = '#1e293b',
  weight = 'normal',
  align = 'left',
}) => {
  const layout = useResponsiveLayout();
  
  const getFontSize = () => {
    switch (type) {
      case 'title': return layout.titleFontSize;
      case 'subtitle': return layout.subtitleFontSize;
      case 'body': return layout.bodyFontSize;
      case 'caption': return layout.captionFontSize;
      default: return layout.bodyFontSize;
    }
  };
  
  const getFontWeight = () => {
    switch (weight) {
      case 'medium': return '500';
      case 'semibold': return '600';
      case 'bold': return '700';
      default: return '400';
    }
  };
  
  const textStyle = {
    fontSize: getFontSize(),
    fontWeight: getFontWeight(),
    color,
    textAlign: align,
    lineHeight: getFontSize() * 1.4,
  };
  
  return (
    <Text style={[textStyle, style]}>
      {children}
    </Text>
  );
};

// Responsive Button Component
interface ResponsiveButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export const ResponsiveButton: React.FC<ResponsiveButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}) => {
  const layout = useResponsiveLayout();
  const responsive = useResponsive();
  
  const getButtonStyle = () => {
    const baseStyle = {
      height: layout.buttonHeight,
      borderRadius: 12,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: responsive.spacing(4),
      gap: responsive.spacing(2),
    };
    
    switch (variant) {
      case 'primary':
        return {
          ...baseStyle,
          backgroundColor: disabled ? '#94a3b8' : '#3b82f6',
        };
      case 'secondary':
        return {
          ...baseStyle,
          backgroundColor: disabled ? '#f1f5f9' : '#64748b',
        };
      case 'outline':
        return {
          ...baseStyle,
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: disabled ? '#e2e8f0' : '#3b82f6',
        };
      case 'ghost':
        return {
          ...baseStyle,
          backgroundColor: 'transparent',
        };
      default:
        return baseStyle;
    }
  };
  
  const getTextColor = () => {
    if (variant === 'outline' || variant === 'ghost') {
      return disabled ? '#94a3b8' : '#3b82f6';
    }
    return '#ffffff';
  };
  
  const buttonStyle = getButtonStyle();
  const textColor = getTextColor();
  
  return (
    <TouchableOpacity
      style={[buttonStyle, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {icon}
      <ResponsiveText
        type="body"
        weight="medium"
        color={textColor}
        style={textStyle}
      >
        {title}
      </ResponsiveText>
    </TouchableOpacity>
  );
};

// Responsive Grid Component
interface ResponsiveGridProps {
  children: React.ReactNode;
  columns?: number;
  spacing?: number;
  style?: ViewStyle;
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  columns,
  spacing,
  style,
}) => {
  const layout = useResponsiveLayout();
  const responsive = useResponsive();
  
  const gridColumns = columns || layout.cardsPerRow;
  const gridSpacing = spacing || layout.gridGap;
  
  const gridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    marginHorizontal: -gridSpacing / 2,
  };
  
  const itemStyle = {
    width: `${100 / gridColumns}%`,
    paddingHorizontal: gridSpacing / 2,
    marginBottom: gridSpacing,
  };
  
  return (
    <View style={[gridStyle, style]}>
      {React.Children.map(children, (child, index) => (
        <View key={index} style={itemStyle}>
          {child}
        </View>
      ))}
    </View>
  );
};

// Responsive Modal Component
interface ResponsiveModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  fullScreen?: boolean;
  style?: ViewStyle;
}

export const ResponsiveModal: React.FC<ResponsiveModalProps> = ({
  visible,
  onClose,
  children,
  title,
  fullScreen = false,
  style,
}) => {
  const layout = useResponsiveLayout();
  const responsive = useResponsive();
  
  const modalStyle = {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: fullScreen ? 0 : 32,
    borderTopRightRadius: fullScreen ? 0 : 32,
    width: '100%',
    maxWidth: layout.modalMaxWidth,
    maxHeight: fullScreen ? '100%' : '95%',
    minHeight: fullScreen ? '100%' : '80%',
    padding: layout.modalPadding,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  };
  
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[modalStyle, style]}>
          {title && (
            <View style={styles.modalHeader}>
              <ResponsiveText type="title" weight="bold">
                {title}
              </ResponsiveText>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <ResponsiveText type="body" color="#64748b">✕</ResponsiveText>
              </TouchableOpacity>
            </View>
          )}
          {children}
        </View>
      </View>
    </Modal>
  );
};

// Responsive Input Component
interface ResponsiveInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numberOfLines?: number;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
}

export const ResponsiveInput: React.FC<ResponsiveInputProps> = ({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  numberOfLines = 1,
  style,
  textStyle,
  disabled = false,
}) => {
  const layout = useResponsiveLayout();
  const responsive = useResponsive();
  
  const inputStyle = {
    height: multiline ? layout.inputHeight * 2 : layout.inputHeight,
    backgroundColor: disabled ? '#f8fafc' : '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: responsive.spacing(3),
    paddingVertical: responsive.spacing(2),
    fontSize: layout.bodyFontSize,
    color: '#1e293b',
    textAlignVertical: multiline ? 'top' as const : 'center' as const,
  };
  
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      multiline={multiline}
      numberOfLines={numberOfLines}
      style={[inputStyle, style, textStyle]}
      editable={!disabled}
    />
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  closeButton: {
    padding: 8,
  },
});
