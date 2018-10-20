#!/usr/bin/env node

// @flow

const fs = require("fs");

const lunr = require("lunr");
const NativePlayer = require("native-player");

const ui = require("./ui");

if (process.argv.length < 3) {
  console.error("Usage: node index.js [query]");
  process.exit(1);
}

// load database and index
const database = JSON.parse(fs.readFileSync(".database/database.json", "utf-8"));
const serializedIndex = JSON.parse(fs.readFileSync(".database/index.json", "utf-8"));
const index = lunr.Index.load(serializedIndex);

// search for album to play
const searchresults = index.search(process.argv[2]);
if (searchresults.length === 0) {
  console.log("Found no albums");
  process.exit(1);
} else if (searchresults.length > 1) {
  console.log("Found multiple albums:");
  console.log();
  searchresults.forEach(r => console.log("- " + r.ref));
  console.log();
  console.log("Please narrow your search");
  process.exit(1);
}

// sort album tracks
const album: Track[] = database.albums[searchresults[0].ref];
album.sort((a, b) => {
  if (a.track && b.track) {
    return a.track - b.track;
  }
  return a.title.localeCompare(b.title);
});

// get best matching sample rate
let sampleRate = 44100; // minimum sample rate
album.forEach(track => {
  if (track.sampleRate > sampleRate) {
    sampleRate = track.sampleRate;
  }
});

// initialize player
const player = new NativePlayer();
player.init(2, sampleRate);
player.play();
album.forEach(track => {
  player.queue(track.path);
});

// initialize UI
ui(player, album, () => {
  process.exit(0);
});
