/**
 * Config module.
 * 
 * Loads configuration from file & adds vB settings from db 
 * 
 * @link https://github.com/rcdesign/vb-nntp_gate
 * 
 * @license http://creativecommons.org/licenses/by-nc-nd/3.0/ Creative Commons BY-CC-ND
 *  
 * @author Vitaly Puzrin <vitaly@rcdesign.ru>
 * @author Evgeny Shluropat <vitaly@rcdesign.ru>
 * 
 * @copyright RC Design, Vitaly Puzrin
*/
var fs = require('fs');
var url = require('url');

var db = require('./db.js');

var cfg_path = "config.ini";


/**
 * Config variables, accessible to all modules
 */
exports.vars = {};


/**
 * Parse INI file
 *
 *      [section]
 *      key=param
 *      ; comment
 */
var parseIniFile = function (iniFilename) {
    var cfg = {};
    var ini_lines;
    var ini_file;
    
    try {
        ini_file = fs.readFileSync(iniFilename, 'utf-8');
    } catch (e) {
        return null;
    }

    ini_lines = ini_file.split(/\r\n|\r|\n/);

    for(var i=0; i<ini_lines.length; i++) {
        var line = ini_lines[i];
        var match;
        
        // skip comments string
        if (/^\s*(;|$)/.test(line)) { continue; }
        
        // ripped off [section] - /^\s*\[\s*([^\]]*)\s*\]\s*$/
        // try to match line with parameter
        match = line.match(/^\s*(\w+)\s*=\s*(.*)\s*$/); 
        if (match) {
            cfg[match[1]] = match[2].replace(/(^\s+)|(\s+$)/g, "");
        } 
    }
    return cfg;
};


/**
 *  Parse list string
 *
 *  @param {String} str Multiple params, separated by comma
 * 
 *      error, info, multistring
 * 
 *  @return {Array}
 */
exports.get_list = function(str) {
    var result = [];
    str = str.replace(/^\s+|\s+$/g, '');
    if (0 !== str.length)
    {
        result = str.split(',');
        
        for (var i = 0; i < result.length; i++) {
            result[i] =  result[i].replace(/^\s+|\s+$/g, '');
        }
    }
    return result;
};


/**
 * Join vBulletin settings from db to config
 * 
 * @param {Object} cfg  Hash with config vars
 */
var mergeVbulletinSettings = function(cfg) {
    var settings_map = { 
            nntp_demo_delay : 'DemoDelay',
            nntp_message_id : 'GateId',
            nntp_from_address : 'FromAddress',
            bburl : 'ForumUrl',
            bbactive : 'Active'
    };
    
    var settings_str = '';

    Object.keys(settings_map).forEach(function(element, index, array) {
        settings_str += "'" + element + "',";
    });
    settings_str = settings_str.slice(0,-1);

    var res = db.querySync('SELECT * FROM ' + cfg.TablePrefix + 'setting WHERE varname IN(' + settings_str + ')');

    var rows = res.fetchAllSync();
    for (var i=0; i<rows.length; i++) {
        var key = settings_map[rows[i].varname];
        cfg[key] = rows[i].value;
    }

    if (cfg.ForumUrl) {
        var URL = url.parse(cfg.ForumUrl);
        cfg.authHost = URL.hostname;
        cfg.authPort = URL.port || 80;
    }
  
    return cfg;
};


/**
 * Load all config variables (from file + db)
 * Throws exception on error
 */
exports.load = function() {
    var cfg = parseIniFile(cfg_path);

    // simple checks
    if(!cfg) {
        throw Error('Fatal fuckup: failed to open config file. RTFM!');
    }
    if (!cfg.DaemonPort && !cfg.DaemonSslPort) {
        throw Error('Both standard and ssl ports not selected.');
    }
    if (!cfg.DaemonHost) {
        throw Error('No binding address defined.');
    }
    if (!!cfg.DaemonSslPort && !cfg.PemFile) {
        throw Error('You have to define PEM-container with certificate & key, prior to use SSL.');
    }
    if (cfg.PemFile && !fs.statSync(cfg.PemFile).isFile()) {
        throw Error('Can\'t read certificate');
    }

    // Set defaults
    cfg.MaxClients      = cfg.MaxClients || 50;
    cfg.InactiveTimeout = cfg.InactiveTimeout || 15;
    cfg.Host            = cfg.Host || 'localhost';
    cfg.Port            = cfg.Port || 3306;
    cfg.TablePrefix     = cfg.TablePrefix || '';
    cfg.DaemonTitle     = cfg.DaemonTitle || 'vbnntp';
    
    // check db connection
    if (!db.test(cfg)) {
        throw Error('Db connection failed to ' + cfg.DataSource + '@' +
            cfg.Host + '. Check config settings.');
    }

    // setup config vars & apply vb settings
    this.vars = cfg;
    this.vars = mergeVbulletinSettings(cfg);
};

