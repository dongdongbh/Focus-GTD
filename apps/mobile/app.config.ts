import type { ConfigContext, ExpoConfig } from 'expo/config';

type PluginEntry = NonNullable<ExpoConfig['plugins']>[number];

const isFossBuild = process.env.FOSS_BUILD === '1' || process.env.FOSS_BUILD === 'true';

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  const plugins: PluginEntry[] = Array.isArray(base.plugins) ? [...base.plugins] : [];
  const filteredPlugins = isFossBuild
    ? plugins.filter((plugin) => {
        if (typeof plugin === 'string') {
          return plugin !== 'expo-notifications';
        }
        if (Array.isArray(plugin)) {
          if (plugin.length === 0) return true;
          return plugin[0] !== 'expo-notifications';
        }
        return true;
      })
    : plugins;

  const android = base.android ? { ...base.android } : undefined;
  if (android && Array.isArray(android.permissions)) {
    android.permissions = isFossBuild
      ? android.permissions.filter((permission) => permission !== 'POST_NOTIFICATIONS')
      : android.permissions;
  }

  return {
    ...base,
    android,
    plugins: filteredPlugins,
  };
};
