#include <nan.h>
#include <SDL2/SDL.h>

class BufferHolder {
private:
  char *_buf;
  long _length;
  long _pos;

public:
  BufferHolder(char *buf, long length) : _buf(buf), _length(length), _pos(0) {}

  char *getBuf() {
    return _buf;
  }

  long getLength() {
    return _length;
  }

  long getPos() {
    return _pos;
  }

  long incPos(long increment) {
    _pos += increment;
  }
};

static void audio_callback(void *udata, Uint8 *stream, int len) {
  SDL_memset(stream, 0, (size_t)len);
  BufferHolder *holder = (BufferHolder *)udata;
  long rest = holder->getLength() - holder->getPos();
  long l = rest < len ? rest : len;
  SDL_MixAudioFormat(stream, (const Uint8 *)(holder->getBuf() + holder->getPos()),
      AUDIO_S16LSB, (Uint32)l, SDL_MIX_MAXVOLUME);
  holder->incPos(l);
}

void Play(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  if (info.Length() < 4) {
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

  if (!info[2]->IsObject()) {
    Nan::ThrowTypeError("'buffer' must be an object");
    return;
  }

  if (!info[3]->IsNumber()) {
    Nan::ThrowTypeError("'length' must be a number");
    return;
  }

  int channels = info[0]->NumberValue();
  int sample_rate = info[1]->NumberValue();
  char *buf = (char *)node::Buffer::Data(info[2]->ToObject());
  long length = info[3]->NumberValue();

  if (SDL_Init(SDL_INIT_AUDIO | SDL_INIT_TIMER)) {
    Nan::ThrowTypeError(SDL_GetError());
    return;
  }

  SDL_AudioSpec wanted_spec;
  wanted_spec.freq = sample_rate;
  wanted_spec.format = AUDIO_S16LSB;
  wanted_spec.channels = (Uint8)channels;
  wanted_spec.silence = 0;
  wanted_spec.samples = 4096; // buffer size
  wanted_spec.userdata = new BufferHolder(buf, length);
  wanted_spec.callback = audio_callback;

  if (SDL_OpenAudio(&wanted_spec, NULL) < 0) {
    Nan::ThrowTypeError(SDL_GetError());
    return;
  }

  SDL_PauseAudio(0);
}

void Init(v8::Local<v8::Object> exports) {
  exports->Set(Nan::New("play").ToLocalChecked(),
               Nan::New<v8::FunctionTemplate>(Play)->GetFunction());
}

NODE_MODULE(sdl2, Init)
