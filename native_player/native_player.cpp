#include "native_player.h"

extern "C" {
}

Nan::Persistent<v8::Function> constructor;

NativePlayer::NativePlayer() : _initialized(false) {
}

NativePlayer::~NativePlayer() {
}

void NativePlayer::New(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  if (info.IsConstructCall()) {
    // invoked as constructor: `new NativePlayer(...)`
    auto obj = new NativePlayer();
    obj->Wrap(info.This());
    info.GetReturnValue().Set(info.This());
  } else {
    // invoked as plain function `NativePlayer(...)`, turn into construct call.
    auto cons = Nan::New<v8::Function>(constructor);
    info.GetReturnValue().Set(Nan::NewInstance(cons).ToLocalChecked());
  }
}

void NativePlayer::AudioCallback(void *udata, Uint8 *stream, int len) {
  auto player = (NativePlayer *)udata;
  SDL_memset(stream, 0, (size_t)len);

  if (player->_songs.empty()) {
    return;
  }

  auto song = *player->_songs.begin();
  int available = song->EnsureBytes(len);
  if (available == 0) {
    player->_songs.pop_front();
    return;
  }

  SDL_MixAudioFormat(stream, (const Uint8 *)song->GetBuffer(),
      AUDIO_S16LSB, (Uint32)available, SDL_MIX_MAXVOLUME);
  song->DidRead(available);
}

bool NativePlayer::EnsureInitialized() {
  if (!_initialized) {
    Nan::ThrowTypeError("NativePlayer has not been initialized yet");
    return false;
  }
  return true;
}

void NativePlayer::Init(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  auto player = ObjectWrap::Unwrap<NativePlayer>(info.Holder());
  if (player->_initialized) {
    Nan::ThrowTypeError("NativePlayer has already been initialized");
    return;
  }
  player->_initialized = true;

  if (info.Length() < 2) {
    Nan::ThrowTypeError("Wrong number of arguments");
    return;
  }

  if (!info[0]->IsNumber()) {
    Nan::ThrowTypeError("'channels' must be a number");
    return;
  }

  if (!info[1]->IsNumber()) {
    Nan::ThrowTypeError("'sample_rate' must be a number");
    return;
  }

  player->_channels = info[0]->NumberValue();
  player->_sampleRate = info[1]->NumberValue();

  if (SDL_Init(SDL_INIT_AUDIO | SDL_INIT_TIMER)) {
    Nan::ThrowTypeError(SDL_GetError());
    return;
  }

  SDL_AudioSpec wanted_spec;
  wanted_spec.freq = player->_sampleRate;
  wanted_spec.format = AUDIO_S16LSB;
  wanted_spec.channels = (Uint8)player->_channels;
  wanted_spec.silence = 0;
  wanted_spec.samples = 4096; // buffer size
  wanted_spec.userdata = player;
  wanted_spec.callback = NativePlayer::AudioCallback;

  if (SDL_OpenAudio(&wanted_spec, NULL) < 0) {
    Nan::ThrowTypeError(SDL_GetError());
    return;
  }
}

void NativePlayer::Close(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  auto player = ObjectWrap::Unwrap<NativePlayer>(info.Holder());
  if (!player->EnsureInitialized()) {
    return;
  }
  player->_songs.clear();
  SDL_CloseAudio();
}

void NativePlayer::Play(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  auto player = ObjectWrap::Unwrap<NativePlayer>(info.Holder());
  if (!player->EnsureInitialized()) {
    return;
  }

  SDL_PauseAudio(FALSE);
}

void NativePlayer::Pause(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  auto player = ObjectWrap::Unwrap<NativePlayer>(info.Holder());
  if (!player->EnsureInitialized()) {
    return;
  }

  SDL_PauseAudio(TRUE);
}

void NativePlayer::Queue(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  auto player = ObjectWrap::Unwrap<NativePlayer>(info.Holder());
  if (!player->EnsureInitialized()) {
    return;
  }

  if (info.Length() < 1) {
    Nan::ThrowTypeError("Wrong number of arguments");
    return;
  }

  if (!info[0]->IsString()) {
    Nan::ThrowTypeError("'path' must be a string");
    return;
  }

  v8::String::Utf8Value path(info.GetIsolate(), info[0]->ToString());

  player->_songs.push_back(std::make_shared<Song>(*path,
      player->_channels, player->_sampleRate));
}

void InitModule(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  auto tpl = Nan::New<v8::FunctionTemplate>(NativePlayer::New);
  tpl->SetClassName(Nan::New("NativePlayer").ToLocalChecked());
  // reserve space for 1 object instance
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  Nan::SetPrototypeMethod(tpl, "init", NativePlayer::Init);
  Nan::SetPrototypeMethod(tpl, "play", NativePlayer::Play);
  Nan::SetPrototypeMethod(tpl, "close", NativePlayer::Close);
  Nan::SetPrototypeMethod(tpl, "queue", NativePlayer::Queue);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("NativePlayer").ToLocalChecked(), tpl->GetFunction());
}

NODE_MODULE(native_player, InitModule)