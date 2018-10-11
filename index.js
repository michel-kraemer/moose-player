#!/usr/bin/env node

const fs = require("fs");

const lunr = require("lunr");
const NativePlayer = require("native-player");

const UI = require("./ui");

if (process.argv.length < 3) {
  console.error("Usage: node index.js [query]");
  process.exit(1);
}

// load database and index
const database = JSON.parse(fs.readFileSync(".database/database.json"));
const serializedIndex = JSON.parse(fs.readFileSync(".database/index.json"));
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
const album = database.albums[searchresults[0].ref];
album.sort((a, b) => {
  if (a.track && b.track) {
    return a.track - b.track;
  }
  return a.title.localeCompare(b.title);
});

// initialize player
const player = new NativePlayer();
player.init(2, 48000);
player.play();
album.forEach(track => {
  player.queue(track.path);
});

// initialize UI
const ui = new UI(player, album, () => {
  process.exit(0);
});
ui.open();
