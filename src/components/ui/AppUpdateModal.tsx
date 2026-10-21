/**
 * App-wide update prompt & version status indicator.
 *
 * Mounted once in the root layout (app/_layout.tsx) so it can run across all screens.
 * Checks for updates against GET /api/system/version on startup:
 *   - When the user's installed build is UP_TO_DATE:
 *     A small, subtle "Latest Version • vX.Y.Z" badge appears briefly at the top
 *     and automatically fades away without blocking the user or showing any modal card.
 *   - When the Play Store version is NEWER than the installed build:
 *     The full update modal appears (FORCE_UPDATE or UPDATE_AVAILABLE) allowing
 *     the user to update directly from the store.
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  StyleSheet,
  Animated,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { versionService, VersionCheckResult } from '@/services/versionService';

export const AppUpdateModal: React.FC = () => {
  const [result, setResult] = useState<VersionCheckResult | null>(null);
  const [visible, setVisible] = useState(false);
  const [showLatestBadge, setShowLatestBadge] = useState(false);
  const badgeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let isMounted = true;

    // Check version on startup with slight delay so initial render completes smoothly
    const timer = setTimeout(async () => {
      try {
        const res = await versionService.checkVersion();
        if (!isMounted) return;

        setResult(res);

        if (res.status === 'FORCE_UPDATE' || res.status === 'UPDATE_AVAILABLE') {
          // Play Store has a newer version than the user's phone: show update screen
          setVisible(true);
        } else if (res.status === 'UP_TO_DATE' && res.info) {
          // User is on latest version: show a brief subtle badge and move forward automatically
          setShowLatestBadge(true);
          Animated.sequence([
            Animated.timing(badgeAnim, {
              toValue: 1,
              duration: 250,
              useNativeDriver: true,
            }),
            Animated.delay(1800),
            Animated.timing(badgeAnim, {
              toValue: 0,
              duration: 350,
              useNativeDriver: true,
            }),
          ]).start(() => {
            if (isMounted) setShowLatestBadge(false);
          });
        }
      } catch {
        // Silently ignore network failures on startup
      }
    }, 1200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const handleUpdatePress = () => {
    if (result?.info) {
      versionService.openStore(result.info);
      if (result.status !== 'FORCE_UPDATE') {
        setVisible(false);
      }
    }
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  const isForce = result?.status === 'FORCE_UPDATE';
  const info = result?.info;

  return (
    <>
      {/* Subtle, non-blocking "Latest Version" badge that appears briefly */}
      {showLatestBadge && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: Platform.OS === 'web' ? 16 : 48,
            alignSelf: 'center',
            zIndex: 99999,
            opacity: badgeAnim,
            transform: [
              {
                translateY: badgeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-10, 0],
                }),
              },
            ],
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            paddingVertical: 6,
            paddingHorizontal: 13,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: 'rgba(22, 163, 74, 0.25)',
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
            gap: 6,
          }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: '#DCFCE7',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="checkmark-sharp" size={12} color="#16A34A" />
          </View>
          <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#1E293B' }}>
            Latest Version •{' '}
            <Text style={{ color: '#16A34A', fontWeight: '800' }}>
              v{result?.currentVersion || '1.0.2'}
            </Text>
          </Text>
        </Animated.View>
      )}

      {/* Full update modal: ONLY shown when Play Store version is newer than the installed app */}
      {visible && info && (
        <Modal
          visible={visible}
          transparent
          animationType="fade"
          onRequestClose={isForce ? () => {} : handleDismiss}
        >
          <View style={styles.overlay}>
            <View style={styles.card}>
              {/* Header Icon */}
              <View
                style={[
                  styles.iconContainer,
                  isForce ? styles.iconContainerDanger : styles.iconContainerPrimary,
                ]}
              >
                {isForce ? (
                  <Feather name="alert-triangle" size={32} color="#DC2626" />
                ) : (
                  <Feather name="download-cloud" size={32} color="#208AEF" />
                )}
              </View>

              {/* Title & Badge */}
              <Text style={styles.title}>
                {isForce ? 'Update Required' : info.title || 'New Update Available! 🚀'}
              </Text>

              {/* Version badge: "current -> new" */}
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    Current: v{result?.currentVersion} → New: v{info.latest_version}
                  </Text>
                </View>
              </View>

              {/* Description */}
              <Text style={styles.subtitle}>
                {isForce
                  ? 'A critical update is required to continue using Anulekh safely. Please update to the latest version from the Play Store.'
                  : info.message ||
                    'A new version of Anulekh is available on the Play Store with new features and fixes.'}
              </Text>

              {/* Feature List */}
              {info.features && info.features.length > 0 && (
                <ScrollView
                  style={styles.featuresList}
                  contentContainerStyle={{ paddingVertical: 4 }}
                  showsVerticalScrollIndicator={false}
                >
                  {info.features.map((feat, idx) => (
                    <View key={idx} style={styles.featureItem}>
                      <Feather
                        name="check-circle"
                        size={16}
                        color="#208AEF"
                        style={{ marginTop: 2, marginRight: 8 }}
                      />
                      <Text style={styles.featureText}>{feat}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}

              {/* Action Buttons */}
              <View style={styles.buttonRow}>
                {isForce ? (
                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: '#DC2626' }]}
                    onPress={handleUpdatePress}
                    activeOpacity={0.8}
                  >
                    <Feather
                      name="download"
                      size={18}
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.primaryButtonText}>Update Now</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.splitButtons}>
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={handleDismiss}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.secondaryButtonText}>Later</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.primaryButtonHalf}
                      onPress={handleUpdatePress}
                      activeOpacity={0.8}
                    >
                      <Feather
                        name="arrow-up-circle"
                        size={16}
                        color="#FFFFFF"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.primaryButtonText}>Update</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
      web: {
        boxShadow:
          '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      } as any,
    }),
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainerPrimary: {
    backgroundColor: '#EFF6FF',
  },
  iconContainerDanger: {
    backgroundColor: '#FEE2E2',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  badgeRow: {
    marginBottom: 12,
  },
  badge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  featuresList: {
    maxHeight: 180,
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  featureText: {
    fontSize: 13,
    color: '#334155',
    flex: 1,
    lineHeight: 18,
  },
  buttonRow: {
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#208AEF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    width: '100%',
  },
  primaryButtonHalf: {
    backgroundColor: '#208AEF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    flex: 1,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  splitButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  secondaryButton: {
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    flex: 1,
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
  },
});
