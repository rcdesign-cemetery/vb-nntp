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


var COLORS = {
  verbose: 'grey',
  debug:   'blue',
  info:    'yellow',
  error:   'red'
};



var Logger = module.exports = function Logger(options) {
  var logger;

  if (!(this instanceof Logger)) {
    return new Logger(options);
  }

  logger = new (winston.Logger)({ exitOnError: false, levels: LEVELS });

  if (options.enabled) {
    logger.add(winston.transports.File, {
      filename: options.file,
      level: options.severity.toLowerCase()
    });
  }

  // colorize logger and expose logging methods to returned object
  logger.addColors(COLORS);
  logger.extend(this);
};


Logger.create = function (options) {
  return new Logger(options);
};


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
