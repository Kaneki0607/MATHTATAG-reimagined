# Responsive System Usage Examples

## Basic Usage

### 1. Using Responsive Hooks

```tsx
import React from 'react';
import { View, Text } from 'react-native';
import { useResponsiveLayout, useResponsiveValue } from '../hooks/useResponsiveLayout';

export const MyComponent = () => {
  const layout = useResponsiveLayout();
  
  const padding = useResponsiveValue({
    mobile: 16,
    tablet: 24,
    desktop: 32,
    default: 16,
  });
  
  return (
    <View style={{ padding }}>
      <Text style={{ fontSize: layout.titleFontSize }}>
        Responsive Title
      </Text>
    </View>
  );
};
```

### 2. Using Responsive Components

```tsx
import React from 'react';
import { ResponsiveContainer, ResponsiveCard, ResponsiveText, ResponsiveButton } from '../components/ResponsiveComponents';

export const MyDashboard = () => {
  return (
    <ResponsiveContainer>
      <ResponsiveCard>
        <ResponsiveText type="title" weight="bold">
          Dashboard Title
        </ResponsiveText>
        <ResponsiveText type="body">
          This is a responsive card with adaptive sizing.
        </ResponsiveText>
        <ResponsiveButton
          title="Action Button"
          onPress={() => console.log('Button pressed')}
          variant="primary"
        />
      </ResponsiveCard>
    </ResponsiveContainer>
  );
};
```

### 3. Using Responsive Grid

```tsx
import React from 'react';
import { ResponsiveGrid, ResponsiveCard } from '../components/ResponsiveComponents';

export const MyGrid = () => {
  return (
    <ResponsiveGrid columns={3}>
      <ResponsiveCard>
        <Text>Card 1</Text>
      </ResponsiveCard>
      <ResponsiveCard>
        <Text>Card 2</Text>
      </ResponsiveCard>
      <ResponsiveCard>
        <Text>Card 3</Text>
      </ResponsiveCard>
    </ResponsiveGrid>
  );
};
```

### 4. Using Responsive Modal

```tsx
import React, { useState } from 'react';
import { ResponsiveModal, ResponsiveInput } from '../components/ResponsiveComponents';

export const MyModal = () => {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');
  
  return (
    <ResponsiveModal
      visible={visible}
      onClose={() => setVisible(false)}
      title="My Modal"
    >
      <ResponsiveInput
        value={text}
        onChangeText={setText}
        placeholder="Enter text..."
        multiline
      />
    </ResponsiveModal>
  );
};
```

## Dashboard Integration

### Complete Responsive Dashboard

```tsx
import React from 'react';
import { ResponsiveDashboard, ResponsiveSection, ResponsiveStatsGrid } from '../components/ResponsiveDashboard';

export const MyResponsiveDashboard = () => {
  const stats = [
    {
      title: 'Total Users',
      value: '1,234',
      color: '#3b82f6',
      icon: <UserIcon />
    },
    {
      title: 'Active Sessions',
      value: '567',
      color: '#10b981',
      icon: <ActivityIcon />
    }
  ];
  
  return (
    <ResponsiveDashboard 
      title="My Dashboard"
      subtitle="Overview and analytics"
    >
      <ResponsiveSection title="Statistics" columns={2}>
        <ResponsiveStatsGrid stats={stats} />
      </ResponsiveSection>
      
      <ResponsiveSection title="Recent Activity">
        {/* Your content here */}
      </ResponsiveSection>
    </ResponsiveDashboard>
  );
};
```

## Migration from Fixed Layouts

### Before (Fixed Layout)
```tsx
const styles = StyleSheet.create({
  container: {
    padding: 20,
    margin: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  button: {
    height: 48,
    paddingHorizontal: 16,
  },
});

export const OldComponent = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Title</Text>
      <TouchableOpacity style={styles.button}>
        <Text>Button</Text>
      </TouchableOpacity>
    </View>
  );
};
```

### After (Responsive Layout)
```tsx
export const NewComponent = () => {
  const layout = useResponsiveLayout();
  
  return (
    <ResponsiveContainer>
      <ResponsiveText type="title" weight="bold">
        Title
      </ResponsiveText>
      <ResponsiveButton
        title="Button"
        onPress={() => {}}
        variant="primary"
      />
    </ResponsiveContainer>
  );
};
```

## Common Patterns

### 1. Conditional Rendering Based on Device
```tsx
const layout = useResponsiveLayout();

return (
  <View>
    {layout.isMobile ? (
      <MobileLayout />
    ) : (
      <DesktopLayout />
    )}
  </View>
);
```

### 2. Dynamic Spacing
```tsx
const spacing = useResponsiveValue({
  mobile: 8,
  tablet: 12,
  desktop: 16,
  default: 8,
});

return (
  <View style={{ marginBottom: spacing }}>
    <Text>Content</Text>
  </View>
);
```

### 3. Responsive Font Sizes
```tsx
const layout = useResponsiveLayout();

return (
  <Text style={{ fontSize: layout.titleFontSize }}>
    Responsive Title
  </Text>
);
```

### 4. Grid with Dynamic Columns
```tsx
const layout = useResponsiveLayout();

return (
  <ResponsiveGrid columns={layout.cardsPerRow}>
    {items.map(item => (
      <ItemCard key={item.id} item={item} />
    ))}
  </ResponsiveGrid>
);
```

## Best Practices

1. **Always use responsive components** instead of creating custom layouts
2. **Use `useResponsiveValue`** for device-specific values
3. **Test on multiple screen sizes** during development
4. **Leverage the responsive grid system** for consistent layouts
5. **Use semantic component names** (ResponsiveText, ResponsiveButton, etc.)
6. **Keep responsive logic in hooks** rather than in component logic
7. **Use the responsive dashboard components** for full-page layouts

## Troubleshooting

### Common Issues

1. **Platform import missing**: Make sure `Platform` is imported from 'react-native' in responsive hooks
2. **Modal not responsive**: Use `ResponsiveModal` or `ResponsiveModalContainer` instead of regular Modal
3. **Text not scaling**: Use `ResponsiveText` component instead of regular Text
4. **Buttons too small/large**: Use `ResponsiveButton` component with proper sizing
5. **Grid not working**: Ensure you're using `ResponsiveGrid` with proper column configuration

### Performance Tips

1. The responsive hooks use `useMemo` for optimal performance
2. Components are memoized to prevent unnecessary re-renders
3. Use `useResponsiveValue` for simple value selection
4. Avoid creating responsive styles in render methods
