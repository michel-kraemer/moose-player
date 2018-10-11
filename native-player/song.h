#ifndef SONG_H
#define SONG_H

#include <string>

extern "C" {
#include <libavutil/opt.h>
#include <libavformat/avformat.h>
#include <libswresample/swresample.h>
}

class Song {
private:
  std::string _path;
  int _total_read;

  int _destChannels;
  int _destSampleRate;
  int _streamIndex;
  AVFormatContext *_format_ctx;
  AVCodecContext *_codec_ctx;
  SwrContext *_swr;
  AVPacket *_packet;
  AVFrame *_frame;

  short *_resample_buf;
  int _resample_buf_linesize;
  int _max_resample_buf_samples;

  int _bufWritePos;
  int _bufSize;
  char *_buf;

  bool _end_of_file;
  bool _end_of_decode;

public:
  Song(const char *path, int destChannels, int destSampleRate);
  ~Song();

  int EnsureBytes(int n);
  const char *GetBuffer();
  void DidRead(int n);
  const std::string &GetPath();
  int GetElapsedMilliseconds();
};

#endif
