#ifndef NATIVE_PLAYER_H
#define NATIVE_PLAYER_H

#include "song.h"
#include <nan.h>
#include <SDL2/SDL.h>
#include <list>
#include <mutex>

class NativePlayer : public Nan::ObjectWrap {
private:
  bool _initialized;
  std::list<std::shared_ptr<Song>> _songs;
  std::list<std::string> _playedSongs;
  int _channels;
  int _sampleRate;
  std::mutex _mutex;

  explicit NativePlayer();
  ~NativePlayer();

  static void AudioCallback(void *udata, Uint8 *stream, int len);

  bool EnsureInitialized();
  void NextInternal();
  void NextInternalNoLock();
  void PrevInternal();
  void PrevInternalNoLock();
  void GotoInternal(int track);
  void QueueInternal(const char *path, bool back);
  void QueueInternalNoLock(const char *path, bool back);

public:
  static void New(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void Init(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void Close(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void Play(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void Pause(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void Next(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void Prev(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void Goto(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void Queue(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void GetCurrentSong(const Nan::FunctionCallbackInfo<v8::Value> &info);
};

#endif
