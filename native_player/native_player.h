#ifndef NATIVE_PLAYER_H
#define NATIVE_PLAYER_H

#include "song.h"
#include <nan.h>
#include <SDL2/SDL.h>
#include <list>

class NativePlayer : public Nan::ObjectWrap {
private:
  bool _initialized;
  std::list<std::shared_ptr<Song>> _songs;
  int _channels;
  int _sampleRate;

  explicit NativePlayer();
  ~NativePlayer();

  static void AudioCallback(void *udata, Uint8 *stream, int len);

  bool EnsureInitialized();

public:
  static void New(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void Init(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void Close(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void Play(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void Pause(const Nan::FunctionCallbackInfo<v8::Value> &info);
  static void Queue(const Nan::FunctionCallbackInfo<v8::Value> &info);
};

#endif
