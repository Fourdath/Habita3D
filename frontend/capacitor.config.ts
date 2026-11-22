import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.habita3d.app',
  appName: 'Habita3D',
  webDir: 'www',
  plugins: {
    CapacitorHttp: { enabled: true },
  },
};

export default config;
