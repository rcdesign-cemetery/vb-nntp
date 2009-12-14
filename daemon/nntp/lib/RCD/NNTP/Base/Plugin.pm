#
#   Copyright © 2008, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Base::Plugin;

    #
    #   NNTP Plugin base
    #

    use strict;
    use Exporter qw(import);
    use MIME::Base64 qw(encode_base64 decode_base64);
    use Time::HiRes qw(gettimeofday tv_interval);
    use Cache::FastMmap;
    use Wildev::AppServer::Toolkit;

    our $VERSION = "0.05"; # $Date: 2009/12/11 16:58:29 $

    our @EXPORT    = qw();
    our @EXPORT_OK = qw(WriteClient cache dbi check_dbi uuid client cnf);


    sub new
    {
      my $class = shift;
      my $ref   = ref( $_[0] ) ? $_[0] : { @_ };
      my $self  = bless $ref => $class;

      $self->{Toolkit} = Wildev::AppServer::Toolkit->instance();

      $self->init();

      $self;
    }


    sub init {}


    #
    #   Put data to output buffer
    #
    #   Input parameters:
    #     uuid - Connection ID
    #     data - Data ti put to buffer (array/scalar)
    #

    sub WriteClient ($)
    {
      my $self = shift;
      my $uuid = shift;

      my $client = $self->{Toolkit}->Clients->{$uuid};

      $client->{Output} .= join( "\015\012", @_, '' );

      1;
    }


    #
    #   Force print out data from buffer to client
    #
    #   Input parameters:
    #     uuid - Connection ID
    #

    sub FlushBuffer ($)
    {
      my $self = shift;
      my $uuid = shift;

      my $client = $self->{Toolkit}->Clients->{$uuid};

      &{$client->{FlushOutput}}();

      1;
    }


    #
    #   Get commands list handled by plugin (works with Plugins/xxx.pm)
    #

    sub import_commands
    {
      my $class  = shift;
      my $caller = caller();

      my $self   = $class->new( @_ );

      return []
        unless scalar keys %{ $self->{COMMANDS} };

      no strict 'refs';

      my @commands;

      foreach my $command ( keys %{ $self->{COMMANDS} } )
      {
        my $sub = $self->{COMMANDS}->{$command};

        #
        #   Add available command
        #

        push @commands, [ $command => sub{ $self->$sub( @_ ) } ];
      }

      # return hooks list
      \@commands;
    }


    #
    #   Check some conditions such as auth, online/offline forum mode
    #
    #   Input parameters:
    #     uuid - Connection ID
    #

    sub check_conditions
    {
      my $self = shift;
      my $uuid = shift;

      my $client = $self->{Toolkit}->Clients->{$uuid};

      #
      #   Set default log levels (defined within config)
      #

      $self->setloglevel( $uuid );

      #
      #   Auth check
      #

      if( $self->checkauth( $uuid ) )
      {
        #
        #   Set debug log level if applicable for current user
        #

        $self->setloglevel( $uuid );

        #
        #   Reload config
        #

        $self->cnf->Reload();

        #
        #   Check online/offline forum mode
        #

        if( $self->checkonline( $uuid ) )
        {
          return 1;
        }
      }

      return 0;
    }


    #
    #   Checks forum is online or forum offline and user is an administrator
    #
    #   Input parameters:
    #     uuid - Connection ID
    #

    sub checkonline
    {
      my $self = shift;
      my $uuid = shift;

      unless( 0 + $self->cnf->Get( 'backend.BBActive' ) )
      {
        #
        #   Forum is offline => check if user is an admin
        #

        my $admingroups =
          ref( $self->cnf->Get( 'backend.AdminGroups' ) ) eq 'ARRAY'
            ?   $self->cnf->Get( 'backend.AdminGroups' )
            : [ $self->cnf->Get( 'backend.AdminGroups' ) ];

        foreach my $admingroupid ( @{ $admingroups } )
        {
          foreach my $usergroupid ( @{ $self->client( $uuid )->{usergroupslist} } )
          {
            if( $admingroupid == $usergroupid )
            {
              #
              #   User is an admin and can use gate even when forum is offline
              #

              return 1;
            }
          }
        }

        #
        #   User is not an admin so he can't use gate where forum is offline
        #

        $self->WriteClient( $uuid, '400 The service is temporary offline' );

        return 0;
      }

      1;
    }


    #
    #   Checks auth flag and prints auth required to client if flag is negative
    #
    #   Input parameters:
    #     uuid - Connection ID
    #

    sub checkauth
    {
      my $self = shift;
      my $uuid = shift;

      my $client = $self->{Toolkit}->Clients->{$uuid};

      return 1
        if $client->{auth_ok};

      $self->WriteClient( $uuid, '480 Authentication required' );

      return 0;
    }


    #
    #   [Set and] return current connection id
    #

    sub uuid
    {
      my $self = shift;
      my $uuid = shift;

      $self->{uuid} = $uuid
        if $uuid;

      $self->{uuid};
    }


    #
    #   Returns link to hash with current connection client's data
    #
    #   Input parameters:
    #     uuid - Connection ID
    #

    sub client
    {
      my $self = shift;
      my $uuid = shift || $self->uuid;

      $self->{Toolkit}->Clients->{$uuid};
    }


    #
    #   Returns link to hash with shared within process data
    #

    sub cache
    {
      my $self = shift;

      $self->{Toolkit}->Shared;
    }


    #
    #   Returns config object
    #

    sub cnf
    {
      my $self = shift;

      $self->{Toolkit}->Config;
    }


    #
    #   Check if DB connection is alive
    #

    sub check_dbi
    {
      my $self = shift;

      #
      #   Maximum number of attempts to connect to DB if connection is broken
      #

      my $attempts = 2;

      my $cache = $self->cache;

      #
      #   Current connection status:
      #     0 - broken (default)
      #     1 - alive
      #

      my $status = 0;

      if( $cache->{dbi} && $cache->{dbi}->{dbh} )
      {
        while( $attempts && !$status )
        {
          #
          #   Test if connection is alive
          #
  
          $self->{Toolkit}->Logger->debug(
              'Test if connection to DB server is alive...'
            );
  
          my $res = $cache->{dbi}->{dbh}->ping;
  
          if( $res )
          {
            $self->{Toolkit}->Logger->debug( '... ok' );
            $status = 1;
          }
          else
          {
            $self->{Toolkit}->Logger->debug( '... broken' );
            $status = 0;
  
            $cache->{dbi}->{dbh} = undef;
          }

          unless( $status )
          {
            #
            #   Try to connect
            #

            $self->{Toolkit}->Logger->debug(
                'Attempt to connect to DB'
              );

            $self->dbi;
          }

          $attempts --;
        }
      }

      $status;
    }


    #
    #   Returns DBI object
    #

    sub dbi
    {
      my $self = shift;

      my $cache = $self->cache;

      #
      #   If method called first time prepare cache to store connection info
      #

      unless( $cache->{dbi} )
      {
        $cache->{dbi} = {
            dbh => undef,
            cnf => undef,
          };
      }

      unless( $cache->{dbi}->{dbh} )
      {
        $self->{Toolkit}->Logger->debug( 'Open new DB connection' );

        unless( $cache->{dbi}->{cnf} )
        {
          #
          #   Initialize DB config info (to use it if method called from
          #   a module that do not have valid 'cnf' method)
          #

          $self->{Toolkit}->Logger->debug( 'Initialize DB config info' );

          my $cnf = $self->cnf;

          $cache->{dbi}->{cnf} = {
              DSN         =>
                'dbi:' . lc( $cnf->Get( 'cache.dbDriver' ) ) . ':'
                  . 'database='.$cnf->Get( 'cache.dbDataSource' ) . ';'
                  . (
                      $cnf->Get( 'cache.dbUseSocket' )
                        ? 'mysql_socket='.$cnf->Get( 'cache.dbSocket' )
                        : 'host='        .$cnf->Get( 'cache.dbHost'   ).';'.
                          'port='        .$cnf->Get( 'cache.dbPort'   )
                    ),
              Username    => $cnf->Get( 'cache.dbUsername' ),
              Password    => $cnf->Get( 'cache.dbPassword' ),

              DriverName  => $cnf->Get( 'cache.dbDriver'   ),
              Charset     => $cnf->Get( 'cache.dbCharset'  ),
            };
        }

        my $cnf = $cache->{dbi}->{cnf};

        my $dbh = $self->{Toolkit}->Factory->Create(
            'DBI',
            '-sub' => 'connect_cached',
            $cnf->{DSN}     ,
            $cnf->{Username},
            $cnf->{Password},
            {
              RaiseError => 1,
              PrintError => 1,
              AutoCommit => 1,
            },
          ) || $self->{Toolkit}->Logger->warning( $DBI::errstr );

        if( $dbh && 'mysql' eq lc( $cnf->{DriverName} ) )
        {
          #
          #   mysql_auto_reconnect is a big bug, do not use it anymore!
          #
          #   $cache->{dbi}->{mysql_auto_reconnect} = 1;
          #

          if( $cnf->{Charset} )
          {
            $dbh->do(
                'SET NAMES ?',
                undef,
                $cnf->{Charset}
              ) || $self->{Toolkit}->Logger->warning( $DBI::errstr );
          }

          $cache->{dbi}->{dbh} = $dbh;
        }
      }

      $cache->{dbi}->{dbh};
    }


    #
    #   Returns RCD::NNTP::Tools::Backend to communicate with backend
    #
    #   Input parameters:
    #     uuid - Connection ID
    #

    sub forum
    {
      my $self = shift;
      my $uuid = shift;

      my $cache = $self->cache;

      unless( $cache->{be} )
      {
        $cache->{be} = $self->{Toolkit}->Factory->Create(
            'RCD::NNTP::Tools::Backend',
            $self->{Toolkit}->Config->Get( 'BACKEND' ),
          );
      }

      #
      #   Set current connection id
      #

      $cache->{be}->uuid( $uuid );

      $cache->{be};
    }


    #
    #   Parse given date/time string from client
    #   Returns hash with values
    #
    #   Input parameters:
    #     date - text line
    #     time - text line
    #     gmt  - text line: GMT or empty
    #

    sub parse_date_time
    {
      my $self = shift;

      my $date = shift;
      my $time = shift;
      my $gmt  = shift;

      my $info = {};

      if( $date =~ /^(\d{2}|\d{4})(\d{2})(\d{2})$/ )
      {
        #
        #   RFC 3977 (7.3.2)
        #
        #   The date is specified as 6 or 8 digits in the format [xx]yymmdd,
        #   where xx is the first two digits of the year (19-99), yy is the last
        #   two digits of the year (00-99), mm is the month (01-12), and dd is
        #   the day of the month (01-31). Clients SHOULD specify all four digits
        #   of the year.  If the first two digits of the year are not specified
        #   (this is supported only for backward compatibility), the year is to
        #   be taken from the current century if yy is smaller than or equal to
        #   the current year, and the previous century otherwise.
        #

        $info->{year}  = $1;
        $info->{month} = $2 + 0;
        $info->{day}   = $3 + 0;

        if( length( $info->{year} ) )
        {
          $info->{year} += 0;

          my @current_time     = $gmt eq 'GMT' ? gmtime : localtime;
             $current_time[5] += 1900;
          my $current_year     = $current_time[5] % 100;
          my $current_century  = $current_time[5] - $current_year;

          $info->{year} +=
            $info->{year} <= $current_year
              ?   $current_century
              : ( $current_century - 100 );
        }
      }
      else
      {
        $info->{year}  = 2000;
        $info->{month} = 1;
        $info->{day}   = 1;
      }

      if( $time =~ /^(\d{2})(\d{2})(\d{2})$/ )
      {
        #
        #   RFC 3977 (7.3.2)
        #
        #   The time is specified as 6 digits in the format hhmmss, where hh is
        #   the hours in the 24-hour clock (00-23), mm is the minutes (00-59),
        #   and ss is the seconds (00-60, to allow for leap seconds).  The token
        #   "GMT" specifies that the date and time are given in Coordinated
        #   Universal Time [TF.686-1]; if it is omitted, then the date and time
        #   are specified in the server's local timezone.  Note that there is no
        #   way of using the protocol specified in this document to establish
        #   the server's local timezone.
        #

        $info->{hours}   = $1 + 0;
        $info->{minutes} = $2 + 0;
        $info->{seconds} = $3 + 0;

        $info->{hours}   = $info->{hours}   <= 23 ? $info->{hours}   : 0;
        $info->{minutes} = $info->{minutes} <= 59 ? $info->{minutes} : 0;
        $info->{seconds} = $info->{seconds} <= 59 ? $info->{seconds} : 0;
      }
      else
      {
        $info->{hours}   = 0;
        $info->{minutes} = 0;
        $info->{seconds} = 0;
      }

      foreach( keys %{ $info } )
      {
        #
        #   Format each value to have 2 digits, except 'year' - 4 digits
        #

        if( $_ ne 'year' )
        {
          $info->{$_} = sprintf( "%02d", $info->{$_} );
        }
        else
        {
          $info->{$_} = sprintf( "%04d", $info->{$_} );
        }
      }

      $info->{gmt} = $gmt eq 'GMT' ? 'GMT' : '';

      $info;
    }


    #
    #   Build message id string as "<groupid>.<messageid>@<gateid>"
    #   Example: "12.5902@example.com"
    #
    #   Input parameters:
    #     group id   - int
    #     message id - int
    #     gate id    - text line
    #

    sub build_message_id
    {
      my $self = shift;

      my ( $groupid, $messageid, $gateid ) = @_;

      return $groupid . '.' . $messageid . '@' . $gateid;
    }


    #
    #   Build reference id string as "<groupid>.<referenceid>.ref@<gateid>"
    #   Example: "12.120.ref@example.com"
    #
    #   Input parameters:
    #     group id     - int
    #     reference id - int
    #     gate id      - text line
    #

    sub build_ref_id
    {
      my $self = shift;

      my ( $groupid, $refid, $gateid ) = @_;

      return $groupid . '.' . $refid . '.ref@' . $gateid;
    }


    #
    #   Replaces given named parameters within given text
    #
    #   Input parameters:
    #     text
    #     array/hash of named parameters
    #

    sub replace_parameters
    {
      my $self = shift;
      my $text = shift;

      my $params = ref( $_[0] ) ? $_[0] : { @_ };

      foreach my $key ( keys %{ $params } )
      {
        $text =~ s[<% $key %>][$params->{$key}]ig;
      }

      $text;
    }


    #
    #   Set usual (defined withi config) or debug log level depending
    #   on userid
    #
    #   Input parameters:
    #     uuid - Connection ID
    #

    sub setloglevel ($)
    {
      my $self = shift;
      my $uuid = shift;

      my $minlevel = $self->cnf->Get( 'log.MinLevel' );
      my $maxlevel = $self->cnf->Get( 'log.MaxLevel' );

      if( $self->client( $uuid )->{userid} > 0 )
      {
        #
        #   Check if current user should be logged with debug info
        #

        my @debuguserslist = split( ',', $self->cnf->Get( 'log.DebugUsers' ) );

        foreach my $checkuserid ( @debuguserslist )
        {
          if( $checkuserid == $self->client( $uuid )->{userid} )
          {
            $minlevel = 'emerg';
            $maxlevel = 'debug';

            last;
          }
        }
      }

      $self->{Toolkit}->Logger->set_level(
          'file-out' => {
              'minlevel' => $minlevel,
              'maxlevel' => $maxlevel,
            }
        );

      1;
    }


# end of the RCD::NNTP::Base::Plugin package

1;
