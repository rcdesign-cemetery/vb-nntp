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

    our $VERSION = "0.03"; # $Date: 2009/08/11 01:30:48 $

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

      if( $date =~ /^(\d\d)(\d\d)(\d\d)$/ )
      {
        #
        #   The date is sent as 6 digits in the format YYMMDD, where YY is the
        #   last two digits of the year, MM is the two digits of the month
        #   (with leading zero, if appropriate), and DD is the day of the month
        #   (with leading zero, if appropriate).
        #
        #   The closest century is assumed as part of the year
        #   (i.e., 86 specifies 1986, 30 specifies 2030, 99 is 1999, 00 is
        #   2000).
        #

        $info->{year}  = $1 <= 50 ? ( 2000 + $1 ) : ( 1900 + $1 );

        $info->{month} = $2 + 0;
        $info->{day}   = $3 + 0;
      }
      else
      {
        $info->{year}  = 2000;
        $info->{month} = 1;
        $info->{day}   = 1;
      }

      if( $time =~ /^(\d\d)(\d\d)(\d\d)$/ )
      {
        #
        #   Time must also be specified.  It must be as 6 digits HHMMSS with HH
        #   being hours on the 24-hour clock, MM minutes 00-59, and SS seconds
        #   00-59.  The time is assumed to be in the server's timezone unless
        #   the token "GMT" appears, in which case both time and date are
        #   evaluated at the 0 meridian.
        #

        $info->{hours}   = $1 + 0;
        $info->{minutes} = $2 + 0;
        $info->{seconds} = $3 + 0;
      }
      else
      {
        $info->{hours}   = 0;
        $info->{minutes} = 0;
        $info->{seconds} = 1;
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


# end of the RCD::NNTP::Base::Plugin package

1;
