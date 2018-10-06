const ansiEscapes = require("ansi-escapes");
const fs = require("fs");
const NativePlayer = require("native_player");
const path = require("path");
const readline = require("readline");

if (process.argc < 2) {
  console.error("Usage: node index.js [directory]");
  process.exit(1);
}

let dir = process.argv[2];
let files = fs.readdirSync(dir, { withFileTypes: true });
files = files.filter(f => {
  return f.isFile() && (
    f.name.toLowerCase().endsWith(".aac") ||
    f.name.toLowerCase().endsWith(".m4a") ||
    f.name.toLowerCase().endsWith(".mp3") ||
    f.name.toLowerCase().endsWith(".ogg") ||
    f.name.toLowerCase().endsWith(".wav")
  );
});
files = files.map(f => f.name);

let player = new NativePlayer();
player.init(2, 48000);
player.play();
for (let f of files) {
  player.queue(path.join(dir, f));
}

let coverPath = path.join(dir, "cover.jpg");
if (!fs.existsSync(coverPath)) {
  coverPath = "cover.jpg";
}
let cover = fs.readFileSync(coverPath);
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
    title = path.basename(song.path, path.extname(song.path));
  }

  let s = ansiEscapes.cursorMove(21, -10) +
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
