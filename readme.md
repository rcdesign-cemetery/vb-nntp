Description
===========

NNTP daemon for vbulletin server.

Directory content:

  - **./vb-nntp-core** - core nntp addon for vbulletin (administration, authentication & maintenance)
  - **./vb-nntp_topics_plugin** - map forums to nntp groups
  - **./daemon** - nntp daemon, written on node.js

Requirements
============

  - Forum MUST use UTF-8 codepage.
  - Node.Js 0.4.1+ REQUIRED (with npm)
  - innodb recommended
  - monit recommended (config files included)

Known Issues
============

 1. NNTP clients can't normally use non-latin symbols in login & passwords. If you have such:
    - use email instead of login
    - change password to one with latin chars only
 2. Daemon works in single process and uses single SQL connection to db. That increases latency for huge setups. NNTP can be extended by sql connections pool & multinode on demand.
 3. This server is not 100% compatible with RFC3977 requirements. It implements only subset of commands, really used by nntp clients. If log file has records about unimplemented commands & syntax errors - feel free to report.
    - ARTICLE accept only digital id
    - STAT, NEXT, LAST, NEWNEWS - not implemented
    - LIST NEWSGROUPS - not implemented
 4. No built-in SSL yet. Use stunnel4 now.
 5. Rare races, when connection droped during command process. Session object is dropped, but callback try to access it.

Installation
============

Instructions are for ubuntu 10.04 LTS. Some commands can be different for your system. All commands must be executed under root user.

Setup the pre-requistes:

    apt-get install g++ curl libssl-dev apache2-utils git-core

Download and install node.js
    
    wget http://nodejs.org/dist/node-latest.tar.gz
    gunzip node-latest.tar.gz
    tar -xf node-latest.tar

Enter node src folder, and run

    ./configure
    make
    make install

Install npm, if not exists:

    curl http://npmjs.org/install.sh | sh

Imstall mysql client:
    
    apt-get install libmysqlclient-dev
    npm install node-mysql-libmysqlclient

Setup
=====

 1. Install vBulletin addons from `vb-nntp-core` and `vb-nntp_topics_plugin`
 2. Upload daemon sources, and edit upstart script. Set proper path to your daemon directory
 3. Go to daemon dir, copy `config.example.conf` to `config.conf`, and edit settings. At least, DB paramaters should be set.

RUN
===

 1. `start vbnntp` - start daemon
 2. `stop vbnntp` - stop daemon
 3. `reload vbnntp` - soft reload config & reopen log

Licence
=======

This software is distributed under [Creative Commons BY-CC-ND][1] licence (Noncommercial, No Deriative Works). If you wish to use it on commercial site, or remove copyright messages - you have to buy additional licence from author.

Contacts
========

Licensing & setup: [vitaly@rcdesign.ru][2]

  - using on non-commercial site: Free
  - using on commercial site: 49$ for single domain/server
  - free full licences for all commiters.

  [1]: http://creativecommons.org/licenses/by-nc-nd/3.0/
  [2]: vitaly@rcdesign.ru
