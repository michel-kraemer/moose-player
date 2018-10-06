#include "song.h"
#include <nan.h>

void throwError(const char *message, int error) {
  std::string msg = message;
  msg += " (error '";
  msg += av_err2str(error);
  msg += "')";
  Nan::ThrowTypeError(msg.c_str());
}

Song::Song(const char *path, int destChannels, int destSampleRate) :
    _destChannels(destChannels), _destSampleRate(destSampleRate),
    _streamIndex(0), _format_ctx(0), _codec_ctx(0), _swr(0), _packet(0), _frame(0),
    _resample_buf(0), _resample_buf_linesize(0), _max_resample_buf_samples(0),
    _bufWritePos(0), _bufSize(0), _buf(0), _end_of_file(false), _end_of_decode(false) {
  // get format from audio file
  _format_ctx = avformat_alloc_context();
  if (avformat_open_input(&_format_ctx, path, NULL, NULL) != 0) {
    Nan::ThrowTypeError("Could not open file");
    return;
  }
  if (avformat_find_stream_info(_format_ctx, NULL) < 0) {
    Nan::ThrowTypeError("Could not retrieve stream info from file");
    return;
  }

  // find the index of the first audio stream
  int stream_index = -1;
  for (unsigned int i = 0; i < _format_ctx->nb_streams; ++i) {
    if (_format_ctx->streams[i]->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
      stream_index = i;
      break;
    }
  }
  if (stream_index == -1) {
    Nan::ThrowTypeError("Could not retrieve audio stream from file");
    return;
  }
  _streamIndex = stream_index;
  AVStream *stream = _format_ctx->streams[stream_index];

  // find and open codec
  AVCodecParameters *codecpar = stream->codecpar;
  AVCodec *codec = avcodec_find_decoder(codecpar->codec_id);
  if (!codec) {
    Nan::ThrowTypeError("Could not find suitable decoder");
    return;
  }
  _codec_ctx = avcodec_alloc_context3(codec);
  int error = avcodec_parameters_to_context(_codec_ctx, codecpar);
  if (error < 0) {
    throwError("Could not copy parameters to context", error);
    return;
  }
  if (avcodec_open2(_codec_ctx, codec, NULL) < 0) {
    Nan::ThrowTypeError("Failed to open decoder");
    return;
  }

  // guess channel layout
  int64_t channel_layout = av_get_default_channel_layout(destChannels);

  // prepare resampler
  _swr = swr_alloc();
  av_opt_set_int(_swr, "in_channel_count", codecpar->channels, 0);
  av_opt_set_int(_swr, "out_channel_count", destChannels, 0);
  av_opt_set_int(_swr, "in_channel_layout", codecpar->channel_layout, 0);
  av_opt_set_int(_swr, "out_channel_layout", channel_layout, 0);
  av_opt_set_int(_swr, "in_sample_rate", codecpar->sample_rate, 0);
  av_opt_set_int(_swr, "out_sample_rate", destSampleRate, 0);
  av_opt_set_sample_fmt(_swr, "in_sample_fmt", (AVSampleFormat)codecpar->format, 0);
  av_opt_set_sample_fmt(_swr, "out_sample_fmt", AV_SAMPLE_FMT_S16, 0);
  swr_init(_swr);
  if (!swr_is_initialized(_swr)) {
    Nan::ThrowTypeError("Resampler has not been properly initialized");
    return;
  }

  // prepare to read data
  _packet = av_packet_alloc();
  if (!_packet) {
    Nan::ThrowTypeError("Error allocating packet");
    return;
  }
  av_init_packet(_packet);
  _frame = av_frame_alloc();
  if (!_frame) {
    Nan::ThrowTypeError("Error allocating frame");
    return;
  }
}

Song::~Song() {
  if (_buf) {
    free(_buf);
    _buf = 0;
    _bufSize = 0;
    _bufWritePos = 0;
  }
  if (_resample_buf) {
    av_freep(&_resample_buf);
    _resample_buf = 0;
  }
  if (_packet) {
    av_packet_free(&_packet);
    _packet = 0;
  }
  if (_frame) {
    av_frame_free(&_frame);
    _frame = 0;
  }
  if (_swr) {
    swr_free(&_swr);
    _swr = 0;
  }
  if (_codec_ctx) {
    avcodec_free_context(&_codec_ctx);
    _codec_ctx = 0;
  }
  if (_format_ctx) {
    avformat_free_context(_format_ctx);
    _format_ctx = 0;
  }
}

int Song::EnsureBytes(int n) {
  if (_bufWritePos >= n) {
    return n;
  }

  int error;
  AVCodecParameters *codecpar = _format_ctx->streams[_streamIndex]->codecpar;
  while (!_end_of_decode && _bufWritePos < n) {
    if (!_end_of_file) {
      error = av_read_frame(_format_ctx, _packet);
      if (error == AVERROR_EOF) {
        av_packet_unref(_packet);
        _end_of_file = true;
      } else if (error < 0) {
        throwError("Could not read frame", error);
        return 0;
      }
      if (_packet->stream_index != _streamIndex) {
        av_packet_unref(_packet);
        continue;
      }
    }

    // send packet to decoder
    if ((error = avcodec_send_packet(_codec_ctx, _packet)) < 0) {
      throwError("Could not send packet for decoding", error);
      return 0;
    }

    // receive frame from decoder
    error = avcodec_receive_frame(_codec_ctx, _frame);
    if (error == AVERROR(EAGAIN)) {
      // try again
      av_packet_unref(_packet);
      av_frame_unref(_frame);
      continue;
    } else if (error == AVERROR_EOF) {
      _end_of_decode = true;
      break;
    } else if (error < 0) {
      throwError("Could not decode frame", error);
    }

    // resample frames
    int req_buffer_samples = av_rescale_rnd(swr_get_delay(_swr, codecpar->sample_rate) +
        _frame->nb_samples, _destSampleRate, codecpar->sample_rate, AV_ROUND_UP);
    if (!_resample_buf || req_buffer_samples > _max_resample_buf_samples) {
      if (_resample_buf) {
        av_freep(&_resample_buf);
      }
      if ((error = av_samples_alloc((uint8_t **)&_resample_buf, &_resample_buf_linesize,
            _destChannels, req_buffer_samples, AV_SAMPLE_FMT_S16, 0)) < 0) {
        throwError("Could not allocate converted samples", error);
        return 0;
      }
      _max_resample_buf_samples = req_buffer_samples;
    }

    int frame_count = swr_convert(_swr, (uint8_t **)&_resample_buf, req_buffer_samples,
        (const uint8_t **)_frame->data, _frame->nb_samples);
    int dst_bufsize = av_samples_get_buffer_size(&_resample_buf_linesize, _destChannels,
        frame_count, AV_SAMPLE_FMT_S16, 1);

    // append resampled frames to data
    if (!_buf) {
      _bufSize = dst_bufsize;
      _buf = (char *)malloc(_bufSize);
    } else if (_bufWritePos + dst_bufsize > _bufSize) {
      _bufSize = _bufWritePos + dst_bufsize;
      _buf = (char *)realloc(_buf, _bufSize);
    }
    memcpy(_buf + _bufWritePos, _resample_buf, dst_bufsize);
    _bufWritePos += dst_bufsize;

    av_packet_unref(_packet);
    av_frame_unref(_frame);
  }
  return _bufWritePos < n ? _bufWritePos : n;
}

const char *Song::GetBuffer() {
  return _buf;
}

void Song::DidRead(int n) {
  _bufWritePos = _bufWritePos - n;
  memmove(_buf, _buf + n, _bufWritePos);
}
