'use strict';

const fs = require('fs');
const util = require('util');
const path = require('path');
const childProcess = require('child_process');

function exec(command, options) {
  const output = childPro