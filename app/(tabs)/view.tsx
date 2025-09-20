import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { listenToData, readData } from '../../lib/firebase-database';

interface TeacherData {
  name: string;
  school: string;
  profilePictureUrl: string;
  audioFileUrl: string;
  id: string;
  createdAt: string;
}

export default function ViewPage() {
  const [teachers, setTeachers] = useState<TeacherData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeachers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await readData('/teachers');
      
      if (error) {
        setError(error);
        return;
      }
      
      if (data) {
        // Convert object to array and sort by creation date
        const teachersArray = Object.values(data).sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setTeachers(teachersArray);
      } else {
        setTeachers([]);
      }
    } catch (err) {
      setError('Failed to fetch teachers data');
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTeachers();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchTeachers();
    
    // Set up real-time listener
    const unsubscribe = listenToData('/teachers', (data) => {
      if (data) {
        const teachersArray = Object.values(data).sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setTeachers(teachersArray);
        setLoading(false);
      } else {
        setTeachers([]);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const renderTeacher = ({ item }: { item: TeacherData }) => (
    <View style={styles.teacherCard}>
      <View style={styles.teacherHeader}>
        {item.profilePictureUrl ? (
          <Image source={{ uri: item.profilePictureUrl }} style={styles.profileImage} />
        ) : (
          <View style={styles.placeholderImage}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}
        <View style={styles.teacherInfo}>
          <Text style={styles.teacherName}>{item.name}</Text>
          <Text style={styles.schoolName}>{item.school}</Text>
          {item.audioFileUrl && (
            <Text style={styles.audioIndicator}>🎵 Audio file available</Text>
          )}
          <Text style={styles.createdDate}>
            Added: {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No Teachers Found</Text>
      <Text style={styles.emptySubtitle}>
        Add some teachers using the Test tab to see them here.
      </Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>Error Loading Data</Text>
      <Text style={styles.errorSubtitle}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={fetchTeachers}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && teachers.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading teachers...</Text>
      </View>
    );
  }

  if (error && teachers.length === 0) {
    return renderError();
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Teachers Database</Text>
        <Text style={styles.subtitle}>
          {teachers.length} teacher{teachers.length !== 1 ? 's' : ''} found
        </Text>
      </View>

      <FlatList
        data={teachers}
        renderItem={renderTeacher}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#007AFF']}
            tintColor="#007AFF"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  listContainer: {
    padding: 16,
  },
  teacherCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  teacherHeader: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  profileImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  placeholderImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e0e0e0',
    marginRight: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  teacherInfo: {
    flex: 1,
  },
  teacherName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  schoolName: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  createdDate: {
    fontSize: 14,
    color: '#999',
  },
  audioIndicator: {
    fontSize: 14,
    color: '#28a745',
    fontWeight: '500',
    marginBottom: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e74c3c',
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
});
