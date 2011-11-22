/**
 *  VBNNTP - Logger
 *
 *  License: Creative Commons BY-NC-ND 3.0
 *           http://creativecommons.org/licenses/by-nc-nd/3.0/
 *  
 *  Author: Vitaly Puzrin <vitaly@rcdesign>
 *  Author: Aleksey V Zapparov <ixti@member.fsf.org> (http://www.ixti.net)
 *  
 *  Copyright (C) RC Design, Vitaly Puzrin
 */


'use strict';


var winston = require('winston');


//  available log levels of logger
var LEVELS = {
  verbose: 1,
  debug:   2,
  info:    4,
  notice:  8,
  warn:    16,
  error:   32
};


// colors of levels (when log file is `colorized`)
winston.addColors({
  verbose: 'grey',
  debug:   'blue',
  info:    'yellow',
  notice:  'yellow',
  warn:    'red',
  error:   'red'
});


// Slavery logger transport that sends mesages to master. We need it to reduce
// amount of useless IPC calls (e.g. no need to pass `debug` log events when
// severity level is `info` and so on.
var ChildProcTransport = function (process, severity) {
  winston.Transport.call(this, { level: severity.toLowerCase() });
  this._process = process;
};

require('util').inherits(ChildProcTransport, winston.Transport);

ChildProcTransport.prototype.name = 'child_proc';
ChildProcTransport.prototype.log = function (level, msg, meta, callback) {
  this._process.send({lvl: level, msg: msg, meta: meta});
  callback(null, true);
};


// PUBLIC API //////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////


var Logger = module.exports = function Logger(options) {
  var logger;

  if (!(this instanceof Logger)) {
    return new Logger(options);
  }

  logger = new (winston.Logger)({ exitOnError: false, levels: LEVELS });

  if (options.enabled) {
    logger.add(winston.transports.File, {
      filename: options.file,
      level: options.severity.toLowerCase(),
      timestamp: true,
      // By default File transport logs as JSON (if explicitly not FALSE).
      // JSON formatter of winston is something more or less unpredictable,
      // e.g. log('a', 'b', 'c') will produce: 'c' due to internal formatting
      json: !!options.json,
      colorize: !!options.colorize
    });
  }

  // colorize logger and expose logging methods to returned object
  logger.extend(this);

  this.restart = function () {
    var file = logger.transports[winston.transports.File.prototype.name];
    if (file) {
      // close stream, so it will be recreated on next message
      file._createStream();
    }
  };
};


// master logger factory
Logger.create = function (options) {
  return new Logger(options);
};


// start listen messages from slave logger on master
Logger.listenSlaveLogger = function (master, logger) {
  master.on('message', function (log) {
    if (log.lvl && log.msg) {
      logger[log.lvl](log.msg, log.meta);
    }
  });
};


// slave (worker) logger factory
Logger.createSlaveLogger = function (worker, severity) {
  var logger, obj = {};
  
  logger = new (winston.Logger)({
    levels: LEVELS,
    exitOnError: false,
    transports: [ new ChildProcTransport(worker, severity) ]
  });

  logger.extend(obj);
  return obj;
};


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
