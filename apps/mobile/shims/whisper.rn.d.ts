declare module 'whisper.rn' {
  export type WhisperContext = {
    transcribe: (audioUri: string, options?: Record<string, unknown>) => {
      promise: Promise<unknown>;
    };
  };

  export function initWhisper(options: {
    filePath: string;
    useGpu?: boolean;
    useFlashAttn?: boolean;
  }): Promise<WhisperContext>;
  export function toggleNativeLog(enabled: boolean): Promise<void>;
  export function addNativeLogListener(listener: (level: string, text: string) => void): void;
}

declare module 'whisper.rn/realtime-transcription' {
  import type { WhisperContext } from 'whisper.rn';

  export type RealtimeOptions = {
    audioSliceSec?: number;
    audioMinSec?: number;
    audioOutputPath?: string;
    transcribeOptions?: Record<string, unknown>;
    audioStreamConfig?: {
      sampleRate?: number;
      channels?: number;
      bitsPerSample?: number;
      bufferSize?: number;
      audioSource?: number;
    };
  };

  export type RealtimeTranscriberEvent = {
    type?: 'start' | 'transcribe' | 'end' | 'error';
    data?: unknown;
    isCapturing?: boolean;
    sliceIndex?: number;
  };

  export type RealtimeTranscriberCallbacks = {
    onTranscribe?: (event: RealtimeTranscriberEvent) => void;
    onError?: (error: string) => void;
    onStatusChange?: (isActive: boolean) => void;
  };

  export type RealtimeTranscriberDependencies = {
    whisperContext: WhisperContext;
    audioStream: unknown;
    vadContext?: unknown;
    fs?: unknown;
  };

  export class RealtimeTranscriber {
    constructor(
      dependencies: RealtimeTranscriberDependencies,
      options?: RealtimeOptions,
      callbacks?: RealtimeTranscriberCallbacks
    );
    start(): Promise<void>;
    stop(): Promise<void>;
    destroy(): void;
  }
}

declare module 'whisper.rn/realtime-transcription/index.js' {
  export * from 'whisper.rn/realtime-transcription';
}

declare module 'whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter' {
  export class AudioPcmStreamAdapter {
    constructor();
  }
}

declare module 'whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter.js' {
  export class AudioPcmStreamAdapter {
    constructor();
  }
}
