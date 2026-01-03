import React from 'react';

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T) => styles,
};

export const Text = (props: any) => React.createElement('span', props, props.children);

export const Platform = { OS: 'web', select: (options: any) => options?.web ?? options?.default };
