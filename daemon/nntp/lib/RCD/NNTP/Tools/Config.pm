#
#   Copyright © 2009, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Tools::Config;

    #
    #   Configuration manager
    #

    use strict;
    use Wildev::AppServer::Toolkit;
    use RCD::NNTP::Base::ConfigDefaults;
    use RCD::NNTP::Base::Plugin qw(cache dbi);
    use base qw(Digin::Tools::ParseConfig);

    our $VERSION = "0.01"; # $Date: 2009/11/24 17:01:15 $


    sub new
    {
      my $class = shift;

      my $ConfigFile = shift || die( 'No configuration file found' );

      my $self = bless {
        'ConfigFile' => $ConfigFile,
        @_,
      } => $class;

      $self->{Defaults} = RCD::NNTP::Base::ConfigDefaults->new();
      $self->{Toolkit}  = Wildev::AppServer::Toolkit->instance();

      $self->{LastUpdate} = 0;

      $self->Reload( 1 );

      $self;
    }


    sub cnf { return $_[0]; }


    #
    #   Reload settings
    #
    #   Input parameters:
    #     reload mode (scalar, int):
    #       0 - load all settings with expire time checking
    #       1 - do not load settings from DB
    #       2 - force reload all settings including data from DB
    #

    sub Reload ($)
    {
      my $self = shift;

      #
      #   Data from DB could not be loaded on initialization because
      #   driver parameters are unknown yet
      #

      my $mode = shift || 0;

      #
      #   Check expire time
      #

      if( $mode != 2 && $self->{LastUpdate} > ( time() - 60 ) )
      {
        return 0;
      }

      $self->{LastUpdate} = time();


      my $configfile = $self->{ConfigFile};

      #
      #   1st. Load defaults
      #

      $self->{ConfigFile} = $self->{Defaults}->{Defaults};

      $self->_ParseConfig();

      #
      #   2nd. Load data from file
      #

      $self->{ConfigFile} = $configfile;

      $self->_ParseConfig();

      #
      #   3rd. Load data from DB
      #

      $self->_LoadFromDB() unless $mode == 1;

      1;
    }


    #
    #   Alias for Reload( 2 );
    #

    sub ForceReload { $_[0]->Reload( 2 ); }


    sub _LoadFromDB
    {
      my $self = shift;

      $self->{Toolkit}->Logger->debug( 'Loading settings from DB started' );

      my $tableprefix = $self->Get( 'backend.TablePrefix' );

      my $sth = $self->dbi->prepare( q{
          SELECT
            `varname`,
            `value`
          FROM
            `} . $tableprefix . q{setting`
          WHERE
            `varname` IN('} . join( "','", keys %{ $self->{Defaults}->{DBMap} } ) . q{')
        } );

      $sth->execute();

      while( my $p = $sth->fetchrow_hashref() )
      {
        $self->Set(
            $self->{Defaults}->{DBMap}->{ $p->{varname} }, $p->{value}
          );
      }

      $sth->finish();

      $self->_SpecialCases();

      1;
    }


    sub _SpecialCases
    {
      my $self = shift;

      #
      #   Build URL of backend
      #

      $self->Set(
          'backend.URL',
          $self->Get( 'backend.BBURL' ) . '/' . $self->Get( 'backend.URI' )
        );

      #
      #   Add address to listen
      #

      my $curlisten = $self->Get( 'appserver.Listen' );

      my $addlisten =
          $self->Get( 'appserver.LocalAddr' )
        . ':'
        . $self->Get( 'appserver.LocalPort' );

      if( $addlisten ne ':' )
      {
        $self->Set( 'appserver.Listen', [ $addlisten ] );
      }

      1;
    }


# end of the RCD::NNTP::Tools::Config package

1;
