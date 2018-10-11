#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const lunr = require("lunr");
const mm = require("music-metadata");
const rmdir = require("rmdir");

if (process.argv.length < 3) {
  console.error("Usage: node reindex.js [directory]");
  process.exit(1);
}

const covers = [];
const dir = process.argv[2];
(async () => {
  const index = await reindex(dir);

  const albums = {};
  index.forEach(track => {
    track.ref = track.artist + " - " + track.album;
    if (!albums[track.ref]) {
      albums[track.ref] = [];
    }
    albums[track.ref].push(track);
  });

  const result = {
    albums
  };

  rmdir(".database", () => {
    fs.mkdirSync(".database");
    fs.writeFileSync(".database/database.json", JSON.stringify(result, undefined, 2));
    covers.forEach((c, i) => {
      fs.writeFileSync(".database/cover" + i, Buffer.from(c, "base64"));
    });

    const li = lunr(function () {
      this.field("artist");
      this.field("album");
      this.field("title");
      this.ref("ref");
      index.forEach(track => {
        track.ref = track.artist + " - " + track.album;
        this.add(track);
      });
    });
    fs.writeFileSync(".database/index.json", JSON.stringify(li.toJSON(), undefined, 2));
  });
})();

function makeCover(cover) {
  let i = covers.indexOf(cover);
  if (i === -1) {
    i = covers.length;
    covers.push(cover);
  }
  return i;
}

async function reindex(dir) {
  let result = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const absolutePath = path.join(dir, f.name);
    if (f.isDirectory()) {
      result = result.concat(await reindex(absolutePath));
    } else {
      try {
        const metadata = await mm.parseFile(absolutePath);
        let cover;
        if (metadata.common.picture) {
          cover = makeCover(metadata.common.picture[0].data.toString("base64"));
        }
        let track;
        if (metadata.common.track && metadata.common.track.no) {
          track = metadata.common.track.no;
        }
        const simple = {
          artist: metadata.common.artist,
          album: metadata.common.album,
          track,
          title: metadata.common.title,
          year: metadata.common.year,
          cover,
          duration: metadata.format.duration,
          path: absolutePath
        };
        result.push(simple);
      } catch (error) {
        console.log(absolutePath);
        console.warn(error.message);
      }
    }
  }
  return result;
}
