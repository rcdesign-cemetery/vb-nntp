#
#   Copyright © 2008, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Plugins::AUTHINFO;

    #
    #   AUTHINFO handler
    #

    use strict;
    use Digest::MD5 qw(md5_hex);
    use MIME::Base64 qw(encode_base64 decode_base64);
    use RCD::NNTP::Plugins::LIST qw(GetGroupsList);
    use base qw(RCD::NNTP::Base::Plugin);

    our $VERSION = "0.03"; # $Date: 2009/07/02 12:07:35 $


    sub init
    {
      my $self = shift;

      #
      #   Commands handled by this module
      #

      $self->{COMMANDS} = {
          # command => sub
          'authinfo' => 'cmd_authinfo',
        };

      1;
    }


    #   ========================================================================
    #
    #     RFC 2980
    #     http://www.faqs.org/rfcs/rfc2980.html
    #
    #   ------------------------------------------------------------------------
    #
    #   3.1 AUTHINFO
    #
    #     Input parameters:
    #
    #       USER <username>
    #       PASS <password>
    #
    #       USER or PASS
    #         shows what is presentet in the next argument: username or
    #         password. If it is USER then the server sends responce with the
    #         code of 381. If it is PASS then the server checks given username
    #         and password and sends responce to client.
    #
    #     Responses:
    #
    #       281 Authentication accepted
    #       381 More authentication information required
    #       480 Authentication required
    #       482 Authentication rejected
    #       502 No permission
    #


    sub cmd_authinfo
    {
      my $self = shift;

      #
      #   Test [and get] DB connection
      #

      $self->check_dbi              # check
        || $self->dbi               # try to connect if broken
        || die "DB not connected";  # die with error message if still failed

      my ( $uuid, $cmd, $cond ) = @_;

      $cmd = uc( $cmd );

      if   ( $cmd eq 'USER' )
      {
        #
        #   Save passed username
        #

        $self->client( $uuid )->{username} = $cond;

        $self->{Toolkit}->Logger->debug(
            'Username recieved from client: ' . $cond
          );

        #
        #   And ask for password
        #

        $self->WriteClient(
            $uuid,
            '381 More authentication information required'
          );
      }
      elsif( $cmd eq 'PASS' )
      {
        #
        #   Save passed password
        #

        $self->client( $uuid )->{password} = $cond;

        $self->{Toolkit}->Logger->debug(
            'Password recieved from client'
          );

        #
        #   And check username and password
        #

        if( $self->authuser( $uuid ) )
        {
          #
          #   Save state
          #

          $self->client( $uuid )->{auth_ok} = 1;

          $self->{Toolkit}->Logger->debug(
              'User auth OK'
            );

          #
          #   Inform client
          #

          $self->WriteClient(
              $uuid,
              '281 Authentication accepted'
            );
        }
        else
        {
          $self->{Toolkit}->Logger->debug(
              'User auth FAILED'
            );

          $self->WriteClient(
              $uuid,
              '382 Authentication rejected'
            );

          #$self->checkauth( $uuid );
        }
      }
      else
      {
        $self->WriteClient(
            $uuid,
            '501 Command not supported'
          );
      }

      return;
    }


    sub authuser
    {
      my $self = shift;
      my $uuid = shift;

      return 0
        unless defined( $self->client( $uuid )->{username} ) &&
               defined( $self->client( $uuid )->{password} )    ;

      return 1
        if $self->cachedauth( $uuid );

      return 0
        if $self->antihack( $uuid );

      return 1
        if $self->verifyfrontend( $uuid );

      return 0;
    }


    #
    #   Check for allready cached auth info
    #
    #   Input parameters:
    #     uuid - Connection ID
    #
    #   Returns scalar value:
    #     0    - access denied
    #     1    - access granted (demo/full)
    #

    sub cachedauth
    {
      my $self = shift;
      my $uuid = shift;

      #
      #   check if there is allready marked success auth with given username
      #   and password in the cache
      #

      my $cache = $self->cache( $uuid );
      $cache->{auth} ||= {};

      my $auth    = $cache->{auth};
      my $authkey = $self->authkey( $uuid );
      my $res     = {};
      my $retcode = 0;

      if( $auth->{data} && defined( $auth->{data}->{ $authkey } ) )
      {
        $res = $auth->{data}->{ $authkey };
      }
      else
      {
        #
        #   Try to get data from external cache: database
        #

        my $tableprefix = $self->{Toolkit}->Config->Get( 'backend.TablePrefix' );

        $res = $self->dbi->selectrow_hashref( q{
            SELECT
              *
            FROM
              `} . $tableprefix . q{nntp_auth_cache`
            WHERE
                  `username` = ?
              AND `authkey`  = ?
          },
          undef,
          $self->client( $uuid )->{username},
          $authkey
        );
      }

      if( $res && ref( $res ) eq 'HASH' )
      {
        $self->client( $uuid )->{access}     = $res->{access};
        $self->client( $uuid )->{userid}     = $res->{userid} + 0;
        $self->client( $uuid )->{css}        = $res->{css};
        $self->client( $uuid )->{menu}       = $res->{menu};
        $self->client( $uuid )->{demotext}   = $res->{demotext};
        $self->client( $uuid )->{groupslist} =
          [ split( ',', $res->{groupslist} ) ];

        if( $res->{access} eq 'full' || $res->{access} eq 'demo' )
        {
          #
          #   Set 'auth_ok' flag to correctly work GetGroupsList
          #

          $self->client( $uuid )->{auth_ok} = 1;

          #
          #   Get info about available groups and initilize required hashes:
          #     - groupname => groupid
          #     - groupid   => groupinfo
          #
  
          $self->GetGroupsList( $uuid );

          #
          #   Return 1 (access granted) if auth success
          #

          $retcode = 1;
        }
      }

      $retcode;
    }


    #
    #   Cache auth info
    #
    #   Input parameters:
    #     uuid - Connection ID
    #
    #   Returns scalar value of 1 everytime
    #

    sub cacheauth
    {
      my $self = shift;
      my $uuid = shift;

      #
      #   Data from backend
      #

      my $res = shift;

      #
      #   Marked success auth with given username and password in the cache
      #

      my $cache = $self->cache( $uuid );
      $cache->{auth} ||= {};

      my $auth = $cache->{auth};

      my $authkey = $self->authkey( $uuid );

      if( ! $auth->{inittime} || $auth->{inittime}
          <= ( time() - 60 * $self->cnf()->Get( 'AUTH.cleantime' ) ) )
      {
        $auth = $cache->{auth} = {};
        $auth->{inittime} = time();
      }

      $auth->{data} ||= {};

      $res->{access} = 'none'
        unless $res->{auth} eq 'success';

      #
      #   Internal process cache
      #

      $auth->{data}->{ $authkey } = $res;

      #
      #   External database cache
      #

      my $tableprefix = $self->{Toolkit}->Config->Get( 'backend.TablePrefix' );

      $self->dbi->do( q{
          INSERT INTO
            `} . $tableprefix . q{nntp_auth_cache`
          SET
            `username`   = ?,
            `authkey`    = ?,
            `groupslist` = ?,
            `userid`     = ?,
            `access`     = ?,
            `css`        = ?,
            `menu`       = ?,
            `demotext`   = ?
          ON DUPLICATE KEY UPDATE
            `groupslist` = ?,
            `userid`     = ?,
            `access`     = ?,
            `css`        = ?,
            `menu`       = ?,
            `demotext`   = ?
          },
          undef,
          $self->client( $uuid )->{username},
          $authkey,

          $res->{groupslist}, $res->{userid}, $res->{access}  ,
          $res->{css}       , $res->{menu}  , $res->{demotext},

          $res->{groupslist}, $res->{userid}, $res->{access}  ,
          $res->{css}       , $res->{menu}  , $res->{demotext},
        );

      return 1;
    }


    #
    #   Create key to identify auth record in internal/database cache
    #
    #   Input parameters:
    #     uuid - Connection ID
    #
    #   Returns scalar string value (hex. code)
    #

    sub authkey
    {
      my $self = shift;
      my $uuid = shift;

      my $authkey = md5_hex(            $self->client( $uuid )->{username} );
         $authkey = md5_hex( $authkey . $self->client( $uuid )->{password} );
         $authkey = md5_hex( $authkey . $self->client( $uuid )->{PeerHost} );

      return $authkey;
    }


    #
    #   Check for attempts to brute force login/password
    #
    #   Input parameters:
    #     uuid - Connection ID
    #
    #   Returns scalar:
    #     0    - no brute force discovered
    #     1    - too many password errors, proposing to deny access to client
    #

    sub antihack
    {
      my $self = shift;
      my $uuid = shift;

      #
      #   just allow <AUTH.passtries> number username/password checks from IP
      #   during <AUTH.cleantime> minutes
      #

      my $cache = $self->cache;
      $cache->{antihack} ||= {};

      my $ah = $cache->{antihack};

      if( ! $ah->{inittime} || $ah->{inittime}
          <= ( time() - 60 * $self->cnf()->Get( 'AUTH.cleantime' ) ) )
      {
        $ah = $cache->{antihack} = {};
        $ah->{inittime} = time();
      }

      $ah->{data} ||= {};
      $ah->{data}->{ $self->client( $uuid )->{PeerHost} } += 1;

      return 1
        if $ah->{data}->{ $self->client( $uuid )->{PeerHost} }
           > $self->cnf()->Get( 'AUTH.passtries' );

      return 0;
    }


    #
    #   Check user credentials using backend
    #
    #   Input parameters:
    #     uuid - Connection ID
    #
    #   Returns scalar:
    #     0    - access denied
    #     1    - access granted (demo/full)
    #   
    #   Returns undef value if can not connect to frontend to check
    #   credentials, this means access deny by default.
    #

    sub verifyfrontend
    {
      my $self = shift;
      my $uuid = shift;

      my $res = $self->forum( $uuid )->do( {
        do            => 'checkauth',
        nntp_username => $self->client( $uuid )->{username},
        nntp_password => $self->client( $uuid )->{password},
      } );

      if( !ref( $res ) && length( $res ) > 4 )
      {
        my $data = {};

        #
        #   Parse data
        #

        foreach my $line ( split( /[\015\012]/, $res ) )
        {
          my ( $key, $value ) = $line =~ /^(\w+): *(.*)$/i;

          $data->{ lc( $key ) } = $value;
        }

        if( $data->{auth} eq 'success' )
        {
          $data->{css}      = decode_base64( $data->{css}      );
          $data->{menu}     = decode_base64( $data->{menu}     );
          $data->{demotext} = decode_base64( $data->{demotext} );
        }
        else
        {
          $data->{access}   = 'none';
          $data->{css}      = '';
          $data->{menu}     = '';
          $data->{demotext} = '';
        }

        #
        #   Cache auth anyway, even if it failed
        #

        $self->cacheauth( $uuid, $data );

        #
        #   Auth failed, just return
        #

        return 0
          unless $data->{auth} eq 'success';

        #
        #   There are also "access" and "userid" elements in $data
        #   Nothing to do with them
        #

        $self->cachedauth( $uuid );

        return 1;
      }
      else
      {
        #
        #   server error, inform client
        #

        $self->WriteClient(
            $uuid,
            '503 program fault - backend connection problem'
          );
      }

      return undef;
    }


# end of the RCD::NNTP::Plugins::AUTHINFO package

1;
