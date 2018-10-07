# Moose Player [![Apache License, Version 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](http://www.apache.org/licenses/LICENSE-2.0)

> A simplistic console music player

<img src="./screenshot.jpg" width="426">

## Features

* Very simple interface
* Focus on your albums
* Search your music database via [lunr](https://lunrjs.com)
* Displays cover art (works best on [iTerm2](https://www.iterm2.com))
* Supports most audio formats (e.g. MP3, OGG, MP4, M4A, FLAC, WAV, AAC)
* Backed by [ffmpeg](http://ffmpeg.org)/[libav](https://libav.org) and [SDL](https://www.libsdl.org)

## Installing/Building

    git clone https://github.com/michel-kraemer/moose-player.git
    cd moose-player
    yarn

Requires `libav` and `libsdl` to be present on your system.

## Usage

First index your music collection:

    node reindex.js "~/My Music"

This has only be done once or whenever your music collection has changed.

Then run the player with a [lunr](https://lunrjs.com) to select an album to play:

    node index.js "+Kenneth +Retrospect"

Press `q` to exit.

License
-------

Moose Player is licensed under the
[Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
