'use strict';

var fs               = require('fs');
var EOL              = require('os').EOL;
var format           = require('../../format');
var consoleTransport = require('../console');
var findLogPath      = require('./find-log-path');

transport.findLogPath            = findLogPath;
transport.format                 = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
transport.timeStampPostfixFormat = '{y}{m}{d}{h}{i}{s}';
transport.level                  = 'warn';
transport.maxSize                = 1024 * 1024;
transport.maxItems               = 4;
transport.streamConfig           = undefined;

module.exports = transport;

function transport(msg) {
  var text = format.format(msg, transport.format) + EOL;

  if (transport.stream === undefined) {
    initSteamConfig();
    openStream();
  }

  if (transport.level === false) {
    return;
  }

  var needLogRotation = transport.maxSize > 0 &&
    getStreamSize(transport.stream) > transport.maxSize;

  if (needLogRotation) {
    archiveLog(transport.stream);
    openStream();
  }

  transport.stream.write(text);
}

function initSteamConfig() {
  transport.file = transport.file || findLogPath(transport.appName);

  if (!transport.file) {
    transport.level = false;
    logConsole('Could not set a log file');
  }
}

function openStream() {
  if (transport.level === false) {
    return;
  }

  transport.stream = fs.createWriteStream(
    transport.file,
    transport.streamConfig || { flags: 'a' }
  );
}

function getStreamSize(stream) {
  if (!stream) {
    return 0;
  }

  if (stream.logSizeAtStart === undefined) {
    try {
      stream.logSizeAtStart = fs.statSync(stream.path).size;
    } catch (e) {
      stream.logSizeAtStart = 0;
    }
  }

  return stream.logSizeAtStart + stream.bytesWritten;
}

function archiveLog(stream) {
  if (stream.end) {
    stream.end();
  }

  var logFileName = stream.path.substring(stream.path.lastIndexOf('/') + 1);
  var folderPath = stream.path.substring(0, stream.path.lastIndexOf('/'));

  // Ensure that there are only 2 old log files maximum at this moment.
  try {
    var allFiles = fs.readdirSync(folderPath);
    var postfixes = [];
    var converted = null;
    var i = 0;

    for (i = 0; i < allFiles.length; i++) {
      if (allFiles[i].includes(logFileName + '-')) {
        converted = parseInt(allFiles[i].substring(logFileName.length + 1), 10);
        if (isNaN(converted)) {
          converted = 0;
        }
        postfixes.push(converted);
      }
    }
    
    postfixes.sort(function(a, b) { return a - b; });

    for (i = 0; i < postfixes.length - (transport.maxItems - 2); i++) {
      fs.unlinkSync(stream.path + '-' + postfixes[i]);
    }
  } catch (e) {
    logConsole('Could not read log directory contents');
  }

  // Archive active log file to new one with timestamp
  try {
    var now = new Date();
    var timezoneOffset = now.getTimezoneOffset();
    now.setHours(now.getHours() + timezoneOffset / 60);
    var postfix = format.formatTimeStamp(transport.timeStampPostfixFormat, now);
    fs.renameSync(stream.path, stream.path + '-' + postfix);
  } catch (e) {
    logConsole('Could not rotate log', e);
  }
}

function logConsole(message, error) {
  var data = ['electron-log.transports.file: ' + message];

  if (error) {
    data.push(error);
  }

  consoleTransport({ data: data, date: new Date(), level: 'warn' });
}
