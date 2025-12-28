module.exports = function withExpoRouter(config) {
    const nextConfig = { ...config };

    nextConfig.extra = nextConfig.extra ?? {};
    nextConfig.extra.router = nextConfig.extra.router ?? {};

    nextConfig.experiments = nextConfig.experiments ?? {};
    if (typeof nextConfig.experiments.typedRoutes === 'undefined') {
        nextConfig.experiments.typedRoutes = true;
    }

    return nextConfig;
};
