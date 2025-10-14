import React from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { ResponsiveButton, ResponsiveCard, ResponsiveGrid, ResponsiveText } from './ResponsiveComponents';

// Responsive Dashboard Layout Component
interface ResponsiveDashboardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  showHeader?: boolean;
  padding?: boolean;
}

export const ResponsiveDashboard: React.FC<ResponsiveDashboardProps> = ({
  children,
  title,
  subtitle,
  actions,
  showHeader = true,
  padding = true,
}) => {
  const layout = useResponsiveLayout();
  
  return (
    <View style={styles.dashboardContainer}>
      {showHeader && (title || subtitle || actions) && (
        <View style={[
          styles.header,
          {
            paddingHorizontal: padding ? layout.containerPadding : 0,
            paddingTop: layout.safeAreaAdjustments.top,
            height: layout.headerHeight + layout.safeAreaAdjustments.top,
          }
        ]}>
          <View style={styles.headerContent}>
            <View style={styles.headerText}>
              {title && (
                <ResponsiveText type="title" weight="bold" style={styles.title}>
                  {title}
                </ResponsiveText>
              )}
              {subtitle && (
                <ResponsiveText type="body" color="#64748b" style={styles.subtitle}>
                  {subtitle}
                </ResponsiveText>
              )}
            </View>
            {actions && (
              <View style={styles.headerActions}>
                {actions}
              </View>
            )}
          </View>
        </View>
      )}
      
      <ScrollView 
        style={styles.content}
        contentContainerStyle={[
          styles.contentContainer,
          {
            paddingHorizontal: padding ? layout.containerPadding : 0,
            paddingBottom: layout.bottomNavHeight + layout.safeAreaAdjustments.bottom,
          }
        ]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
};

// Responsive Section Component
interface ResponsiveSectionProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  columns?: number;
  style?: any;
}

export const ResponsiveSection: React.FC<ResponsiveSectionProps> = ({
  children,
  title,
  subtitle,
  actions,
  columns,
  style,
}) => {
  const layout = useResponsiveLayout();
  
  return (
    <View style={[styles.section, { marginBottom: layout.sectionSpacing }, style]}>
      {(title || subtitle || actions) && (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionText}>
            {title && (
              <ResponsiveText type="subtitle" weight="semibold" style={styles.sectionTitle}>
                {title}
              </ResponsiveText>
            )}
            {subtitle && (
              <ResponsiveText type="body" color="#64748b" style={styles.sectionSubtitle}>
                {subtitle}
              </ResponsiveText>
            )}
          </View>
          {actions && (
            <View style={styles.sectionActions}>
              {actions}
            </View>
          )}
        </View>
      )}
      
      {columns ? (
        <ResponsiveGrid columns={columns}>
          {children}
        </ResponsiveGrid>
      ) : (
        <View style={styles.sectionContent}>
          {children}
        </View>
      )}
    </View>
  );
};

// Responsive Stats Grid Component
interface ResponsiveStatsGridProps {
  stats: Array<{
    title: string;
    value: string | number;
    subtitle?: string;
    color?: string;
    icon?: React.ReactNode;
  }>;
  columns?: number;
}

export const ResponsiveStatsGrid: React.FC<ResponsiveStatsGridProps> = ({
  stats,
  columns,
}) => {
  const layout = useResponsiveLayout();
  const statsColumns = columns || layout.cardsPerRow;
  
  return (
    <ResponsiveGrid columns={statsColumns}>
      {stats.map((stat, index) => (
        <ResponsiveCard key={index} style={styles.statCard}>
          <View style={styles.statContent}>
            {stat.icon && (
              <View style={[styles.statIcon, { backgroundColor: stat.color + '20' }]}>
                {stat.icon}
              </View>
            )}
            <View style={styles.statText}>
              <ResponsiveText type="title" weight="bold" color={stat.color}>
                {stat.value}
              </ResponsiveText>
              <ResponsiveText type="body" weight="medium">
                {stat.title}
              </ResponsiveText>
              {stat.subtitle && (
                <ResponsiveText type="caption" color="#64748b">
                  {stat.subtitle}
                </ResponsiveText>
              )}
            </View>
          </View>
        </ResponsiveCard>
      ))}
    </ResponsiveGrid>
  );
};

// Responsive Navigation Component
interface ResponsiveNavigationProps {
  tabs: Array<{
    key: string;
    label: string;
    icon?: React.ReactNode;
  }>;
  activeTab: string;
  onTabChange: (key: string) => void;
  style?: any;
}

export const ResponsiveNavigation: React.FC<ResponsiveNavigationProps> = ({
  tabs,
  activeTab,
  onTabChange,
  style,
}) => {
  const layout = useResponsiveLayout();
  
  return (
    <View style={[
      styles.navigation,
      {
        height: layout.bottomNavHeight,
        paddingBottom: layout.safeAreaAdjustments.bottom,
      },
      style
    ]}>
      {tabs.map((tab) => (
        <ResponsiveButton
          key={tab.key}
          title={tab.label}
          onPress={() => onTabChange(tab.key)}
          variant={activeTab === tab.key ? 'primary' : 'ghost'}
          size="medium"
          style={styles.navButton}
        />
      ))}
    </View>
  );
};

// Responsive Modal Container
interface ResponsiveModalContainerProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  fullScreen?: boolean;
  maxWidth?: number;
}

export const ResponsiveModalContainer: React.FC<ResponsiveModalContainerProps> = ({
  visible,
  onClose,
  children,
  title,
  fullScreen = false,
  maxWidth,
}) => {
  const layout = useResponsiveLayout();
  
  const modalStyle = {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: fullScreen ? 0 : 32,
    borderTopRightRadius: fullScreen ? 0 : 32,
    width: '100%',
    maxWidth: maxWidth || layout.modalMaxWidth,
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
        <View style={modalStyle}>
          {title && (
            <View style={styles.modalHeader}>
              <ResponsiveText type="title" weight="bold">
                {title}
              </ResponsiveText>
              <ResponsiveButton
                title="✕"
                onPress={onClose}
                variant="ghost"
                size="small"
                style={styles.closeButton}
              />
            </View>
          )}
          {children}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  dashboardContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
  },
  headerText: {
    flex: 1,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    // Additional subtitle styles if needed
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 16,
  },
  section: {
    // Section styles
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionText: {
    flex: 1,
  },
  sectionTitle: {
    marginBottom: 4,
  },
  sectionSubtitle: {
    // Additional subtitle styles if needed
  },
  sectionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionContent: {
    // Section content styles
  },
  statCard: {
    // Stat card styles
  },
  statContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statText: {
    flex: 1,
  },
  navigation: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navButton: {
    flex: 1,
    marginHorizontal: 4,
  },
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
    width: 32,
    height: 32,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});
