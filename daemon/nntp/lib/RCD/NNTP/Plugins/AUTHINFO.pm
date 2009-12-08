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
    use base qw(RCD::NNTP::Base::Plugin);

    our $VERSION = "0.06"; # $Date: 2009/11/17 17:03:49 $


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

        my $auth_user_status = $self->authuser( $uuid );

        if( 1 == $auth_user_status )
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
        elsif( 0 == $auth_user_status )
        {
          $self->{Toolkit}->Logger->debug(
              'User auth FAILED'
            );

          $self->WriteClient(
              $uuid,
              '382 Authentication rejected'
            );

          #$self->check_conditions( $uuid );
        }
        else
        {
          $self->{Toolkit}->Logger->debug(
              'User auth program fault: no data from backend'
            );
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

      #return 0
      #  if $self->antihack( $uuid );

      return $self->verifyfrontend( $uuid );
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

      my $userinfo = $self->forum( $uuid )->do( {
        do       => 'checkauth',
        username => $self->client( $uuid )->{username},
        password => $self->client( $uuid )->{password},
      } );

      if( ref( $userinfo ) eq 'HASH' )
      {
        if( $userinfo->{access_granted} eq 'yes' )
        {
          #
          #   Set 'auth_ok' flag to correctly work GetGroupsList
          #

          $self->client( $uuid )->{auth_ok} = 1;

          #
          #   Initialize NNTP-groups lists (by ID, by Name)
          #

          $self->client( $uuid )->{groups}   = {};
          $self->client( $uuid )->{groupids} = {};

          foreach my $group ( @{ $userinfo->{nntpgroupslist} } )
          {
            if( $group->{id} && length( $group->{group_name} ) )
            {
              $self->client( $uuid )->{groups}->{ $group->{group_name} }
                = $group->{id};

              $self->client( $uuid )->{groupids}->{ $group->{id} }
                = { name => $group->{group_name} };
            }
          }

          $userinfo->{groupslist} =
            [ keys( %{ $self->client( $uuid )->{groupids} } ) ];

          #
          #   Set important client's parameters
          #

          $self->client( $uuid )->{access}     = $userinfo->{access}     || 'none';
          $self->client( $uuid )->{userid}     = $userinfo->{userid}     || 0;
          $self->client( $uuid )->{css}        = $userinfo->{css}        || '';
          $self->client( $uuid )->{menu}       = $userinfo->{menu}       || '';
          $self->client( $uuid )->{demotext}   = $userinfo->{demotext}   || '';
          $self->client( $uuid )->{tmpl}       = $userinfo->{tmpl}       || '';
          $self->client( $uuid )->{groupslist} = $userinfo->{groupslist} || [];

          $self->client( $uuid )->{usergroupslist} =
            [ split( ',', $userinfo->{usergroupslist} ) ];

          return 1;
        }
        else
        {
          #
          #   Auth failed, return 0
          #

          $self->client( $uuid )->{auth_ok} = 0;

          return 0;
        }
      }
      else
      {
        #
        #   Server error, inform client
        #

        $self->WriteClient(
            $uuid,
            '503 program fault - backend connection problem'
          );
      }

      return -1;
    }


# end of the RCD::NNTP::Plugins::AUTHINFO package

1;
