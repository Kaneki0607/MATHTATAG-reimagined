import { Audio } from 'expo-av';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function TTSPage() {
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [language, setLanguage] = useState('fil');
  const [stability, setStability] = useState(0.5);
  const [similarityBoost, setSimilarityBoost] = useState(0.5);

  const generateSpeech = async () => {
    if (!text.trim()) {
      Alert.alert('Error', 'Please enter some text to convert to speech');
      return;
    }

    try {
      setIsGenerating(true);
      
      // ElevenLabs API call with latest format
      const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/cgSgspJ2msm6clMCkdW9?output_format=mp3_44100_128', {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': 'sk_53ad6c84355ad43ebc9421a481ce4d0cf3392aaf401ffb83'
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: 'eleven_v3',
          language_code: language,
          voice_settings: {
            stability: stability,
            similarity_boost: similarityBoost,
            style: 0.0,
            use_speaker_boost: true
          },
          apply_text_normalization: 'auto',
          apply_language_text_normalization: false
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      // Convert response to base64 for React Native
      const audioBlob = await response.blob();
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        setAudioUri(base64data);
        
        // Auto-play the generated speech
        try {
          setIsPlaying(true);
          const { sound } = await Audio.Sound.createAsync(
            { uri: base64data },
            { shouldPlay: true }
          );

          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              setIsPlaying(false);
              sound.unloadAsync();
            }
          });
        } catch (playError) {
          console.error('Auto-play Error:', playError);
          setIsPlaying(false);
        }
      };
      
      reader.readAsDataURL(audioBlob);
      
    } catch (error) {
      console.error('TTS Error:', error);
      Alert.alert('Error', `Failed to generate speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };


  const clearText = () => {
    setText('');
    setAudioUri(null);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Text to Speech</Text>
        <Text style={styles.subtitle}>Convert your text into natural-sounding Filipino speech</Text>

        {/* Text Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Enter Text *</Text>
          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder="Ilagay ang teksto na gusto mong i-convert sa speech..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
        </View>

        {/* Character Count */}
        <View style={styles.characterCount}>
          <Text style={styles.characterText}>
            {text.length} characters
          </Text>
        </View>

        {/* Language Selection */}
        <View style={styles.settingsContainer}>
          <Text style={styles.settingsTitle}>Voice Settings</Text>
          
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Language:</Text>
            <View style={styles.languageButtons}>
              <TouchableOpacity
                style={[styles.languageButton, language === 'fil' && styles.activeButton]}
                onPress={() => setLanguage('fil')}
              >
                <Text style={[styles.languageButtonText, language === 'fil' && styles.activeButtonText]}>
                  Filipino
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.languageButton, language === 'en' && styles.activeButton]}
                onPress={() => setLanguage('en')}
              >
                <Text style={[styles.languageButtonText, language === 'en' && styles.activeButtonText]}>
                  English
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.languageButton, language === 'es' && styles.activeButton]}
                onPress={() => setLanguage('es')}
              >
                <Text style={[styles.languageButtonText, language === 'es' && styles.activeButtonText]}>
                  Spanish
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.languageButton, language === 'fr' && styles.activeButton]}
                onPress={() => setLanguage('fr')}
              >
                <Text style={[styles.languageButtonText, language === 'fr' && styles.activeButtonText]}>
                  French
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Stability: {stability.toFixed(1)}</Text>
            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>0.0</Text>
              <View style={styles.slider}>
                <View 
                  style={[
                    styles.sliderTrack, 
                    { width: `${stability * 100}%` }
                  ]} 
                />
                <TouchableOpacity
                  style={styles.sliderThumb}
                  onPress={() => {
                    const newValue = stability === 1.0 ? 0.0 : stability + 0.1;
                    setStability(Math.min(1.0, newValue));
                  }}
                />
              </View>
              <Text style={styles.sliderLabel}>1.0</Text>
            </View>
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Similarity Boost: {similarityBoost.toFixed(1)}</Text>
            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>0.0</Text>
              <View style={styles.slider}>
                <View 
                  style={[
                    styles.sliderTrack, 
                    { width: `${similarityBoost * 100}%` }
                  ]} 
                />
                <TouchableOpacity
                  style={styles.sliderThumb}
                  onPress={() => {
                    const newValue = similarityBoost === 1.0 ? 0.0 : similarityBoost + 0.1;
                    setSimilarityBoost(Math.min(1.0, newValue));
                  }}
                />
              </View>
              <Text style={styles.sliderLabel}>1.0</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.generateButton, (isGenerating || isPlaying) && styles.disabledButton]}
            onPress={generateSpeech}
            disabled={isGenerating || isPlaying}
          >
            {isGenerating ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.buttonText}>Generating...</Text>
              </View>
            ) : isPlaying ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.buttonText}>Playing...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Generate & Play Speech</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.clearButton}
            onPress={clearText}
          >
            <Text style={styles.clearButtonText}>Clear All</Text>
          </TouchableOpacity>
        </View>

        {/* Status Info */}
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>
            {isGenerating && 'Generating speech...'}
            {isPlaying && 'Playing speech...'}
            {audioUri && !isGenerating && !isPlaying && 'Speech ready! Click to generate new speech'}
            {!audioUri && !isGenerating && !isPlaying && 'Enter text and generate speech'}
          </Text>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsTitle}>How to use:</Text>
          <Text style={styles.instructionsText}>
            1. Enter your text in the text box above{'\n'}
            2. Tap "Generate & Play Speech" to create and automatically play audio{'\n'}
            3. The speech will play automatically when ready{'\n'}
            4. Use "Clear All" to start over
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
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    minHeight: 120,
  },
  characterCount: {
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  characterText: {
    fontSize: 14,
    color: '#666',
  },
  buttonContainer: {
    gap: 12,
    marginBottom: 20,
  },
  generateButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  playButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  playingButton: {
    backgroundColor: '#FF9500',
  },
  clearButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  clearButtonText: {
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
  instructionsContainer: {
    marginTop: 30,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  settingsContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 20,
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  settingRow: {
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  languageButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  languageButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
  },
  activeButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  languageButtonText: {
    fontSize: 14,
    color: '#666',
  },
  activeButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#666',
    minWidth: 30,
    textAlign: 'center',
  },
  slider: {
    flex: 1,
    height: 20,
    backgroundColor: '#e0e0e0',
    borderRadius: 10,
    position: 'relative',
  },
  sliderTrack: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 10,
  },
  sliderThumb: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 30,
    height: 30,
    backgroundColor: '#007AFF',
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#fff',
  },
});
