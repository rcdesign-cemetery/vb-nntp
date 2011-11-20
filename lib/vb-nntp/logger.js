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


var LEVELS = {
  verbose: 1,
  debug:   2,
  info:    4,
  notice:  8,
  warn:    16,
  error:   32
};


winston.addColors({
  verbose: 'grey',
  debug:   'blue',
  info:    'yellow',
  notice:  'yellow',
  warn:    'red',
  error:   'red'
});


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


Logger.create = function (options) {
  return new Logger(options);
};


Logger.attachLogger = function (process, logger) {
  process.on('message', function (log) {
    if (log.lvl && log.msg) {
      logger[log.lvl](log.msg, log.meta);
    }
  });
};


Logger.createSlave = function (process) {
  var logger = {};
  
  Object.getOwnPropertyNames(LEVELS).forEach(function (lvl) {
    logger[lvl] = function (msg, meta) {
      // pass args as array to guarantee it will be array in master proccess
      process.send({lvl: lvl, msg: msg, meta: meta});
    };
  });

  return logger;
};


Logger.dummy = {};
Object.getOwnPropertyNames(LEVELS).forEach(function (lvl) {
  Logger.dummy[lvl] = function silence() {};
});


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
