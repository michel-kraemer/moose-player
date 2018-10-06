const NativePlayer = require("native_player");
const { h, render, Component, Text } = require("ink");

let player = new NativePlayer();
player.init(2, 48000);
player.play();
// player.queue("lisa0.mp3");
// player.queue("short.mp3");
// player.queue("Mixdown(2).mp3");

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
    player.close();
  }
}

render(h(Counter));
