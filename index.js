const ansiEscapes = require("ansi-escapes");
const fs = require("fs");
const NativePlayer = require("native_player");
const readline = require("readline");

let player = new NativePlayer();
player.init(2, 48000);
player.play();
player.queue("lisa0.mp3");
player.queue("short.mp3");
// player.queue("Mixdown(2).mp3");

let cover = fs.readFileSync("cover.jpg");
let coverAnsi = ansiEscapes.image(cover, {
  width: 20
});

// make some room for our UI
for (let i = 0; i < 11; ++i) {
  console.log();
}
process.stdout.write(ansiEscapes.cursorSavePosition);

// display cover
let s = ansiEscapes.cursorHide +
  ansiEscapes.cursorUp(10) +
  coverAnsi +
  ansiEscapes.cursorRestorePosition;
process.stdout.write(s);

// run timer that displays title information
let timerId = setInterval(() => {
  let title = "";
  let song = player.currentSong();
  if (song) {
    title = song.path;
  }

  let s = ansiEscapes.cursorMove(22, -10) +
    ansiEscapes.eraseEndLine +
    title +
    ansiEscapes.cursorRestorePosition;
  process.stdout.write(s);
}, 500);

// handle keypress events
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on("keypress", (ch, key) => {
  if (key.name === "q") {
    // quit application
    process.stdin.setRawMode(false);
    process.stdout.write(ansiEscapes.cursorShow);
    clearInterval(timerId);
    process.exit(0);
  }
});
