#
#   Copyright © 2009, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Helpers::Start;

    #
    #   Start process helper
    #

    use strict;
    use Wildev::AppServer::Toolkit;
    use RCD::NNTP::Base::Plugin qw(cache check_dbi dbi cnf);

    our $VERSION = "0.01"; # $Date: 2009/12/16 14:10:53 $


    sub new
    {
      my $class = shift;
      my $ref   = ref( $_[0] ) ? $_[0] : { @_ };
      my $self  = bless $ref => $class;

      $self->init();

      $self;
    }


    sub init
    {
      my $self  = shift;
      my $class = ref( $self ) || $self;
      $self     = $class->new( @_ ) unless ref( $self );

      $self->{Toolkit} = Wildev::AppServer::Toolkit->instance();

      #
      #   Check for alive DB connection and try to connect if required
      #

      $self->check_dbi || $self->dbi;

      1;
    }


    sub run
    {
      my $self  = shift;
      my $class = ref( $self ) || $self;
      $self     = $class->new( @_ ) unless ref( $self );

      $self->{Toolkit}->Logger->debug( 'Start process helper started.' );

      my $tableprefix = $self->{Toolkit}->Config->Get( 'backend.TablePrefix' );

      #
      #   Clean auth cache
      #

      $self->{Toolkit}->Logger->debug( 'Cleaning auth cache.' );

      $self->dbi->do( q{
          TRUNCATE `} . $tableprefix . q{nntp_userauth_cache`
        } );

      #
      #   Clean group access cache
      #

      $self->{Toolkit}->Logger->debug( 'Cleaning group access cache.' );

      $self->dbi->do( q{
          TRUNCATE `} . $tableprefix . q{nntp_groupaccess_cache`
        } );

      $self->{Toolkit}->Logger->debug( 'Start process helper finished.' );

      1;
    }


# end of the RCD::NNTP::Helpers::Start package

1;
