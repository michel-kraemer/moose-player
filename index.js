const ansiEscapes = require("ansi-escapes");
const chalk = require("chalk");
const fs = require("fs");
const lunr = require("lunr");
const NativePlayer = require("native_player");
const path = require("path");
const readline = require("readline");

if (process.argv.length < 3) {
  console.error("Usage: node index.js [query]");
  process.exit(1);
}

// load database and index
let database = JSON.parse(fs.readFileSync(".database/database.json"));
let serializedIndex = JSON.parse(fs.readFileSync(".database/index.json"));
let index = lunr.Index.load(serializedIndex);

// search for album to play
let searchresults = index.search(process.argv[2]);
if (searchresults.length == 0) {
  console.log("Found no albums");
  process.exit(0);
} else if (searchresults.length > 1) {
  console.log("Found multiple albums:");
  console.log();
  searchresults.forEach(r => console.log("- " + r.ref));
  console.log();
  console.log("Please narrow your search");
  process.exit(0);
}

// sort album tracks
let album = database.albums[searchresults[0].ref];
album.sort((a, b) => {
  if (a.track && b.track) {
    return a.track - b.track;
  }
  return a.title.localeCompare(b.title);
});

// initialize player
let player = new NativePlayer();
player.init(2, 48000);
player.play();
for (let track of album) {
  player.queue(track.path);
}

// make some room for the UI
for (let i = 0; i < 11; ++i) {
  console.log();
}
process.stdout.write(ansiEscapes.cursorSavePosition + ansiEscapes.cursorHide);

function findTrack(path) {
  for (let track of album) {
    if (track.path === path) {
      return track;
    }
  }
  return undefined;
}

function showCover(track) {
  let coverpath;
  if (track.cover) {
    coverpath = ".database/cover" + track.cover;
  } else {
    coverpath = path.join(path.dirname(track.path), "cover.jpg");
  }

  let cover;
  if (fs.existsSync(coverpath)) {
    fs.readFile(coverpath, (err, buf) => {
      if (err) {
        throw err;
      }
      let s = ansiEscapes.cursorMove(0, -10) +
        ansiEscapes.image(buf, { width: 20 }) +
        ansiEscapes.cursorRestorePosition;
      process.stdout.write(s);
    });
  }
}

function formatTime(time) {
  time = Math.floor(time / 1000);
  let seconds = time % 60;
  let minutes = Math.floor(time / 60);
  return ("" + minutes).padStart(2, "0") + ":" + ("" + seconds).padStart(2, "0");
}

// user interface
let currentSongPath;
let currentSongElapsed;
let paused = false;
const interval = 500;
function refreshUI() {
  let song = player.currentSong();
  if (song && currentSongPath != song.path) {
    currentSongPath = song.path;
    currentSongElapsed = 0;

    let artist = "";
    let album_name = "";
    let title = "";
    let duration = "";
    let album_info = "";

    let track = findTrack(currentSongPath);
    if (track) {
      showCover(track);
      artist = track.artist;
      album_name = track.album;
      title = track.title;
      if (track.track) {
        title = track.track + ". " + title;
      }
      if (track.year) {
        album_name = album_name + " (" + track.year + ")";
      }
      if (track.duration) {
        duration = "/ " + formatTime(track.duration * 1000);
      }
      album_info = album.length + " songs";
      let album_duration = 0;
      for (let t of album) {
        if (t.duration) {
          album_duration += t.duration;
        } else {
          album_duration = 0;
          break;
        }
      }
      if (album_duration > 0) {
        album_info = album_info + " (" + formatTime(album_duration * 1000) + ")";
      }
    }

    let infostr = ansiEscapes.cursorMove(21, -10) +
      ansiEscapes.eraseEndLine +
      album_name +
      ansiEscapes.cursorNextLine +
      ansiEscapes.cursorMove(21) +
      ansiEscapes.eraseEndLine +
      chalk.gray(artist) +
      ansiEscapes.cursorNextLine +
      ansiEscapes.cursorNextLine +
      ansiEscapes.cursorMove(21) +
      ansiEscapes.eraseEndLine +
      chalk.bold(title) +
      ansiEscapes.cursorNextLine +
      ansiEscapes.cursorNextLine +
      ansiEscapes.cursorNextLine +
      ansiEscapes.cursorMove(21) +
      ansiEscapes.eraseEndLine +
      ansiEscapes.cursorMove(6) +
      duration +
      ansiEscapes.cursorNextLine +
      ansiEscapes.cursorNextLine +
      ansiEscapes.cursorMove(21) +
      ansiEscapes.eraseEndLine +
      chalk.gray(album_info) +
      ansiEscapes.cursorRestorePosition;
    process.stdout.write(infostr);
  }

  let timestr = ansiEscapes.cursorMove(21, -4) +
    formatTime(currentSongElapsed) +
    ansiEscapes.cursorRestorePosition;
  process.stdout.write(timestr);

  if (!paused) {
    currentSongElapsed += interval;
  }
}
setTimeout(() => refreshUI(), interval / 4);

// run timer that refreshes UI
let timerId = setInterval(refreshUI, interval);

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
  } else if (key.name === "space") {
    if (paused) {
      player.play();
    } else {
      player.pause();
    }
    paused = !paused;
  }
});
