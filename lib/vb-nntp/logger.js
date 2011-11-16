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
  error:   8
};


winston.addColors({
  verbose: 'grey',
  debug:   'blue',
  info:    'yellow',
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
      colorize: !!options.colorize
    });
  }

  // colorize logger and expose logging methods to returned object
  logger.extend(this);
};


Logger.create = function (options) {
  return new Logger(options);
};


// create lightweight dummy logger that will log into console and will be
// enabled ONLY when NODE_DEBUG env variable contains nntp
Logger.dummy = function (logger) {
  var debug = (process.env.NODE_DEBUG && /nntp/.test(process.env.NODE_DEBUG))
            ? function () { console.log(Array.prototype.slice.call(arguments).join(' ')); }
            : function () {};

  Object.keys(LEVELS).forEach(function (lvl) { logger[lvl] = debug; });
  return logger;
}({});


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
