/**
 * App-wide update / "What's New" modal.
 *
 * Mounted once in the root layout (app/_layout.tsx) so it can appear over any
 * screen. About 1.5 s after start-up it calls `versionService.checkVersion()`
 * (which hits the backend's GET /api/system/version and compares against the
 * installed build) and, unless the result is UP_TO_DATE, shows one of three
 * variants:
 *   - FORCE_UPDATE     : red, cannot be dismissed (Android back button is ignored);
 *                        only action is "Update Now", which opens the store.
 *   - UPDATE_AVAILABLE : blue, "Later" dismisses for this session, "Update" opens the store.
 *   - WHATS_NEW        : green, shown once after upgrading; dismissing records the
 *                        version as seen (AsyncStorage, via versionService.markVersionSeen).
 * Copy (title, message, feature bullets) comes from the server's release info.
 * Network failures are ignored so the check can never block the app.
 */
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { versionService, VersionCheckResult } from '@/services/versionService';

/**
 * Self-contained update prompt (no props). Renders nothing until a version
 * check returns something other than UP_TO_DATE with release info attached.
 */
export const AppUpdateModal: React.FC = () => {
  // Latest version-check result and whether the modal is currently shown.
  const [result, setResult] = useState<VersionCheckResult | null>(null);
  const [visible, setVisible] = useState(false);

  // One-shot version check after mount; `isMounted` guards against setting state after unmount.
  useEffect(() => {
    let isMounted = true;

    // Check version on startup with slight delay so initial render completes
    const timer = setTimeout(async () => {
      try {
        const res = await versionService.checkVersion();
        if (isMounted && res.status !== 'UP_TO_DATE') {
          setResult(res);
          setVisible(true);
        }
      } catch {
        // Silently ignore network failures on startup
      }
    }, 1500);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  // Nothing to show (still checking, up to date, dismissed, or no release info).
  if (!visible || !result || !result.info) {
    return null;
  }

  // Which of the three variants to render.
  const { status, info } = result;
  const isForce = status === 'FORCE_UPDATE';
  const isWhatsNew = status === 'WHATS_NEW';

  /**
   * Opens the app store listing. For a forced update the modal stays open, so
   * returning to the app without updating still blocks it.
   */
  const handleUpdatePress = () => {
    versionService.openStore(info);
    if (!isForce) {
      setVisible(false);
    }
  };

  /**
   * Closes the modal ("Later" / "Got it"). For What's New it first stores the
   * version code as seen so the sheet is not shown again; an optional update
   * will be offered again on the next app start.
   */
  const handleDismiss = async () => {
    if (isWhatsNew) {
      await versionService.markVersionSeen(info.latest_version_code);
    }
    setVisible(false);
  };

  // onRequestClose (Android back button) is a no-op for forced updates so the modal cannot be escaped.
  return (
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
              isForce
                ? styles.iconContainerDanger
                : isWhatsNew
                ? styles.iconContainerSuccess
                : styles.iconContainerPrimary,
            ]}
          >
            {isForce ? (
              <Feather name="alert-triangle" size={32} color="#DC2626" />
            ) : isWhatsNew ? (
              <Ionicons name="sparkles" size={32} color="#16A34A" />
            ) : (
              <Feather name="download-cloud" size={32} color="#208AEF" />
            )}
          </View>

          {/* Title & Badge */}
          <Text style={styles.title}>
            {isForce
              ? 'Update Required'
              : isWhatsNew
              ? 'Welcome to Anulekh 1.1! 🎉'
              : info.title || 'New Update Available!'}
          </Text>

          {/* Version badge: just the new version for What's New, otherwise "current -> new" */}
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {isWhatsNew
                  ? `v${info.latest_version}`
                  : `Current: v${result.currentVersion} → New: v${info.latest_version}`}
              </Text>
            </View>
          </View>

          {/* Description */}
          <Text style={styles.subtitle}>
            {isForce
              ? 'A critical update is required to continue using Anulekh safely. Please update to the latest version from the Play Store.'
              : isWhatsNew
              ? 'Here are the latest features and improvements now available:'
              : info.message || 'A new version of Anulekh is available with new features and fixes.'}
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
                <Feather name="download" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>Update Now</Text>
              </TouchableOpacity>
            ) : isWhatsNew ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleDismiss}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>Got it! Let's Go</Text>
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
                  <Feather name="arrow-up-circle" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.primaryButtonText}>Update</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

/** Plain StyleSheet styles (not NativeWind) for the overlay, card, badge, feature list and buttons. */
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
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
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
  iconContainerSuccess: {
    backgroundColor: '#DCFCE7',
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
