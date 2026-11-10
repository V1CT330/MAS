import React, { useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  Image,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { isSupabaseConfigured, supabase } from './src/lib/supabase';

type Mode = 'user' | 'developer' | 'social';
type UserTab = 'apps' | 'library' | 'alerts' | 'account';
type DeveloperTab = 'overview' | 'products' | 'verification' | 'wallet' | 'settings';

type Listing = {
  id: string;
  name: string;
  developer: string;
  category: string;
  kind: 'App' | 'Website' | 'Tool';
  price: string;
  rating: number;
  downloads: string;
  image: string;
};

type Post = {
  id: string;
  author: string;
  handle: string;
  text: string;
  time: string;
  likes: number;
  comments: number;
  image?: string;
};

const catalogue: Listing[] = [
  {
    id: 'ls-1',
    name: 'MAL App',
    developer: 'WealthGrid',
    category: 'Finance',
    kind: 'App',
    price: 'MK 0',
    rating: 4.9,
    downloads: '32k',
    image: 'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'ls-2',
    name: 'AgriLink',
    developer: 'Mzimba Digital',
    category: 'Business',
    kind: 'App',
    price: 'MK 500',
    rating: 4.8,
    downloads: '15k',
    image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'ls-3',
    name: 'TrainHub',
    developer: 'NedTrain',
    category: 'Transport',
    kind: 'Website',
    price: 'MK 0',
    rating: 4.7,
    downloads: '8k',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80',
  },
];

const posts: Post[] = [
  {
    id: 'p-1',
    author: 'Lusayo',
    handle: '@lusayo',
    text: 'We just launched a local inventory app for market traders in Blantyre. The first beta is open and feedback is welcome.',
    time: '2h ago',
    likes: 128,
    comments: 26,
    image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'p-2',
    author: 'Mphatso',
    handle: '@mphatso',
    text: 'Do you use WhatsApp with your customers or do you prefer in-app chat for support? We are testing both flows.',
    time: '5h ago',
    likes: 84,
    comments: 14,
  },
];

const quickFacts = [
  { label: 'Apps live', value: '187' },
  { label: 'Developers', value: '64' },
  { label: 'Verified', value: '43' },
  { label: 'Downloads', value: '2.4M' },
];

const userTabs: { key: UserTab; label: string }[] = [
  { key: 'apps', label: 'Apps' },
  { key: 'library', label: 'Library' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'account', label: 'Account' },
];

const developerTabs: { key: DeveloperTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'products', label: 'Products' },
  { key: 'verification', label: 'Verification' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'settings', label: 'Settings' },
];

