import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { writeData } from '../../lib/firebase-database';
import { uploadFile } from '../../lib/firebase-storage';

interface TeacherData {
  name: string;
  school: string;
  profilePictureUrl: string;
  audioFileUrl: string;
  id: string;
  createdAt: string;
}

export default function TestPage() {
  const [teacherName, setTeacherName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setProfileImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
      console.error('Image picker error:', error);
    }
  };

  const pickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setAudioFile(result);
        Alert.alert('Success', `Audio file selected: ${result.assets[0].name}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick audio file');
      console.error('Audio picker error:', error);
    }
  };

  const uploadImageToFirebase = async (imageUri: string): Promise<string | null> => {
    try {
      setUploading(true);
      
      // Convert image URI to blob
      const response = await fetch(imageUri);
      const blob = await response.blob();
      
      // Generate unique filename
      const timestamp = Date.now();
      const filename = `teachers/images/${timestamp}_${Math.random().toString(36).substring(7)}.jpg`;
      
      // Upload to Firebase Storage
      const { downloadURL, error } = await uploadFile(filename, blob, {
        contentType: 'image/jpeg',
      });
      
      if (error) {
        throw new Error(error);
      }
      
      return downloadURL;
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Upload Error', 'Failed to upload image');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const uploadAudioToFirebase = async (audioUri: string, fileName: string): Promise<string | null> => {
    try {
      setUploading(true);
      
      // Convert audio URI to blob
      const response = await fetch(audioUri);
      const blob = await response.blob();
      
      // Generate unique filename
      const timestamp = Date.now();
      const fileExtension = fileName.split('.').pop() || 'mp3';
      const filename = `teachers/audio/${timestamp}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
      
      // Upload to Firebase Storage
      const { downloadURL, error } = await uploadFile(filename, blob, {
        contentType: 'audio/mpeg',
      });
      
      if (error) {
        throw new Error(error);
      }
      
      return downloadURL;
    } catch (error) {
      console.error('Audio upload error:', error);
      Alert.alert('Upload Error', 'Failed to upload audio file');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const saveTeacherData = async () => {
    if (!teacherName.trim() || !schoolName.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);
      
      let profilePictureUrl = '';
      let audioFileUrl = '';
      
      // Upload image if selected
      if (profileImage) {
        const uploadedUrl = await uploadImageToFirebase(profileImage);
        if (uploadedUrl) {
          profilePictureUrl = uploadedUrl;
        } else {
          Alert.alert('Error', 'Failed to upload image');
          return;
        }
      }

      // Upload audio if selected
      if (audioFile && !audioFile.canceled && audioFile.assets[0]) {
        const uploadedAudioUrl = await uploadAudioToFirebase(
          audioFile.assets[0].uri, 
          audioFile.assets[0].name
        );
        if (uploadedAudioUrl) {
          audioFileUrl = uploadedAudioUrl;
        } else {
          Alert.alert('Error', 'Failed to upload audio file');
          return;
        }
      }

      // Create teacher data object
      const teacherData: TeacherData = {
        name: teacherName.trim(),
        school: schoolName.trim(),
        profilePictureUrl,
        audioFileUrl,
        id: `teacher_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        createdAt: new Date().toISOString(),
      };

      // Save to Firebase Realtime Database
      const { success, error } = await writeData(`/teachers/${teacherData.id}`, teacherData);
      
      if (success) {
        Alert.alert('Success', 'Teacher data saved successfully to Firebase!');
        console.log('Teacher data saved to Firebase:', teacherData);
        console.log('Database path:', `/teachers/${teacherData.id}`);
        console.log('Image URL:', profilePictureUrl);
        console.log('Audio URL:', audioFileUrl);
        
        // Reset form
        setTeacherName('');
        setSchoolName('');
        setProfileImage(null);
        setAudioFile(null);
      } else {
        Alert.alert('Error', `Failed to save data: ${error}`);
        console.error('Database save error:', error);
      }
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Failed to save teacher data');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Teacher Profile Test</Text>
        <Text style={styles.subtitle}>Upload teacher information to Firebase</Text>

        {/* Teacher Name Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Teacher Name *</Text>
          <TextInput
            style={styles.input}
            value={teacherName}
            onChangeText={setTeacherName}
            placeholder="Enter teacher's name"
            placeholderTextColor="#999"
          />
        </View>

        {/* School Name Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>School Name *</Text>
          <TextInput
            style={styles.input}
            value={schoolName}
            onChangeText={setSchoolName}
            placeholder="Enter school name"
            placeholderTextColor="#999"
          />
        </View>

        {/* Profile Picture Section */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Profile Picture</Text>
          
          {profileImage ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: profileImage }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.changeImageButton}
                onPress={pickImage}
                disabled={uploading}
              >
                <Text style={styles.changeImageText}>Change Image</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.imagePickerButton}
              onPress={pickImage}
              disabled={uploading}
            >
              <Text style={styles.imagePickerText}>
                {uploading ? 'Uploading...' : 'Select Profile Picture'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Audio File Section */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Audio File (MP3)</Text>
          
          {audioFile && !audioFile.canceled && audioFile.assets[0] ? (
            <View style={styles.audioContainer}>
              <Text style={styles.audioFileName}>
                📁 {audioFile.assets[0].name}
              </Text>
              <Text style={styles.audioFileSize}>
                Size: {Math.round((audioFile.assets[0].size || 0) / 1024)} KB
              </Text>
              <TouchableOpacity
                style={styles.changeAudioButton}
                onPress={pickAudio}
                disabled={uploading}
              >
                <Text style={styles.changeAudioText}>Change Audio</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.audioPickerButton}
              onPress={pickAudio}
              disabled={uploading}
            >
              <Text style={styles.audioPickerText}>
                {uploading ? 'Uploading...' : 'Select Audio File (MP3)'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, (saving || uploading) && styles.disabledButton]}
          onPress={saveTeacherData}
          disabled={saving || uploading}
        >
          {saving ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.saveButtonText}>Saving...</Text>
            </View>
          ) : (
            <Text style={styles.saveButtonText}>Save Teacher Data</Text>
          )}
        </TouchableOpacity>

        {/* Status Info */}
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>
            {uploading && 'Uploading image...'}
            {saving && 'Saving to database...'}
            {!uploading && !saving && 'Ready to save'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  imageContainer: {
    alignItems: 'center',
  },
  previewImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
    marginBottom: 10,
  },
  changeImageButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  changeImageText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  imagePickerButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
  audioContainer: {
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  audioFileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  audioFileSize: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  changeAudioButton: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  changeAudioText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  audioPickerButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#6c757d',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioPickerText: {
    color: '#6c757d',
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});
