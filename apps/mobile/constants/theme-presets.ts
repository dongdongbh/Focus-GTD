export type ThemePresetName = 'default' | 'eink' | 'nord' | 'sepia';

export type ThemePresetColors = {
    bg: string;
    cardBg: string;
    taskItemBg: string;
    text: string;
    secondaryText: string;
    border: string;
    tint: string;
    onTint: string;
    inputBg: string;
    danger: string;
    success: string;
    warning: string;
    filterBg: string;
    icon: string;
    tabIconDefault: string;
    tabIconSelected: string;
};

export const THEME_PRESETS: Record<Exclude<ThemePresetName, 'default'>, ThemePresetColors> = {
    eink: {
        bg: '#FFFFFF',
        cardBg: '#FFFFFF',
        taskItemBg: '#FFFFFF',
        text: '#000000',
        secondaryText: '#000000',
        border: '#000000',
        tint: '#000000',
        onTint: '#FFFFFF',
        inputBg: '#FFFFFF',
        danger: '#000000',
        success: '#000000',
        warning: '#000000',
        filterBg: '#FFFFFF',
        icon: '#000000',
        tabIconDefault: '#000000',
        tabIconSelected: '#000000',
    },
    nord: {
        bg: '#2E3440',
        cardBg: '#3B4252',
        taskItemBg: '#3B4252',
        text: '#ECEFF4',
        secondaryText: '#D8DEE9',
        border: '#4C566A',
        tint: '#88C0D0',
        onTint: '#2E3440',
        inputBg: '#434C5E',
        danger: '#BF616A',
        success: '#A3BE8C',
        warning: '#EBCB8B',
        filterBg: '#434C5E',
        icon: '#D8DEE9',
        tabIconDefault: '#D8DEE9',
        tabIconSelected: '#88C0D0',
    },
    sepia: {
        bg: '#F4ECD8',
        cardBg: '#FAF3E3',
        taskItemBg: '#FAF3E3',
        text: '#3B2F2F',
        secondaryText: '#7A5C3E',
        border: '#E2D3B5',
        tint: '#9C6F3C',
        onTint: '#FFF6E7',
        inputBg: '#F0E3C8',
        danger: '#B44B3B',
        success: '#5F7D4A',
        warning: '#B5813C',
        filterBg: '#EFE2C7',
        icon: '#7A5C3E',
        tabIconDefault: '#7A5C3E',
        tabIconSelected: '#9C6F3C',
    },
};
