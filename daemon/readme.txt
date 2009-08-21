Description:
------------

Демон NNTP-гейта.

./nntp - код демона
./init.d-scripts - скрипты для автоматического запуска, под разные OS.

Для работы требует дополнительных perl-библиотек.


Installation:
-------------

Необходимые модули perl:

	DBI
	DBD::mysql
	LWP::UserAgent
	PHP::Serialization
	Digest::MD5
	Data::UUID
	Class::Accessor::Lvalue
	Log::Handler
	Encode
	Cache::FastMmap
	JSON::Syck
	LWP::UserAgent
	Time::HiRes
	Fcntl
	MIME::Base64
	HTML::Entities

Установка в общем случае:

из под пользователем root запустить

  perl -MCPAN -e shell

и для каждого модуля выполнить install, например:

  install Data::UUID

Установка для Ubuntu:
  apt-get install \
	liblog-handler-perl \
	libclass-accessor-lvalue-perl \
	libdata-uuid-perl \
	libphp-serialization-perl \
	libcache-fastmmap-perl \
	libdbi-perl \
	libdbd-mysql-perl \
	libjson-perl \
	libtime-hires-perl \
	libmime-base64-perl
		

После установки необходимо выполнить

  enc2xs -C

для генерации Encode::ConfigLocal


Для автоматического запуска сервера при старте системы необходимо скопировать
файл nntpd из директории init.d-scripts/debian (для ОС, основанных на Debian,
например, Ubuntu) или init.d-scripts/redhat (для ОС, основанных на RedHat,
например, Fedora или CentOS) в директорию /etc/init.d/. После копирования
требуется выполнить:
	для Debian: update-rc.d nntpd defaults
	для RedHat: chkconfig --add nntpd
