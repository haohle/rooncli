#!/usr/bin/env node
'use strict';

// Redirect all console output so Roon SDK logs never reach the terminal UI
const fs = require('fs');
const logStream = fs.createWriteStream('/tmp/rooncli.log', { flags: 'a' });
['log', 'error', 'warn', 'info', 'debug'].forEach(method => {
  console[method] = (...args) => logStream.write(`[${method}] ${args.map(String).join(' ')}\n`);
});

const React = require('react');
const { render } = require('ink');
const App = require('./src/App');

render(React.createElement(App));
