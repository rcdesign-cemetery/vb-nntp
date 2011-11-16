/**
 *  VBNNTP - Commander
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


var Commander = module.exports = function Commander(database, logger) {
  // some logic will be here
};


Commander.create = function (database, logger) {
  return new Commander(database, logger);
};


Commander.prototype.processor = function (req, res) {
  res.end('Not implemented yet');
};


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
