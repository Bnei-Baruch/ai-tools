import React, { Component, Fragment } from 'react';
import 'semantic-ui-css/semantic.min.css';
import './App.css';
import Transcription from "./AITools/Transcription";

class App extends Component {

  state = {};

  render() {
    return (
        <Fragment>
          <Transcription/>
        </Fragment>
    );
  }
}

export default App;
