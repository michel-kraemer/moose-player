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

// load database
let albums = {};
let database = JSON.parse(fs.readFileSync("database.json"));
let covers = database.covers;
let index = lunr(function() {
  this.field("artist");
  this.field("album");
  this.field("title");
  this.ref("ref");
  database.index.forEach(track => {
    track.ref = track.artist + " - " + track.album;
    if (!albums[track.ref]) {
      albums[track.ref] = [];
    }
    albums[track.ref].push(track);
    this.add(track);
  });
});

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
let album = albums[searchresults[0].ref];
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
  let cover;
  if (track.cover) {
    cover = Buffer.from(covers[track.cover], "base64");
  } else {
    let coverpath = path.join(path.dirname(track.path), "cover.jpg");
    if (fs.existsSync(coverpath)) {
      cover = fs.readFileSync(coverpath);
    }
  }

  if (cover) {
    let s = ansiEscapes.cursorMove(0, -10) +
      ansiEscapes.image(cover, { width: 20 }) +
      ansiEscapes.cursorRestorePosition;
    process.stdout.write(s);
  }
}

function formatTime(time) {
  time = Math.floor(time / 1000);
  let seconds = time % 60;
  let minutes = Math.floor(time / 60);
  return ("" + minutes).padStart(2, "0") + ":" + ("" + seconds).padStart(2, "0");
}

// run timer that displays title information
let currentSongPath;
let currentSongElapsed;
let paused = false;
const interval = 500;
let timerId = setInterval(() => {
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
}, interval);

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
