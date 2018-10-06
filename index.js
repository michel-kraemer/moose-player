const ffmpeg = require("ffmpeg");
const sdl2 = require("sdl2");
const { h, render, Component, Text } = require("ink");

let speakerConfig = {
  channels: 2,
  bitDepth: 16,
  sampleRate: 48000
};
let buf = ffmpeg.load("Mixdown(2).mp3", speakerConfig.channels, speakerConfig.sampleRate);

sdl2.play(speakerConfig.channels, speakerConfig.sampleRate, buf, buf.length);

class Counter extends Component {
  constructor() {
    super();

    this.state = {
      timestamp: 0
    };
  }

  render() {
    return h(Text, {}, this.state.timestamp);
  }

  componentDidMount() {
  }

  componentWillUnmount() {
  }
}

render(h(Counter));
