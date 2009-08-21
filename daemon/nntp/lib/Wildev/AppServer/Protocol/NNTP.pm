#
#   Copyright © 2008, Dmitry Titov (dmitry@digin.ru, http://wildev.ru)
# ==============================================================================
#

  package Wildev::AppServer::Protocol::NNTP;

    #
    #   NNTP server core
    #

    use strict;
    use RCD::NNTP::Base::Plugin qw(WriteClient);
    use Time::HiRes qw(gettimeofday tv_interval);
    use Wildev::AppServer::Toolkit;

    our $VERSION = "0.01"; # $Date: 2008/10/17 15:19:46 $


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

      $self->{Toolkit}  = Wildev::AppServer::Toolkit->instance();

      $self->{Commands} = {
          quit => 'cmd_quit',
        };

      my $cnf = $self->{Toolkit}->Config;

      #
      #   load plugins
      #

      $self->{Toolkit}->Logger->debug( 'Loading plugins started.' );

      foreach my $plugin ( @{ $cnf->Get( 'nntp.Plugins' ) } )
      {
        my $package = $cnf->Get( 'nntp.PluginBaseName' ) . '::' . uc( $plugin );

        eval "use $package;";

        unless( $@ )
        {
          foreach( @{ $package->import_commands() } )
          {
            $self->{Commands}->{ lc $_->[0] } = $_->[1];
          }

          $self->{Toolkit}->Logger->debug( 'Succeed: ' . $package             );
        }
        else
        {
          $self->{Toolkit}->Logger->debug( 'Failed: '  . $package . ', ' . $@ );
        }
      }

      $self->{Toolkit}->Logger->debug( 'Loading plugins finished.' );

      1;
    }


    sub Accept ($)
    {
      my $self = shift;
      my $uuid = shift;

      if( $self->{Toolkit}->Config->Get( 'nntp.PostingAllowed' ) )
      {
        $self->WriteClient( $uuid, '200 server ready - posting allowed'    );
      }
      else
      {
        $self->WriteClient( $uuid, '201 server ready - no posting allowed' );
      }

      1;
    }


    sub Handle ($)
    {
      my $self = shift;
      my $uuid = shift;

      my $client = $self->{Toolkit}->Clients->{$uuid};

      $client->{Input} =~ s{^(([^\r\n]*)\r?\n)}{};

      my $in = $2;

      if( length $in )
      {
        my @args = split( ' ', $in );
        my $cmd  = shift @args;

        #
        #   Hide password from logs
        #

        $in =~ s{PASS .+$}{PASS ****}i;

        $self->{Toolkit}->Logger->debug( 'Cmd [' . $uuid . ']: ' . $in );

        my $cmdstarttime = [ gettimeofday() ];

        $self->{Toolkit}->Logger->debug(
            '[' . $uuid . '] Start timer initialized.'
          );

        if( $cmd )
        {
          my $sub = $self->{Commands}->{ lc $cmd };

          if   ( $sub && ! ref( $sub ) && $self->can( $sub ) )
          {
            $self->{Toolkit}->Logger->debug(
                '[' . $uuid . '] Method handle #1 (object method)'
              );

            eval { $self->$sub( $uuid, @args ); };

            if( $@ )
            {
              $self->WriteClient( $uuid, "503 command '$cmd' not performed" );

              $self->{Toolkit}->Logger->debug(
                  "[$uuid] Command '$cmd " . join( ' ', @args )
                  . "' not performed: " . $@
                );
            }
          }
          elsif( $sub && ref( $sub ) eq 'CODE' )
          {
            $self->{Toolkit}->Logger->debug(
                '[' . $uuid . '] Method handle #2 (procedural method)'
              );

            eval ' &$sub( $uuid, @args ); ';

            if( $@ )
            {
              $self->WriteClient( $uuid, "503 command '$cmd' not performed"  );

              $self->{Toolkit}->Logger->debug(
                  "[$uuid] Command '$cmd " . join( ' ', @args )
                  . "' not performed: " . $@
                );
            }
          }
          else
          {
            $self->WriteClient( $uuid, "500 command '$cmd' not recognized" );

            $self->{Toolkit}->Logger->debug(
                "Command '$cmd " . join( ' ', @args ) . "' not recognized"
              );
          }
        }
        else
        {
          $self->WriteClient( $uuid, "500 no command recognized" );

          $self->{Toolkit}->Logger->debug(
              '[' . $uuid . '] no command recognized'
            );
        }

        $self->{Toolkit}->Logger->debug(
            '[' . $uuid . '] Command processing finished.'
          );

        my $elapsedtime = tv_interval( $cmdstarttime );

        $self->{Toolkit}->Logger->debug(
            '[' . $uuid . '] Command processing time interval captured.'
          );

        $self->{Toolkit}->Logger->info(
            '[' . $uuid . '] Command processing totally took, seconds: '
            . $elapsedtime
          );
      }

      0;
    }


    sub cmd_quit ($)
    {
      my $self = shift;
      my $uuid = shift;

      my $client = $self->{Toolkit}->Clients->{$uuid};

      $self->WriteClient( $uuid, '205 closing connection - goodbye!' );

      $client->{Attrs}->{CloseRequest} = 1;

      1;
    }


# end of the Wildev::AppServer::Protocol::NNTP package

1;
