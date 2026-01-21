import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { readData } from '../lib/firebase-database';

interface QuarterRecord {
  quarter: 'Quarter 1' | 'Quarter 2' | 'Quarter 3' | 'Quarter 4';
  scores: number[];
  averageScore: number;
  remarks: string;
  exerciseCount: number;
}

const { width } = Dimensions.get('window');

const StudentRecords: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const studentId = params.studentId as string;
  const studentName = params.studentName as string;

  const [loading, setLoading] = useState(true);
  const [quarterRecords, setQuarterRecords] = useState<QuarterRecord[]>([]);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [classInactive, setClassInactive] = useState(false);

  useEffect(() => {
    loadStudentRecords();
  }, [studentId]);

  const loadStudentRecords = async () => {
    try {
      setLoading(true);

      // First, verify the student's class is active
      const { data: studentData } = await readData(`/students/${studentId}`);
      
      console.log('📚 StudentRecords - Loading data for:', studentId);
      console.log('Student data:', studentData);

      if (!studentData) {
        console.log('⚠️ Student not found');
        setLoading(false);
        return;
      }

      const studentClassId = studentData.classId;
      
      if (studentData.classId) {
        const { data: classData } = await readData(`/classes/${studentData.classId}`);
        
        if (classData && classData.status === 'inactive') {
          setClassInactive(true);
          setLoading(false);
          return;
        }
      }

      if (!studentClassId) {
        console.log('⚠️ Student has no classId');
        setLoading(false);
        return;
      }

      // Fetch exercise results and assigned exercises (using same paths as TeacherDashboard)
      const { data: exerciseResultsData } = await readData('/ExerciseResults');
      const { data: assignedExercisesData } = await readData('/assignedExercises');

      console.log('📊 Raw ExerciseResults keys:', exerciseResultsData ? Object.keys(exerciseResultsData).length : 0);
      console.log('Student classId:', studentClassId);

      if (!exerciseResultsData) {
        console.log('⚠️ No exercise results found');
        setLoading(false);
        return;
      }

      // Convert assignedExercises to array (exactly like TeacherDashboard line 6835-6837)
      const assignedExercises = Object.entries(assignedExercisesData || {})
        .map(([id, assignment]: [string, any]) => ({ id, ...assignment }))
        .filter((assignment: any) => assignment.classId === studentClassId);
      
      console.log('Assigned exercises for class:', assignedExercises.length);

      // Filter results for this student and organize by quarter
      const quarterData: Record<string, number[]> = {
        'Quarter 1': [],
        'Quarter 2': [],
        'Quarter 3': [],
        'Quarter 4': [],
      };

      let matchedCount = 0;
      let processedCount = 0;

      // Process ALL results (they're stored as flat object, NOT organized by classId)
      // This is exactly like TeacherDashboard line 3870-3943
      Object.entries(exerciseResultsData).forEach(([resultId, result]: any) => {
        processedCount++;
        
        // Extract classId from result (like TeacherDashboard line 3889)
        const resultClassId = result?.assignmentMetadata?.classId || result?.classId;
        
        // Only process results for this student's class
        if (resultClassId !== studentClassId) {
          return;
        }

        console.log(`Checking result ${processedCount}:`, {
          resultId,
          exerciseTitle: result?.exerciseTitle,
          classId: resultClassId,
          studentId: result?.studentId,
          studentInfoId: result?.studentInfo?.studentId
        });
        // Match by studentId (exactly like TeacherDashboard line 3977-3980)
        const resultStudentId = result?.studentId || result?.studentInfo?.studentId;
        const isMatch = (resultStudentId && resultStudentId === studentId) ||
                       (result?.parentId && studentData.parentId && result.parentId === studentData.parentId) ||
                       (result?.studentInfo?.name && studentData.fullName && 
                        result.studentInfo.name.toLowerCase().trim() === studentData.fullName.toLowerCase().trim());
        
        if (isMatch) {
          matchedCount++;
          console.log(`✓ Match #${matchedCount}:`, result?.exerciseTitle, result?.scorePercentage);

          // Get quarter from assignedExercises (exactly like TeacherDashboard line 10788-10812)
          let quarter = null;
          let assignment = null;
          
          // Extract IDs like TeacherDashboard does (line 3888-3890)
          const exerciseId = result?.exerciseInfo?.exerciseId || result?.exerciseId;
          const assignedExerciseId = result?.assignedExerciseId || result?.assignmentId || result?.assignmentMetadata?.assignmentId;
          
          // Try to find by assignedExerciseId first
          if (assignedExerciseId) {
            assignment = assignedExercises.find((a: any) => a.id === assignedExerciseId);
          }
          
          // If not found, try by exerciseId + classId
          if (!assignment && exerciseId) {
            assignment = assignedExercises.find((a: any) => 
              a.exerciseId === exerciseId && a.classId === resultClassId
            );
          }
          
          if (assignment?.quarter) {
            quarter = assignment.quarter;
            console.log('    ✓ Quarter from assignment:', quarter);
          } else if (result?.assignmentMetadata?.quarter) {
            quarter = result.assignmentMetadata.quarter;
            console.log('    ✓ Quarter from metadata:', quarter);
          } else {
            console.log('    ✗ No quarter found for:', result?.exerciseTitle);
          }
          
          // Get score (like TeacherDashboard line 3911)
          const score = result?.scorePercentage ?? result?.resultsSummary?.meanPercentageScore ?? 0;

          // Only add if quarter is valid
          if (quarter && quarterData[quarter] !== undefined && score !== null) {
            quarterData[quarter].push(score);
            console.log(`    ✓ Added to ${quarter}: ${score}%`);
          }
        }
      });

      console.log('📊 Summary:');
      console.log('  Total results processed:', processedCount);
      console.log('  Results for this class:', Object.entries(exerciseResultsData).filter(([, r]: any) => 
        (r?.assignmentMetadata?.classId || r?.classId) === studentClassId
      ).length);
      console.log('  Matched to student:', matchedCount);
      console.log('  Quarter 1:', quarterData['Quarter 1'].length);
      console.log('  Quarter 2:', quarterData['Quarter 2'].length);
      console.log('  Quarter 3:', quarterData['Quarter 3'].length);
      console.log('  Quarter 4:', quarterData['Quarter 4'].length);

      // Calculate average score and remarks for each quarter
      const records: QuarterRecord[] = [];
      const quartersWithScores: number[] = [];

      (['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4'] as const).forEach((quarter) => {
        const scores = quarterData[quarter];
        
        if (scores.length > 0) {
          const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
          const remarks = getRemarks(averageScore);

          records.push({
            quarter,
            scores,
            averageScore: Math.round(averageScore * 100) / 100,
            remarks,
            exerciseCount: scores.length,
          });

          quartersWithScores.push(averageScore);
        } else {
          // Quarter with no data
          records.push({
            quarter,
            scores: [],
            averageScore: 0,
            remarks: 'No Data',
            exerciseCount: 0,
          });
        }
      });

      setQuarterRecords(records);

      // Calculate final score: average of all quarters with active grades
      if (quartersWithScores.length > 0) {
        const totalScore = quartersWithScores.reduce((sum, score) => sum + score, 0);
        const avgFinalScore = totalScore / quartersWithScores.length;
        setFinalScore(Math.round(avgFinalScore * 100) / 100);
      } else {
        setFinalScore(null);
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load student records:', error);
      setLoading(false);
    }
  };

  const getRemarks = (score: number): string => {
    if (score >= 90) return 'Outstanding';
    if (score >= 85) return 'Very Satisfactory';
    if (score >= 80) return 'Satisfactory';
    if (score >= 75) return 'Fairly Satisfactory';
    if (score > 0) return 'Did Not Meet Expectations';
    return 'No Data';
  };

  const getRemarksColor = (remarks: string): string => {
    switch (remarks) {
      case 'Outstanding':
        return '#10b981';
      case 'Very Satisfactory':
        return '#3b82f6';
      case 'Satisfactory':
        return '#8b5cf6';
      case 'Fairly Satisfactory':
        return '#f59e0b';
      case 'Did Not Meet Expectations':
        return '#ef4444';
      default:
        return '#94a3b8';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#1e293b" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Student Records</Text>
            <Text style={styles.headerSubtitle}>{studentName}</Text>
          </View>
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading records...</Text>
        </View>
      </View>
    );
  }

  // Show message if class is inactive
  if (classInactive) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#1e293b" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Student Records</Text>
            <Text style={styles.headerSubtitle}>{studentName}</Text>
          </View>
        </View>
        
        <View style={styles.loadingContainer}>
          <MaterialCommunityIcons name="archive" size={64} color="#94a3b8" />
          <Text style={styles.inactiveTitle}>Class Inactive</Text>
          <Text style={styles.inactiveMessage}>
            Student records are not accessible because this student's class is currently inactive.
          </Text>
          <Text style={styles.inactiveMessage}>
            Please contact the teacher to reactivate the class.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Student Records</Text>
          <Text style={styles.headerSubtitle}>{studentName}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Final Score Card */}
        <View style={styles.finalScoreCard}>
          <View style={styles.finalScoreHeader}>
            <MaterialCommunityIcons name="trophy" size={28} color="#f59e0b" />
            <Text style={styles.finalScoreTitle}>Final Score</Text>
          </View>
          
          {finalScore !== null ? (
            <>
              <Text style={styles.finalScoreValue}>{finalScore.toFixed(2)}%</Text>
              <Text style={[styles.finalScoreRemarks, { color: getRemarksColor(getRemarks(finalScore)) }]}>
                {getRemarks(finalScore)}
              </Text>
              <Text style={styles.finalScoreDescription}>
                Average of {quarterRecords.filter(q => q.exerciseCount > 0).length} quarter(s) with active grades
              </Text>
            </>
          ) : (
            <Text style={styles.noDataText}>No grades available yet</Text>
          )}
        </View>

        {/* Quarter Records */}
        <Text style={styles.sectionTitle}>Academic Records by Quarter</Text>
        
        {quarterRecords.map((record, index) => (
          <View key={index} style={styles.quarterCard}>
            {/* Quarter Header */}
            <View style={styles.quarterHeader}>
              <View style={styles.quarterTitleRow}>
                <MaterialCommunityIcons 
                  name="calendar" 
                  size={20} 
                  color={record.exerciseCount > 0 ? '#3b82f6' : '#94a3b8'} 
                />
                <Text style={[
                  styles.quarterTitle,
                  { color: record.exerciseCount > 0 ? '#1e293b' : '#94a3b8' }
                ]}>
                  {record.quarter}
                </Text>
              </View>
              
              {record.exerciseCount > 0 && (
                <View style={styles.exerciseCountBadge}>
                  <Text style={styles.exerciseCountText}>
                    {record.exerciseCount} {record.exerciseCount === 1 ? 'exercise' : 'exercises'}
                  </Text>
                </View>
              )}
            </View>

            {/* Quarter Data */}
            {record.exerciseCount > 0 ? (
              <View style={styles.quarterData}>
                {/* Score */}
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Average Score:</Text>
                  <Text style={styles.dataValue}>{record.averageScore.toFixed(2)}%</Text>
                </View>

                {/* Remarks */}
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Remarks:</Text>
                  <View style={[styles.remarksBadge, { backgroundColor: `${getRemarksColor(record.remarks)}15` }]}>
                    <Text style={[styles.remarksText, { color: getRemarksColor(record.remarks) }]}>
                      {record.remarks}
                    </Text>
                  </View>
                </View>

                {/* Individual Scores */}
                {record.scores.length > 1 && (
                  <View style={styles.scoresBreakdown}>
                    <Text style={styles.breakdownLabel}>Individual scores:</Text>
                    <View style={styles.scoresRow}>
                      {record.scores.map((score, idx) => (
                        <View key={idx} style={styles.scoreChip}>
                          <Text style={styles.scoreChipText}>{score.toFixed(0)}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.noDataContainer}>
                <MaterialCommunityIcons name="information-outline" size={20} color="#94a3b8" />
                <Text style={styles.noDataQuarterText}>No exercises completed for this quarter</Text>
              </View>
            )}
          </View>
        ))}

        {/* Info Footer */}
        <View style={styles.infoFooter}>
          <MaterialIcons name="info-outline" size={16} color="#64748b" />
          <Text style={styles.infoText}>
            Records are based on submitted exercise results. Final score is calculated by averaging all quarters with active grades.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    marginRight: 12,
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  inactiveTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 8,
  },
  inactiveMessage: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  finalScoreCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  finalScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  finalScoreTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  finalScoreValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 8,
  },
  finalScoreRemarks: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  finalScoreDescription: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  noDataText: {
    fontSize: 14,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  quarterCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  quarterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  quarterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quarterTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  exerciseCountBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  exerciseCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3b82f6',
  },
  quarterData: {
    gap: 12,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dataLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  dataValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  remarksBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  remarksText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scoresBreakdown: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  scoresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  scoreChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  scoreChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  noDataContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  noDataQuarterText: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  infoFooter: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginBottom: 32,
    padding: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
  },
});

export default StudentRecords;
