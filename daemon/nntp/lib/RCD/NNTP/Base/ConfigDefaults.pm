#
#   Copyright © 2009, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Base::ConfigDefaults;

    #
    #   NNTP Config defaults
    #

    use strict;

    our $VERSION = "0.01"; # $Date: 2009/11/24 14:45:23 $


    sub new
    {
      my $class = shift;
      my $ref   = ref( $_[0] ) ? $_[0] : { @_ };
      my $self  = bless $ref => $class;

      $self->{Defaults} = q{
          [appserver]
          Listen            = 
          LocalAddr         = 0.0.0.0
          LocalPort         = 119
          SockTimeOut       = 30
          IdleCheckTime     = 5
          PreforkKids       = 5
          MaxKids           = 5
          MaxSpareKids      = 5
          MinSpareKids      = 5
          ClientTimeOut     = 30
          PrcCheckTime      = 30
          ChrootDir         = .
          ProcTitle         = NNTP-Server
          MaxReqLen         = 1
          Pid               = /var/run/nntp-vb.pid
          KidsPid           = /var/run
  
          [log]
          # http://search.cpan.org/~bloonix/Log-Handler-0.63/lib/Log/Handler.pm
          # Log Levels are:
          #   debug (highest), info, notice, warn[ing], err[or],
          #   crit[ical], alert, emerg[ency] (lowest)
          FileName          = /var/log/nntp-vb.log
          Mode              = append
          MinLevel          = emerg
          MaxLevel          = error
          NewLine           = yes
          DebugTrace        = no
          DebugMode         = 1
          AutoFlush         = yes
  
          [handler]
          Controller        = Wildev::AppServer::Protocol::NNTP
  
          [nntp]
          PluginBaseName    = RCD::NNTP::Plugins
          Plugins           = [ article, authinfo, group, list, mode, newgroups, newnews, xhdr, xover, date ]
          AllowPosting      = no
  
          [backend]
          URI               = /nntp/backend.php
          ConnTimeout       = 10
          UserAgent         = NNTP.Frontend
          TablePrefix       = 
          FromAddress       = nobody@example.com
          GateID            = rcd.nntpgate
          Charset           = UTF-8
          ContentType       = text/html
          AdminGroups       = [ 6 ]
        };

      #
      #   This map used to load server settings from DB
      #

      $self->{DBMap} = {
          nntp_server_addr    => 'appserver.LocalAddr',
          nntp_port           => 'appserver.LocalPort',
          nntp_demo_delay     => 'nntp.DemoDelay'     ,
          nntp_message_id     => 'backend.GateID'     ,
          nntp_forum_charset  => 'backend.Charset'    ,
          nntp_from_address   => 'backend.FromAddress',
          bburl               => 'backend.BBURL'      ,
          bbactive            => 'backend.BBActive'   ,
          nntp_debug_users    => 'log.DebugUsers'     ,
        };

      $self;
    }


# end of the RCD::NNTP::Base::ConfigDefaults package

1;
