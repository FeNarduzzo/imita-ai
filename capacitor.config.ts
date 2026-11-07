import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.imitaai.party',
  appName: 'Imita Aí!',
  webDir: 'dist',
  backgroundColor: '#150a2e',
  android: { allowMixedContent: false },
  ios: { contentInset: 'never' },
};

export default config;
