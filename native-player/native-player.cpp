#include "native-player.h"

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
  SDL_memset(stream, 0, (size_t)len);

  auto player = (NativePlayer *)udata;
  std::lock_guard<std::mutex> lock(player->_mutex);
  int pos = 0;
  while (pos < len && !player->_songs.empty()) {
    auto song = *player->_songs.begin();
    int available = song->EnsureBytes(len - pos);
    if (available == 0) {
      if (player->_songs.size() == 1) {
        // do not skip beyond the last song
        return;
      }

      player->NextInternalNoLock();

      // remove gaps between songs (remove at most 250ms)
      int truncated_silence = 0;
      while (pos > (int)sizeof(short) && truncated_silence < player->_sampleRate * player->_channels / 4) {
        bool silent = true;
        for (int i = 0; i < player->_channels; ++i) {
          if (*((short *)(stream + pos - 1)) > 0) {
            silent = false;
          }
        }
        if (silent) {
          pos -= sizeof(short);
          truncated_silence += sizeof(short);
        } else {
          break;
        }
      }
    } else {
      SDL_MixAudioFormat(stream + pos, (const Uint8 *)song->GetBuffer(),
          AUDIO_S16LSB, (Uint32)available, SDL_MIX_MAXVOLUME);
      song->DidRead(available);
      pos += available;
    }
  }
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

void NativePlayer::NextInternal() {
  std::lock_guard<std::mutex> lock(_mutex);
  NextInternalNoLock();
}

void NativePlayer::NextInternalNoLock() {
  if (_songs.empty()) {
    return;
  }

  std::string path = (*_songs.begin())->GetPath();
  _songs.pop_front();
  _playedSongs.push_back(path);

  if (_songs.empty()) {
    // enqueue all songs again (i.e. repeat the album)
    for (auto i = _playedSongs.begin(); i != _playedSongs.end(); ++i) {
      QueueInternalNoLock(i->c_str(), true);
    }
    _playedSongs.clear();
  }
}

void NativePlayer::PrevInternal() {
  std::lock_guard<std::mutex> lock(_mutex);
  if (_playedSongs.empty()) {
    return;
  }

  // reset the current song
  std::string path1 = (*_songs.begin())->GetPath();
  _songs.pop_front();
  QueueInternalNoLock(path1.c_str(), false);

  // play the previous song
  std::string path2 = *_playedSongs.rbegin();
  _playedSongs.pop_back();
  QueueInternalNoLock(path2.c_str(), false);
}

void NativePlayer::QueueInternal(const char *path, bool back) {
  std::lock_guard<std::mutex> lock(_mutex);
  QueueInternalNoLock(path, back);
}

void NativePlayer::QueueInternalNoLock(const char *path, bool back) {
  auto s = std::make_shared<Song>(path, _channels, _sampleRate);
  if (back) {
    _songs.push_back(s);
  } else {
    _songs.push_front(s);
  }
}

void NativePlayer::Close(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  auto player = ObjectWrap::Unwrap<NativePlayer>(info.Holder());
  if (!player->EnsureInitialized()) {
    return;
  }

  std::lock_guard<std::mutex> lock(player->_mutex);
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

void NativePlayer::Next(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  auto player = ObjectWrap::Unwrap<NativePlayer>(info.Holder());
  if (!player->EnsureInitialized()) {
    return;
  }

  player->NextInternal();
}

void NativePlayer::Prev(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  auto player = ObjectWrap::Unwrap<NativePlayer>(info.Holder());
  if (!player->EnsureInitialized()) {
    return;
  }

  player->PrevInternal();
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
  player->QueueInternal(*path, true);
}

void NativePlayer::GetCurrentSong(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  auto player = ObjectWrap::Unwrap<NativePlayer>(info.Holder());
  if (!player->EnsureInitialized()) {
    return;
  }

  std::lock_guard<std::mutex> lock(player->_mutex);
  if (player->_songs.empty()) {
    info.GetReturnValue().SetUndefined();
    return;
  }

  auto song = *player->_songs.begin();

  v8::Local<v8::Object> obj = Nan::New<v8::Object>();
  obj->Set(Nan::New("path").ToLocalChecked(), Nan::New(song->GetPath()).ToLocalChecked());
  obj->Set(Nan::New("elapsedMilliseconds").ToLocalChecked(), Nan::New(song->GetElapsedMilliseconds()));

  info.GetReturnValue().Set(obj);
}

void InitModule(v8::Local<v8::Object> exports) {
  av_log_set_level(AV_LOG_QUIET);

  Nan::HandleScope scope;

  auto tpl = Nan::New<v8::FunctionTemplate>(NativePlayer::New);
  tpl->SetClassName(Nan::New("NativePlayer").ToLocalChecked());
  // reserve space for 1 object instance
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  Nan::SetPrototypeMethod(tpl, "init", NativePlayer::Init);
  Nan::SetPrototypeMethod(tpl, "close", NativePlayer::Close);
  Nan::SetPrototypeMethod(tpl, "play", NativePlayer::Play);
  Nan::SetPrototypeMethod(tpl, "pause", NativePlayer::Pause);
  Nan::SetPrototypeMethod(tpl, "next", NativePlayer::Next);
  Nan::SetPrototypeMethod(tpl, "prev", NativePlayer::Prev);
  Nan::SetPrototypeMethod(tpl, "queue", NativePlayer::Queue);
  Nan::SetPrototypeMethod(tpl, "currentSong", NativePlayer::GetCurrentSong);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("NativePlayer").ToLocalChecked(), tpl->GetFunction());
}

NODE_MODULE(nativeplayer, InitModule)
