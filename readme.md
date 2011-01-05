Description
===========

NNTP daemon for vbulletin server.

Directory content:

  - vb-nntp-core - core nntp addon for vbulletin (administration, authentication & maintenance)
  - vb-nntp_topics_plugin - map forums to nntp groups
  - daemon - nntp daemon, written on node.js

Requirements
============

Forum MUST use UTF-8 codepage.

Known Issues
============

 1. NNTP clients can't normally use non-latin symbols in login & passwords. If you have such:
    - use email instead of login
    - change password to one with latin chars only
 2. This server is not 100% compatible with RFC3977 requirements. It implements only subset of commants, that are really used by nntp clients. If log file has records about unimplemented commands & syntax errors - feel free to report.

Installation
============

Instructions are for ubuntu 10.04 LTS. Some commands can be different for your system. All commands must be executed under root user.

Setup the pre-requistes:

    apt-get install g++ curl libssl-dev apache2-utils git-core

Download and install node.js
    
    wget http://nodejs.org/dist/node-v0.3.3.tar.gz
    gunzip node-v0.3.3.tar.gz
    tar -xf node-v0.3.3.tar
    cd node-v0.3.3
    ./configure
    make
    make install

Install node-mysql-libmysqlclient

    apt-get install libmysqlclient-dev

    git clone git://github.com/Sannis/node-mysql-libmysqlclient.git
    cd node-mysql-libmysqlclient

    node-waf configure build

    mkdir -p /usr/local/lib/node/mysql/
    cp -R build /usr/local/lib/node/mysql/build
    cp mysql_bindings.node /usr/local/lib/node/mysql/
    cp mysql-libmysqlclient.js /usr/local/lib/node/mysql/


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
  - using on commercial site: 49$
  - copyright removal at your site and messages: 99$
  - commercial + (c) removal + setup help: 299$

If you make commits - ask fo free licences.

  [1]: http://creativecommons.org/licenses/by-nc-nd/3.0/
  [2]: vitaly@rcdesign.ru