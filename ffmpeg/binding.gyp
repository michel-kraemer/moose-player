{
  "targets": [{
    "target_name": "ffmpeg",
    "sources": [
      "ffmpeg.cpp"
    ],
    "include_dirs": [
      "<!(node -e \"require('nan')\")"
    ],
    "libraries": [
      "-lavformat"
    ]
  }]
}
