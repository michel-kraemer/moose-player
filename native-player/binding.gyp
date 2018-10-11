{
  "targets": [{
    "target_name": "native-player",
    "sources": [
      "native-player.cpp",
      "song.cpp"
    ],
    "include_dirs": [
      "<!(node -e \"require('nan')\")"
    ],
    "libraries": [
      "-lavformat",
      "-lsdl2"
    ]
  }]
}
