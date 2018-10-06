#include <nan.h>

extern "C" {
#include <libavutil/opt.h>
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libswresample/swresample.h>
}

void throwError(const char *message, int error) {
  std::string msg = message;
  msg += " (error '";
  msg += av_err2str(error);
  msg += "')";
  Nan::ThrowTypeError(msg.c_str());
}

// adapted from https://rodic.fr/blog/libavcodec-tutorial-decode-audio-file/
// TODO correctly free data structures on throw
void Load(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  if (info.Length() < 3) {
    Nan::ThrowTypeError("Wrong number of arguments");
    return;
  }

  if (!info[0]->IsString()) {
    Nan::ThrowTypeError("'filename' must be a string");
    return;
  }

  if (!info[1]->IsNumber()) {
    Nan::ThrowTypeError("'channels' must be a number");
    return;
  }

  if (!info[2]->IsNumber()) {
    Nan::ThrowTypeError("'sample_rate' must be a number");
    return;
  }

  v8::String::Utf8Value utfpath(info[0]->ToString());
  std::string path = std::string(*utfpath);

  int channels = info[1]->NumberValue();
  double sample_rate = info[2]->NumberValue();

  // get format from audio file
  AVFormatContext *ctx = avformat_alloc_context();
  if (avformat_open_input(&ctx, path.c_str(), NULL, NULL) != 0) {
    Nan::ThrowTypeError("Could not open file");
    return;
  }
  if (avformat_find_stream_info(ctx, NULL) < 0) {
    Nan::ThrowTypeError("Could not retrieve stream info from file");
    return;
  }

  // find the index of the first audio stream
  int stream_index = -1;
  for (unsigned int i = 0; i < ctx->nb_streams; ++i) {
    if (ctx->streams[i]->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
      stream_index = i;
      break;
    }
  }
  if (stream_index == -1) {
    Nan::ThrowTypeError("Could not retrieve audio stream from file");
    return;
  }
  AVStream *stream = ctx->streams[stream_index];

  // find and open codec
  AVCodecParameters *codecpar = stream->codecpar;
  AVCodec *codec = avcodec_find_decoder(codecpar->codec_id);
  AVCodecContext *c = avcodec_alloc_context3(codec);
  int error = avcodec_parameters_to_context(c, stream->codecpar);
  if (error < 0) {
    throwError("Could not copy parameters to context", error);
    return;
  }
  if (avcodec_open2(c, codec, NULL) < 0) {
    Nan::ThrowTypeError("Failed to open decoder");
    return;
  }

  // guess channel layout
  int64_t channel_layout = av_get_default_channel_layout(channels);

  // prepare resampler
  SwrContext *swr = swr_alloc();
  av_opt_set_int(swr, "in_channel_count", codecpar->channels, 0);
  av_opt_set_int(swr, "out_channel_count", channels, 0);
  av_opt_set_int(swr, "in_channel_layout", codecpar->channel_layout, 0);
  av_opt_set_int(swr, "out_channel_layout", channel_layout, 0);
  av_opt_set_int(swr, "in_sample_rate", codecpar->sample_rate, 0);
  av_opt_set_int(swr, "out_sample_rate", sample_rate, 0);
  av_opt_set_sample_fmt(swr, "in_sample_fmt", (AVSampleFormat)codecpar->format, 0);
  av_opt_set_sample_fmt(swr, "out_sample_fmt", AV_SAMPLE_FMT_S16, 0);
  swr_init(swr);
  if (!swr_is_initialized(swr)) {
    Nan::ThrowTypeError("Resampler has not been properly initialized");
    return;
  }

  // prepare to read data
  AVPacket packet;
  av_init_packet(&packet);
  AVFrame *frame = av_frame_alloc();
  if (!frame) {
    Nan::ThrowTypeError("Error allocating frame");
    return;
  }

  // iterate through frames
  short *buffer = NULL;
  int max_buffer_samples = 0;
  int dst_linesize = 0;
  char *data = (char *)malloc(0);
  int size = 0;
  while (true) {
    error = av_read_frame(ctx, &packet);
    if (error == AVERROR_EOF) {
      break;
    } else if (error < 0) {
      throwError("Could not read frame", error);
      return;
    }

    // send packet to decoder
    if ((error = avcodec_send_packet(c, &packet)) < 0) {
      throwError("Could not send packet for decoding", error);
      return;
    }

    // receive frame from decoder
    error = avcodec_receive_frame(c, frame);
    if (error == AVERROR(EAGAIN)) {
      // try again
      av_packet_unref(&packet);
      av_frame_unref(frame);
      continue;
    } else if (error == AVERROR_EOF) {
      break;
    } else if (error < 0) {
      throwError("Could not decode frame", error);
    }

    // resample frames
    int req_buffer_samples = av_rescale_rnd(swr_get_delay(swr, codecpar->sample_rate) +
        frame->nb_samples, sample_rate, codecpar->sample_rate, AV_ROUND_UP);
    if (buffer == NULL || req_buffer_samples > max_buffer_samples) {
      if (buffer != NULL) {
        av_freep(&buffer);
      }
      if ((error = av_samples_alloc((uint8_t**)&buffer, &dst_linesize, channels,
            frame->nb_samples, AV_SAMPLE_FMT_S16, 0)) < 0) {
        throwError("Could not allocate converted samples", error);
        return;
      }
      max_buffer_samples = req_buffer_samples;
    }

    int frame_count = swr_convert(swr, (uint8_t**)&buffer, frame->nb_samples,
        (const uint8_t**)frame->data, frame->nb_samples);
    int dst_bufsize = av_samples_get_buffer_size(&dst_linesize, channels,
        frame_count, AV_SAMPLE_FMT_S16, 1);

    // append resampled frames to data
    data = (char *)realloc(data, size + dst_bufsize);
    memcpy(data + size, buffer, dst_bufsize);
    size += dst_bufsize;

    av_packet_unref(&packet);
    av_frame_unref(frame);
  }

  // clean up
  if (buffer) {
    av_freep(&buffer);
  }
  av_frame_free(&frame);
  swr_free(&swr);
  avcodec_free_context(&c);
  avformat_free_context(ctx);

  Nan::MaybeLocal<v8::Object> buf = Nan::NewBuffer(data, size);
  info.GetReturnValue().Set(buf.ToLocalChecked());
}

void Init(v8::Local<v8::Object> exports) {
  exports->Set(Nan::New("load").ToLocalChecked(),
               Nan::New<v8::FunctionTemplate>(Load)->GetFunction());
}

NODE_MODULE(ffmpeg, Init)
