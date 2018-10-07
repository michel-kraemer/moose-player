const fs = require("fs");
const mm = require("music-metadata");
const path = require("path");
const rmdir = require("rmdir");

if (process.argv.length < 3) {
  console.error("Usage: node reindex.js [directory]");
  process.exit(1);
}

let covers = [];
let dir = process.argv[2];
(async () => {
  let index = await reindex(dir);
  let result = {
    index
  };

  rmdir(".database", () => {
    fs.mkdirSync(".database");
    fs.writeFileSync(".database/database.json", JSON.stringify(result, undefined, 2));
    for (let i in covers) {
      let c = covers[i];
      fs.writeFileSync(".database/cover" + i, Buffer.from(c, "base64"));
    }
  })
})();

function makeCover(cover) {
  let i = covers.indexOf(cover);
  if (i == -1) {
    i = covers.length;
    covers.push(cover);
  }
  return i;
}

async function reindex(dir) {
  let result = [];
  let files = fs.readdirSync(dir, { withFileTypes: true });
  for (let f of files) {
    let absolutePath = path.join(dir, f.name);
    if (f.isDirectory()) {
      result = result.concat(await reindex(absolutePath));
    } else {
      try {
        let metadata = await mm.parseFile(absolutePath);
        let cover = undefined;
        if (metadata.common.picture) {
          cover = makeCover(metadata.common.picture[0].data.toString("base64"));
        }
        let track = undefined;
        if (metadata.common.track && metadata.common.track.no) {
          track = metadata.common.track.no;
        }
        let simple = {
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
      } catch (e) {
        console.log(absolutePath);
        console.warn(e.message);
      }
    }
  }
  return result;
}
