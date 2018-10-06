{
  "targets": [{
    "target_name": "sdl2",
    "sources": [
      "sdl2.cpp"
    ],
    "include_dirs": [
      "<!(node -e \"require('nan')\")"
    ],
    "libraries": [
      "-lsdl2"
    ]
  }]
}
