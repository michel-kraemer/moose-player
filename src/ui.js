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

function findTrack(album: Track[], path: string): ?Track {
  for (const track of album) {
    if (track.path === path) {
      return track;
    }
  }
  return undefined;
}

function findTrackByTrackString(album: Track[], trackString: string): number {
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

class UI {
  /**
   * The audio player
   */
  player: NativePlayer;

  /**
   * The album currently being played
   */
  album: Track[];

  /**
   * A function that will be called when the UI is closed
   */
  close_callback: () => void;

  /**
   * The path to the cover of the track currently being played
   */
  coverpath: string;

  /**
   * The timestamp when the first bytes were read from the current song
   */
  currentSongFirstReadTimestamp: number;

  /**
   * The duration of the song currently being played
   */
  currentSongDuration: number;

  /**
   * The path of the song currently being played
   */
  currentSongPath: ?string;

  /**
   * True of the player is paused
   */
  paused: boolean;

  /**
   * The timestamp when the player was paused
   */
  pausedTimestamp: number;

  /**
   * The ID of the timer that refreshes the UI
   */
  timerId: IntervalID;

  /**
   * A string of recently pressed number keys. This string will be used to
   * jump to a matching track. For example, if the "5" key is pressed, the
   * player will jump to the fifth song. If "01" has been pressed, it will
   * jump to the first song, and if "10" has been pressed, to the tenth. The
   * string will be reset after CURRENT_TRACK_STRING_TIMEOUT ms.
   */
  currentTrackString: string;

  /**
   * A timer that will reset the current track string and jump to the
   * specified song if possible
   */
  currentTrackStringTimeout: ?TimeoutID;

  constructor(player: NativePlayer, album: Track[], close_callback: () => void) {
    this.player = player;
    this.album = album;
    this.close_callback = close_callback;
    this.currentSongFirstReadTimestamp = 0;
    this.currentSongDuration = Number.MAX_VALUE;
    this.currentTrackString = "";
  }

  open() {
    // make some room for the UI
    for (let i = 0; i < 11; ++i) {
      process.stdout.write("\n");
    }
    process.stdout.write(ansiEscapes.cursorSavePosition + ansiEscapes.cursorHide);

    // run timer that refreshes UI
    setTimeout(() => this.refresh(), INTERVAL / 4);
    this.refresh();
    this.timerId = setInterval(() => this.refresh(), INTERVAL);

    // handle keypress events
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin instanceof tty.ReadStream) {
      process.stdin.setRawMode(true);
    }
    process.stdin.on("keypress", (ch, key) => {
      if (key.name === "q") {
        // quit application
        if (process.stdin instanceof tty.ReadStream) {
          process.stdin.setRawMode(false);
        }
        process.stdout.write(ansiEscapes.cursorShow);
        this.close();
        if (this.close_callback) {
          this.close_callback();
        }
      } else if (key.name === "space") {
        if (this.paused) {
          this.player.play();
          this.currentSongFirstReadTimestamp += Date.now() - this.pausedTimestamp;
          this.paused = false;
        } else {
          this.player.pause();
          this.pausedTimestamp = Date.now();
          this.paused = true;
        }
      } else if (key.name === "n" || key.name === "down") {
        this.player.next();
      } else if (key.name === "p" || key.name === "up") {
        this.player.prev();
      } else if (key.name >= "0" && key.name <= "9") {
        if (this.currentTrackStringTimeout) {
          clearTimeout(this.currentTrackStringTimeout);
          this.currentTrackStringTimeout = undefined;
        }
        this.currentTrackString += key.name;
        const track = findTrackByTrackString(this.album, this.currentTrackString);
        if (track > 0) {
          this.currentTrackString = "";
          this.currentSongPath = undefined;
          this.player.goto(track);
        } else {
          this.currentTrackStringTimeout = setTimeout(() => {
            const n = Number(this.currentTrackString);
            if (n > 0 && n <= this.album.length) {
              this.currentSongPath = undefined;
              this.player.goto(n);
            }
            this.currentTrackString = "";
          }, CURRENT_TRACK_STRING_TIMEOUT);
        }
      }
    });
  }

  close() {
    clearInterval(this.timerId);
  }

  refresh() {
    const song = this.player.currentSong();
    if (song && this.currentSongPath !== song.path) {
      this.currentSongPath = song.path;
      this.currentSongFirstReadTimestamp = song.firstReadTimestamp || Date.now();
      this.currentSongDuration = Number.MAX_VALUE;

      // also set pausedTimestamp to beginning of the song so we get a correct
      // display if we change songs while we're paused
      this.pausedTimestamp = this.currentSongFirstReadTimestamp;

      let artist = "";
      let album_name = "";
      let title = "";
      let duration = "";
      let album_info = "";

      const track = findTrack(this.album, this.currentSongPath);
      if (track) {
        this._showCover(track);
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
          this.currentSongDuration = track.duration * 1000;
          duration = "00:00 / " + formatTime(this.currentSongDuration);
        }
        album_info = this.album.length + " songs";
        let album_duration = 0;
        for (const t of this.album) {
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
    if (this.paused) {
      now = this.pausedTimestamp;
    }
    const elapsed = now - this.currentSongFirstReadTimestamp;
    if (!song.endOfDecode || elapsed < this.currentSongDuration) {
      const timestr = ansiEscapes.cursorMove(21, -4) +
        formatTime(elapsed) + ansiEscapes.cursorRestorePosition;
      process.stdout.write(timestr);
    }
  }

  _showCover(track: Track) {
    let coverpath;
    if (track.cover) {
      coverpath = ".database/cover" + track.cover;
    } else {
      coverpath = path.join(path.dirname(track.path), "cover.jpg");
    }

    if (this.coverpath === coverpath) {
      return;
    }
    this.coverpath = coverpath;

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
}

module.exports = UI;
