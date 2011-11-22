/**
 *  VBNNTP - Common
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


// list of non-enumerable fields of Error object (thanks to that smart ass who
// decided to hide them out in node >= 0.5.x) that we want to expose in logs
var ERR_FIELDS = ['code', 'stack'];


// stringifies error
module.exports.dumpError = function (err) {
  var str = err.message || err.toString();

  Object.keys(err).forEach(function (key) {
    if (-1 === ERR_FIELDS.indexOf(key)) {
      str += '\n  ' + key + ': ' + err[key];
    }
  });

  ERR_FIELDS.forEach(function (key) {
    if (err[key]) {
      str.error += '\n  ' + key + ': ' + err[key];
    }
  });

  return str;
};


// parses strings `localhost:123` into hash of `{host: 'localhost', port: 123}`
module.exports.parseListenString = function (binding) {
  binding = binding.split(':');
  return (1 === binding.length) ? {address: '0.0.0.0',  port: +binding[0]}
                                : {address: binding[0], port: +binding[1]};
};


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