export default function App() {
  const [mode, setMode] = useState<Mode>('user');
  const [userTab, setUserTab] = useState<UserTab>('apps');
  const [developerTab, setDeveloperTab] = useState<DeveloperTab>('overview');
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'AI features are disabled in this native build. Live verification, payment, and admin actions stay server-authoritative.',
  );

  const appTitle = useMemo(() => {
    if (mode === 'developer') return 'Developer mode';
    if (mode === 'social') return 'Social';
    return 'MAS storefront';
  }, [mode]);

  const handleOAuth = async () => {
    if (!isSupabaseConfigured) {
      setStatusMessage('Preview mode: public Supabase config is not available in this build.');
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'mw.wealthgrid.mas://auth/callback',
        },
      });

      if (error) {
        setStatusMessage(error.message);
        return;
      }

      setIsSignedIn(true);
      setStatusMessage('Google sign-in requested. Finish the redirect in the live Supabase configuration.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown authentication error.';
      setStatusMessage(message);
    }
  };

  const openConsole = async () => {
    const url = 'https://malawian-app-store.vercel.app/console';
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Unable to open console', 'This build is not connected to the live web console URL.');
      return;
    }
    await Linking.openURL(url);
  };

  const renderUserScreen = () => {
    switch (userTab) {
      case 'apps':
        return (
          <View style={styles.screenBlock}>
            <Text style={styles.sectionTitle}>Featured apps</Text>
            {catalogue.map((item) => (
              <TouchableOpacity key={item.id} activeOpacity={0.85} style={styles.card}>
                <Image source={{ uri: item.image }} style={styles.cardImage} />
                <View style={styles.cardBody}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.price}>{item.price}</Text>
                  </View>
                  <Text style={styles.metaText}>{item.category} • {item.kind}</Text>
                  <Text style={styles.metaText}>{item.developer}</Text>
                  <View style={styles.ratingRow}>
                    <Text style={styles.rating}>★ {item.rating}</Text>
                    <Text style={styles.metaText}>{item.downloads} downloads</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        );
      case 'library':
        return (
          <View style={styles.screenBlock}>
            <Text style={styles.sectionTitle}>Library</Text>
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No downloaded apps yet</Text>
              <Text style={styles.emptyText}>Your installed apps and update history will appear here once you install an app.</Text>
            </View>
          </View>
        );
      case 'alerts':
        return (
          <View style={styles.screenBlock}>
            <Text style={styles.sectionTitle}>Alerts</Text>
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Store update</Text>
              <Text style={styles.noticeText}>MAS verified reviews and security checks are active on the live backend.</Text>
            </View>
          </View>
        );
      case 'account':
        return (
          <View style={styles.screenBlock}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.accountCard}>
              <Text style={styles.accountName}>{isSignedIn ? 'Verified user' : 'Guest user'}</Text>
              <Text style={styles.accountText}>Phone verification and Google sign-in remain live-backend workflows.</Text>
              <TouchableOpacity onPress={handleOAuth} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{isSignedIn ? 'Refresh sign-in' : 'Continue with Google'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  const renderDeveloperScreen = () => {
    switch (developerTab) {
      case 'overview':
        return (
          <View style={styles.screenBlock}>
            <Text style={styles.sectionTitle}>Developer dashboard</Text>
            <View style={styles.quickFactsRow}>
              {quickFacts.map((fact) => (
                <View key={fact.label} style={styles.factCard}>
                  <Text style={styles.factValue}>{fact.value}</Text>
                  <Text style={styles.factLabel}>{fact.label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Status</Text>
              <Text style={styles.noticeText}>Launch version, verification, and review flows are handled through the existing MAS console and live backend rules.</Text>
            </View>
          </View>
        );
      case 'products':
        return (
          <View style={styles.screenBlock}>
            <Text style={styles.sectionTitle}>Products</Text>
            {catalogue.map((item) => (
              <View key={item.id} style={styles.devListItem}>
                <Text style={styles.devListTitle}>{item.name}</Text>
                <Text style={styles.metaText}>{item.category}</Text>
                <Text style={styles.metaText}>Status: published</Text>
              </View>
            ))}
          </View>
        );
      case 'verification':
        return (
          <View style={styles.screenBlock}>
            <Text style={styles.sectionTitle}>Verification</Text>
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>KYC and Didit</Text>
              <Text style={styles.noticeText}>Identity verification uses the existing hosted provider flow and private storage rules. Do not mark verification as complete in-app without server confirmation.</Text>
            </View>
          </View>
        );
      case 'wallet':
        return (
          <View style={styles.screenBlock}>
            <Text style={styles.sectionTitle}>Wallet</Text>
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Safety-first wallet status</Text>
              <Text style={styles.noticeText}>Balances, ledger entries, and settlements remain tied to the live backend. The native screen explains the status but does not create payment outcomes.</Text>
            </View>
          </View>
        );
      case 'settings':
        return (
          <View style={styles.screenBlock}>
            <Text style={styles.sectionTitle}>Settings</Text>
            <TouchableOpacity style={styles.settingRow} onPress={openConsole}>
              <Text style={styles.settingLabel}>Open MAS console</Text>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingRow} onPress={() => setStatusMessage('Developer Pro and subscription checks remain server-driven.')}>
              <Text style={styles.settingLabel}>Developer Pro</Text>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingRow} onPress={() => setStatusMessage('Security controls stay in the trusted web workflow.')}>
              <Text style={styles.settingLabel}>Security</Text>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          </View>
        );
      default:
        return null;
    }
  };

  const renderSocialScreen = () => (
    <View style={styles.screenBlock}>
      <Text style={styles.sectionTitle}>Social</Text>
      {posts.map((post) => (
        <View key={post.id} style={styles.postCard}>
          <View style={styles.postHeader}>
            <View>
              <Text style={styles.postAuthor}>{post.author}</Text>
              <Text style={styles.postHandle}>{post.handle}</Text>
            </View>
            <Text style={styles.postTime}>{post.time}</Text>
          </View>
          <Text style={styles.postText}>{post.text}</Text>
          {post.image ? <Image source={{ uri: post.image }} style={styles.postImage} /> : null}
          <View style={styles.postStatsRow}>
            <Text style={styles.metaText}>♥ {post.likes}</Text>
            <Text style={styles.metaText}>💬 {post.comments}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  const renderContent = () => {
    if (mode === 'social') return renderSocialScreen();
    if (mode === 'developer') return renderDeveloperScreen();
    return renderUserScreen();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.overline}>Malawian App Store</Text>
            <Text style={styles.title}>{appTitle}</Text>
          </View>
          <Text style={styles.liveBadge}>{isSupabaseConfigured ? 'Live' : 'Preview'}</Text>
        </View>

        <View style={styles.modeRow}>
          {(['user', 'developer', 'social'] as Mode[]).map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.modeButton, mode === item && styles.modeButtonActive]}
              onPress={() => setMode(item)}
            >
              <Text style={[styles.modeButtonText, mode === item && styles.modeButtonTextActive]}>
                {item === 'user' ? 'User' : item === 'developer' ? 'Developer' : 'Social'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'user' ? (
          <View style={styles.tabBar}>
            {userTabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setUserTab(tab.key)}
                style={[styles.tabButton, userTab === tab.key && styles.tabButtonActive]}
              >
                <Text style={[styles.tabText, userTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {mode === 'developer' ? (
          <View style={styles.tabBar}>
            {developerTabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setDeveloperTab(tab.key)}
                style={[styles.tabButton, developerTab === tab.key && styles.tabButtonActive]}
              >
                <Text style={[styles.tabText, developerTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {renderContent()}
          <View style={styles.statusBanner}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f7fb',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 18 : 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  overline: {
    fontSize: 11,
    letterSpacing: 0.8,
    color: '#5e6b85',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
  },
  liveBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f766e',
    backgroundColor: '#d1fae5',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: '#edf2ff',
    borderRadius: 14,
    padding: 5,
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  modeButtonActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#52607a',
    textTransform: 'capitalize',
  },
  modeButtonTextActive: {
    color: '#111827',
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    marginRight: 8,
    marginBottom: 8,
  },
  tabButtonActive: {
    backgroundColor: '#111827',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  tabTextActive: {
    color: '#fff',
  },
  content: {
    paddingBottom: 24,
  },
  screenBlock: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e7ebf3',
    marginBottom: 12,
  },
  cardImage: {
    width: '100%',
    height: 150,
    resizeMode: 'cover',
  },
  cardBody: {
    padding: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  price: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f766e',
  },
  metaText: {
    fontSize: 12,
    color: '#5b6477',
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  rating: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f59e0b',
  },
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#edf1f7',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#5b6477',
  },
  noticeCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#edf1f7',
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#5b6477',
  },
  accountCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#edf1f7',
  },
  accountName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  accountText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#5b6477',
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  quickFactsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  factCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#edf1f7',
    marginBottom: 10,
  },
  factValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  factLabel: {
    fontSize: 12,
    color: '#5b6477',
  },
  devListItem: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#edf1f7',
    marginBottom: 10,
  },
  devListTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  settingRow: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#edf1f7',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  arrow: {
    fontSize: 20,
    color: '#64748b',
  },
  postCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#edf1f7',
    marginBottom: 12,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  postAuthor: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  postHandle: {
    fontSize: 12,
    color: '#5b6477',
  },
  postTime: {
    fontSize: 12,
    color: '#64748b',
  },
  postText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#374151',
    marginBottom: 10,
  },
  postImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 10,
    resizeMode: 'cover',
  },
  postStatsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statusBanner: {
    marginTop: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dfe5ff',
  },
  statusText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#374151',
  },
});
