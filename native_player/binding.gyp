{
  "targets": [{
    "target_name": "native_player",
    "sources": [
      "native_player.cpp",
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
