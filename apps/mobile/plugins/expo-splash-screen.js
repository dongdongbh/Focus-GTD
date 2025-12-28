module.exports = function withLocalSplashScreen(config, props = {}) {
    const nextConfig = { ...config };
    const currentSplash = nextConfig.splash ?? {};
    const currentDark = currentSplash.dark ?? {};
    const incomingDark = props.dark ?? {};

    nextConfig.splash = {
        ...currentSplash,
        ...props,
        dark: {
            ...currentDark,
            ...incomingDark,
        },
    };

    return nextConfig;
};
