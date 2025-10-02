import React, { useState } from 'react';
import { Modal, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface TermsAndConditionsProps {
  visible: boolean;
  onAgree: () => void;
  onClose?: () => void;
  title?: string;
  showCloseButton?: boolean;
}

const TERMS_TEXT = `MATH TATAG - TERMS AND CONDITIONS

1. Data Privacy: We comply with the Philippine Data Privacy Act (RA 10173). Your personal information is collected, processed, and stored solely for educational purposes. We do not sell or share your data with third parties except as required by law.

2. Consent: By using this app, you consent to the collection and use of your data for learning analytics, progress tracking, and communication with your school.

3. User Responsibilities: You agree to use this app for lawful, educational purposes only. Do not share your login credentials.

4. Intellectual Property: All content, including lessons and activities, is owned by the app developers and licensors.

5. Limitation of Liability: The app is provided as-is. We are not liable for any damages arising from its use.

6. Updates: We may update these terms. Continued use means you accept the new terms.

7. Contact: For privacy concerns, contact your school or the app administrator.

By agreeing, you acknowledge you have read and understood these terms in accordance with Philippine law.`;

export default function TermsAndConditions({ 
  visible, 
  onAgree, 
  onClose, 
  title = "Terms and Conditions",
  showCloseButton = false 
}: TermsAndConditionsProps) {
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);

  const handleTermsScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 20) {
      setHasScrolledToEnd(true);
    }
  };

  const handleAgree = () => {
    setHasScrolledToEnd(false); // Reset for next time
    onAgree();
  };

  const handleClose = () => {
    setHasScrolledToEnd(false); // Reset for next time
    onClose?.();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            {showCloseButton && onClose && (
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <ScrollView 
            style={styles.termsScrollView} 
            onScroll={handleTermsScroll} 
            scrollEventThrottle={16} 
            showsVerticalScrollIndicator={true}
          >
            <Text style={styles.termsText}>{TERMS_TEXT}</Text>
          </ScrollView>
          
          <View style={styles.modalActions}>
            {showCloseButton && onClose && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleClose}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.agreeButton, 
                !hasScrolledToEnd && styles.agreeButtonDisabled,
                showCloseButton && styles.agreeButtonWithCancel
              ]}
              disabled={!hasScrolledToEnd}
              onPress={handleAgree}
            >
              <Text style={styles.agreeButtonText}>
                {hasScrolledToEnd ? 'I Agree' : 'Please scroll to continue'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    maxHeight: '85%',
    borderWidth: 2,
    borderColor: 'rgba(35, 177, 248, 0.4)',
    shadowColor: '#00aaff',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 15,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(35, 177, 248, 0.2)',
  },
  modalTitle: {
    fontWeight: 'bold',
    fontSize: 20,
    color: 'rgb(40, 127, 214)',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 18,
    top: 18,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: 'rgb(239, 68, 68)',
    fontWeight: 'bold',
  },
  termsScrollView: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    maxHeight: 380,
  },
  termsText: {
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(35, 177, 248, 0.2)',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'rgba(236, 236, 236, 1)',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 9,
    borderWidth: 1,
    borderColor: 'rgba(150,150,150,0.2)',
  },
  cancelButtonText: {
    color: '#64748b',
    fontWeight: 'bold',
    fontSize: 16,
  },
  agreeButton: {
    backgroundColor: 'rgb(40, 127, 214)',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.3)',
    flex: 1,
  },
  agreeButtonWithCancel: {
    marginLeft: 9,
  },
  agreeButtonDisabled: {
    backgroundColor: 'rgba(236, 236, 236, 1)',
    borderColor: 'rgba(150,150,150,0.2)',
  },
  agreeButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

