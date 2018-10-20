// @flow

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const tty = require("tty");

const ansiEscapes = require("ansi-escapes");
const chalk = require("chalk");
const NativePlayer = require("native-player");

const INTERVAL = 500;
const CURRENT_TRACK_STRING_TIMEOUT = 500;

/**
   * The audio player
   */
let player: NativePlayer;

/**
 * The album currently being played
 */
let album: Track[];

/**
 * A function that will be called when the UI is closed
 */
let closeCallback: () => void;

/**
 * The path to the cover of the track currently being played
 */
let currentCoverpath: string;

/**
 * The timestamp when the first bytes were read from the current song
 */
let currentSongFirstReadTimestamp: number = 0;

/**
 * The duration of the song currently being played
 */
let currentSongDuration: number = Number.MAX_VALUE;

/**
 * The path of the song currently being played
 */
let currentSongPath: ?string;

/**
 * True of the player is paused
 */
let paused: boolean;

/**
 * The timestamp when the player was paused
 */
let pausedTimestamp: number;

/**
 * The ID of the timer that refreshes the UI
 */
let timerId: IntervalID;

/**
 * A string of recently pressed number keys. This string will be used to
 * jump to a matching track. For example, if the "5" key is pressed, the
 * player will jump to the fifth song. If "01" has been pressed, it will
 * jump to the first song, and if "10" has been pressed, to the tenth. The
 * string will be reset after CURRENT_TRACK_STRING_TIMEOUT ms.
 */
let currentTrackString: string = "";

/**
 * A timer that will reset the current track string and jump to the
 * specified song if possible
 */
let currentTrackStringTimeout: ?TimeoutID;

function findTrack(path: string): ?Track {
  for (const track of album) {
    if (track.path === path) {
      return track;
    }
  }
  return undefined;
}

function findTrackByTrackString(trackString: string): number {
  const maxTrackStringLength = Math.floor(Math.log(album.length));

  let result = 0;
  for (let i = 1; i <= album.length; ++i) {
    let ts = String(i);
    if (trackString[0] === "0") {
      ts = ts.padStart(maxTrackStringLength, "0");
    }
    if (ts.startsWith(trackString)) {
      if (result > 0) {
        return 0;
      }
      result = i;
    }
  }

  return result;
}

function formatTime(time: number): string {
  time = Math.floor(time / 1000);
  const seconds = time % 60;
  const minutes = Math.floor(time / 60);
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

function showCover(track: Track) {
  let coverpath;
  if (track.cover) {
    coverpath = ".database/cover" + track.cover;
  } else {
    coverpath = path.join(path.dirname(track.path), "cover.jpg");
  }

  if (currentCoverpath === coverpath) {
    return;
  }
  currentCoverpath = coverpath;

  fs.readFile(coverpath, (err, buf) => {
    if (err) {
      throw err;
    }
    const s = ansiEscapes.cursorMove(0, -10) +
      ansiEscapes.image(buf, { width: 20 }) +
      ansiEscapes.cursorRestorePosition;
    process.stdout.write(s);
  });
}

function onKeyQuit() {
  // quit application
  if (process.stdin instanceof tty.ReadStream) {
    process.stdin.setRawMode(false);
  }
  process.stdout.write(ansiEscapes.cursorShow);
  close();
  if (closeCallback) {
    closeCallback();
  }
}

function onKeyPause() {
  if (paused) {
    player.play();
    currentSongFirstReadTimestamp += Date.now() - pausedTimestamp;
    paused = false;
  } else {
    player.pause();
    pausedTimestamp = Date.now();
    paused = true;
  }
}

function onKeyNumber(n: string) {
  if (currentTrackStringTimeout) {
    clearTimeout(currentTrackStringTimeout);
    currentTrackStringTimeout = undefined;
  }
  currentTrackString += n;
  const track = findTrackByTrackString(currentTrackString);
  if (track > 0) {
    currentTrackString = "";
    currentSongPath = undefined;
    player.goto(track);
  } else {
    currentTrackStringTimeout = setTimeout(() => {
      const n = Number(currentTrackString);
      if (n > 0 && n <= album.length) {
        currentSongPath = undefined;
        player.goto(n);
      }
      currentTrackString = "";
    }, CURRENT_TRACK_STRING_TIMEOUT);
  }
}

function open(player_: NativePlayer, album_: Track[], closeCallback_: () => void) {
  player = player_;
  album = album_;
  closeCallback = closeCallback_;

  // make some room for the UI
  for (let i = 0; i < 11; ++i) {
    process.stdout.write("\n");
  }
  process.stdout.write(ansiEscapes.cursorSavePosition + ansiEscapes.cursorHide);

  // run timer that refreshes UI
  setTimeout(() => refresh(), INTERVAL / 4);
  refresh();
  timerId = setInterval(() => refresh(), INTERVAL);

  // handle keypress events
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin instanceof tty.ReadStream) {
    process.stdin.setRawMode(true);
  }
  process.stdin.on("keypress", (ch, key) => {
    if (key.name === "q") {
      onKeyQuit();
    } else if (key.name === "space") {
      onKeyPause();
    } else if (key.name === "n" || key.name === "down") {
      player.next();
    } else if (key.name === "p" || key.name === "up") {
      player.prev();
    } else if (key.name >= "0" && key.name <= "9") {
      onKeyNumber(key.name);
    }
  });
}

function close() {
  clearInterval(timerId);
}

function refresh() {
  const song = player.currentSong();
  if (song && currentSongPath !== song.path) {
    currentSongPath = song.path;
    currentSongFirstReadTimestamp = song.firstReadTimestamp || Date.now();
    currentSongDuration = Number.MAX_VALUE;

    // also set pausedTimestamp to beginning of the song so we get a correct
    // display if we change songs while we're paused
    pausedTimestamp = currentSongFirstReadTimestamp;

    let artist = "";
    let album_name = "";
    let title = "";
    let duration = "";
    let album_info = "";

    const track = findTrack.call(this, currentSongPath);
    if (track) {
      showCover.call(this, track);
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
        currentSongDuration = track.duration * 1000;
        duration = "00:00 / " + formatTime(currentSongDuration);
      }
      album_info = album.length + " songs";
      let album_duration = 0;
      for (const t of album) {
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

    const infostr = ansiEscapes.cursorMove(21, -10) +
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
      duration +
      ansiEscapes.cursorNextLine +
      ansiEscapes.cursorNextLine +
      ansiEscapes.cursorMove(21) +
      ansiEscapes.eraseEndLine +
      chalk.gray(album_info) +
      ansiEscapes.cursorRestorePosition;
    process.stdout.write(infostr);
  }

  let now = Date.now();
  if (paused) {
    now = pausedTimestamp;
  }
  const elapsed = now - currentSongFirstReadTimestamp;
  if (!song.endOfDecode || elapsed < currentSongDuration) {
    const timestr = ansiEscapes.cursorMove(21, -4) +
      formatTime(elapsed) + ansiEscapes.cursorRestorePosition;
    process.stdout.write(timestr);
  }
}

module.exports = open;
