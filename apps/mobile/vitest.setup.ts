import { vi } from 'vitest';

// Minimal globals for Expo modules in node test env.
// @ts-ignore
globalThis.__DEV__ = false;
// @ts-ignore
globalThis.expo = globalThis.expo ?? {
  EventEmitter: class {
    addListener() {
      return { remove: () => {} };
    }
    removeAllListeners() {}
    emit() {}
  },
  modules: {},
};

vi.mock('expo-audio', () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: vi.fn().mockResolvedValue({ granted: true, status: 'granted' }),
  },
  requestRecordingPermissionsAsync: vi.fn().mockResolvedValue({ granted: true, status: 'granted' }),
  setAudioModeAsync: vi.fn().mockResolvedValue(undefined),
  useAudioPlayer: vi.fn(() => ({
    play: vi.fn(),
    pause: vi.fn(),
    replace: vi.fn(),
    remove: vi.fn(),
  })),
  useAudioPlayerStatus: vi.fn(() => ({
    id: 0,
    currentTime: 0,
    playbackState: 'stopped',
    timeControlStatus: 'paused',
    reasonForWaitingToPlay: '',
    mute: false,
    duration: 0,
    playing: false,
    loop: false,
    didJustFinish: false,
    isBuffering: false,
    isLoaded: true,
    playbackRate: 1,
    shouldCorrectPitch: true,
  })),
  useAudioRecorder: vi.fn(() => ({
    prepareToRecordAsync: vi.fn().mockResolvedValue(undefined),
    record: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    uri: 'file://recording.m4a',
  })),
  useAudioRecorderState: vi.fn(() => ({
    canRecord: true,
    isRecording: false,
    durationMillis: 0,
    mediaServicesDidReset: false,
    url: null,
  })),
  RecordingPresets: {
    HIGH_QUALITY: {},
  },
}));

vi.mock('expo-file-system', () => ({
  Directory: {
    cache: 'cache',
    document: 'document',
  },
  File: class {},
  Paths: {
    cache: 'cache',
    document: 'document',
  },
}));

vi.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'document',
  cacheDirectory: 'cache',
  StorageAccessFramework: {
    readDirectoryAsync: vi.fn().mockResolvedValue([]),
    makeDirectoryAsync: vi.fn().mockResolvedValue('content://attachments'),
    createFileAsync: vi.fn().mockResolvedValue('content://attachments/file'),
    readAsStringAsync: vi.fn().mockResolvedValue(''),
    writeAsStringAsync: vi.fn().mockResolvedValue(undefined),
  },
  EncodingType: {
    Base64: 'base64',
  },
  getInfoAsync: vi.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: vi.fn().mockResolvedValue(undefined),
  readAsStringAsync: vi.fn().mockResolvedValue(''),
  writeAsStringAsync: vi.fn().mockResolvedValue(undefined),
  readDirectoryAsync: vi.fn().mockResolvedValue([]),
  deleteAsync: vi.fn().mockResolvedValue(undefined),
  copyAsync: vi.fn().mockResolvedValue(undefined),
  moveAsync: vi.fn().mockResolvedValue(undefined),
}));
