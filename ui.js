const ansiEscapes = require("ansi-escapes");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const INTERVAL = 500;

function findTrack(album, path) {
  for (let track of album) {
    if (track.path === path) {
      return track;
    }
  }
  return undefined;
}

function formatTime(time) {
  time = Math.floor(time / 1000);
  let seconds = time % 60;
  let minutes = Math.floor(time / 60);
  return ("" + minutes).padStart(2, "0") + ":" + ("" + seconds).padStart(2, "0");
}

class UI {
  constructor(player, album) {
    this.player = player;
    this.album = album;

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
    process.stdin.setRawMode(true);
    process.stdin.on("keypress", (ch, key) => {
      if (key.name === "q") {
        // quit application
        process.stdin.setRawMode(false);
        process.stdout.write(ansiEscapes.cursorShow);
        this.close();
        process.exit(0);
      } else if (key.name === "space") {
        if (this.paused) {
          player.play();
          this.paused = false;
        } else {
          player.pause();
          this.paused = true;
        }
      }
    });
  }

  close() {
    clearInterval(this.timerId);
  }

  refresh() {
    let song = this.player.currentSong();
    if (song && this.currentSongPath != song.path) {
      this.currentSongPath = song.path;
      this.currentSongElapsed = 0;

      let artist = "";
      let album_name = "";
      let title = "";
      let duration = "";
      let album_info = "";

      let track = findTrack(this.album, this.currentSongPath);
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
          duration = "/ " + formatTime(track.duration * 1000);
        }
        album_info = this.album.length + " songs";
        let album_duration = 0;
        for (let t of this.album) {
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
      formatTime(this.currentSongElapsed) +
      ansiEscapes.cursorRestorePosition;
    process.stdout.write(timestr);

    if (!this.paused) {
      this.currentSongElapsed += INTERVAL;
    }
  }

  _showCover(track) {
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
      let s = ansiEscapes.cursorMove(0, -10) +
        ansiEscapes.image(buf, { width: 20 }) +
        ansiEscapes.cursorRestorePosition;
      process.stdout.write(s);
    });
  }
}

module.exports = UI;
