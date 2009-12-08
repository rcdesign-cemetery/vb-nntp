#
#   Copyright © 2008, Dmitry Titov (dmitry@digin.ru, http://wildev.ru)
# ==============================================================================
#

  package Wildev::AppServer::Toolkit;

    #
    #   Toolkit Singleton
    #

    use strict;
    use Digin::Tools::Factory;
    use base qw(Digin::Base::Toolkit);

    our $VERSION = "0.02"; # $Date: 2009/11/24 17:10:40 $


    __PACKAGE__->mk_accessors( qw(
        Config Factory Shared State UUID Clients Logger
      ) );


    sub GET_Factory
    {
      my $self = shift;

      Digin::Tools::Factory->new();
    }


    sub GET_UUID
    {
      my $self = shift;

      my $uuid = $self->Factory->Create(
        'Data::UUID'
      );

      $uuid;
    }


    sub SET_Config
    {
      my $self   = shift;
      my $Config = undef;

      if( @_ )
      {
        $Config = $self->Factory->Create(
          'RCD::NNTP::Tools::Config',
          $_[0]
        ) if -r $_[0];
      }

      $Config;
    }


    sub GET_Logger
    {
      my $self = shift;
      my $cnf  = $self->Config;

      my $logger = $self->Factory->Create(
        'Log::Handler'
      );

      $logger->add(
          file => {
              'filename'        => $cnf->Get( 'log.FileName'   ),
              'autoflush'       => $cnf->Get( 'log.AutoFlush'  ),
              'mode'            => $cnf->Get( 'log.Mode'       ),
              'newline'         => $cnf->Get( 'log.NewLine'    ),
              'minlevel'        => $cnf->Get( 'log.MinLevel'   ),
              'maxlevel'        => $cnf->Get( 'log.MaxLevel'   ),
              'debug_trace'     => $cnf->Get( 'log.DebugTrace' ),
              'debug_mode'      => $cnf->Get( 'log.DebugMode'  ),
              'alias'           => 'file-out',
              'message_layout'  => '%T [%P] [%L] %m',
            },
        );

      $logger;
    }


    sub GET_Shared
    {
      my $self = shift;

      {};
    }


    sub GET_State
    {
      my $self = shift;

      {};
    }


    sub GET_Clients
    {
      my $self = shift;

      {};
    }


# end of the Wildev::AppServer::Toolkit package

1;
