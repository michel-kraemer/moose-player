// @flow

declare module "native-player" {
  declare class NativePlayer {
    constructor(): NativePlayer;
    init(channels: number, sampleRate: number): void;
    close(): void;
    play(): void;
    pause(): void;
    next(): void;
    prev(): void;
    goto(track: number): void;
    queue(path: string): void;
    currentSong(): {
      path: string;
      firstReadTimestamp: number;
      endOfDecode: boolean;
    }
  }

  declare module.exports: typeof NativePlayer;
}
