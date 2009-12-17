#
#   Copyright © 2008, Dmitry Titov (dmitry@digin.ru, http://wildev.ru)
# ==============================================================================
#

  package Wildev::AppServer::Core;

    #
    #   Simple applications server
    #   The Digin::SWEB::Server (0.14) fork
    #

    use strict;
    use IO::Select;
    use IO::Socket;
    use POSIX;
    use Fcntl;
    #use Fcntl qw(:DEFAULT :flock);
    #use POSIX qw(:signal_h :sys_wait_h :errno_h);
    use Wildev::AppServer::Toolkit;

    our $VERSION = "0.16"; # $Date: 2009/05/29 16:59:41 $


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

      my $cnf   = $self->{Toolkit}->Config();
      my $state = $self->{Toolkit}->State();


      die( 'Nothing to listen on, exit.' )
        unless $cnf->Get( 'appserver.Listen' );

      #
      #   Check for data handler
      #

      die( 'No data handler, exit.' )
        unless $cnf->Get( 'handler.Controller' );

      #$self->{Toolkit}->Logger->notice(
      #    'Loading data handler: ' . $cnf->Get( 'handler.Controller' )
      #  );

      #$self->{Handler} = $self->{Toolkit}->Factory->Create(
      #  $cnf->Get( 'handler.Controller' )
      #);

      #
      #   Set some server's [default] parameters
      #

      $self->{Server} = {
        Listen        => $cnf->Get( 'appserver.Listen'        )       ,
        SockTimeOut   => $cnf->Get( 'appserver.SockTimeOut'   ) || 30 ,
        IdleCheckTime => $cnf->Get( 'appserver.IdleCheckTime' ) ||  5 ,
        PreforkKids   => $cnf->Get( 'appserver.PreforkKids'   ) ||  5 ,
        MaxKids       => $cnf->Get( 'appserver.MaxKids'       ) ||  5 ,
        MaxSpareKids  => $cnf->Get( 'appserver.MaxSpareKids'  ) ||  1 ,
        MinSpareKids  => $cnf->Get( 'appserver.MinSpareKids'  ) ||  1 ,
        ClientTimeOut => $cnf->Get( 'appserver.ClientTimeOut' ) ||  5 ,
        PrcCheckTime  => $cnf->Get( 'appserver.PrcCheckTime'  ) || 30 ,
        ChrootDir     => $cnf->Get( 'appserver.ChrootDir'     ) || '/',
        ProcTitle     => $cnf->Get( 'appserver.ProcTitle'     ) || 'AppServer',
        MaxReqLen     => $cnf->Get( 'appserver.MaxReqLen'     ) ||  1 , # MB
      };

      $self->{Pid}     = $cnf->Get( 'appserver.Pid'     ) || './appserver.pid';
      $self->{KidsPid} = $cnf->Get( 'appserver.KidsPid' ) || '.';

      #
      #   Set important internally used variables
      #

      $state->{Working} = 1;
      $state->{Self}    = $self;

      #
      #   MaxReqLen is in MegaBytes
      #

      $self->{Server}->{MaxReqLen} *= 1024 * 1024;

      1;
    }


    sub run
    {
      my $self  = shift;
      my $class = ref( $self ) || $self;
      $self     = $class->new( @_ ) unless ref( $self );

      for( $ARGV[0] )
      {
        /^start$/
          ? do {
              print "Server successfully started.\012"
                if $self->Start();
          } :

        /^stop$/
          ? do {
              print "Server successfully stopped.\012"
                if $self->Stop();
          } :

        /^restart$/
          ? do {
              print "Server successfully restarted.\012"
                if $self->Stop() && $self->Start();
          } :

            do {
              print join "\012",
                'usage: $0 (start|stop|restart|help)',
                '',
                'start   - start server',
                'stop    - stop server',
                'restart - restart server',
                'help    - this screen',
                '';
          };
      };

      1;
    }


    #
    # --------------------------------------------------------------------------
    #   Subroutines
    #


    sub Start
    {
      my $self = shift;

      if( $self->IsRunning() )
      {
        print "Server is always running.\012";

        return 0;
      }

      my $state  = $self->{Toolkit}->State();

      my $kidpid = fork();

      if( !defined( $kidpid ) )
      {
        print "Fork failed: $!";

        return 0;
      }
      elsif( $kidpid )
      {
        if( open( PID, ">$self->{Pid}" ) )
        {
          print PID $kidpid;
          close( PID );
        }

        return $kidpid;
      }
      else
      {
        #
        #   Child process
        #

        POSIX::setsid() unless ( $^O eq "MSWin32" );

        $SIG{HUP}  = 'IGNORE';
        $SIG{INT}  = $SIG{TERM} = \&Kill;
        $SIG{CHLD} = \&ReapChld;

        #
        #   Change working directory
        #

        chdir $self->{Server}->{ChrootDir};

        #
        #   Clear file creation mask
        #

        umask 0;

        #
        #   Close open file descriptors
        #

        #foreach my $i ( 0 .. OpenMax() ) { POSIX::close( $i ) }

        #
        #   Reopen stderr, stdout, stdin to /dev/null
        #

        open( STDIN,  "+>/dev/null" );
        open( STDOUT, "+>&STDIN"    );
        open( STDERR, "+>&STDIN"    );

        $| = 1;

        #my $ID = 'Monitor, '.$$;

        #
        #   Set proc title
        #

        $0 = $self->{Server}->{ProcTitle} . ' monitor';

        $self->{Toolkit}->Logger->notice( 'Started' );

        $state->{Children}  = {};
        $state->{Available} = $self->{Server}->{PreforkKids};

        $self->{Toolkit}->Logger->notice( 'Making socket' );

        $state->{Server} = IO::Select->new()
          || die "Unable to create IO::Select object";

        foreach my $listen ( @{ $self->{Server}->{Listen} } )
        {
          my $socket;
          my $proto;

          if   ( $listen =~ /^((tcp|udp):)?([^:]+:.+)$/ )
          {
            ( $proto, $listen ) = ( $2 || 'tcp', $3 );

            $socket =
              $proto eq 'tcp'
                ? ( IO::Socket::INET->new(
                      LocalAddr => $listen,
                      Proto     => $proto,
                      Type      => SOCK_STREAM,
                      ReuseAddr => 1,
                      Blocking  => 0,
                      Listen    => SOMAXCONN,
                      Timeout   => $self->{Server}->{SockTimeOut},
                    ) || $self->{Toolkit}->Logger->error( "Error creating socket: $!" ) )
                : ( IO::Socket::INET->new(
                      LocalAddr => $listen,
                      Proto     => $proto,
                      Type      => SOCK_DGRAM,
                      ReuseAddr => 1,
                      Blocking  => 0,
                      Timeout   => $self->{Server}->{SockTimeOut},
                    ) || $self->{Toolkit}->Logger->error( "Error creating socket: $!" ) );
          }
          else
          {
            unlink $listen;

            $proto = 'unix';

            $socket = IO::Socket::UNIX->new(
              Type      => SOCK_STREAM,
              Local     => $listen,
              Listen    => SOMAXCONN,
            ) || $self->{Toolkit}->Logger->error( "Error creating socket: $!" );
          }

          die "Unable to create listening socket for $listen $!"
            unless $socket;

          $socket->blocking( 0 );

          ${*$socket}->{SocketStateFlag} = 1;
          ${*$socket}->{Proto}           = $proto;

          $state->{Server}->add( $socket );

          undef $proto;
        }

        #
        #   Run start helper
        #

        if( $self->{Toolkit}->Config->Get( 'helpers.Start' ) )
        {
          $self->{Toolkit}->Logger->notice( 'Runing start helper' );

          $self->{Toolkit}->Factory->Create(
            $self->{Toolkit}->Config->Get( 'helpers.Start' ),
            '-sub' => 'run'
          );
        }

        #
        #   Prefork kids
        #

        $self->{Toolkit}->Logger->notice( 'Preforking kids' );

        #
        #   Run spare kids checker
        #

        my $KidChecker = $self->CheckSpareKids();

        $self->{Toolkit}->Logger->notice( "Preforking complete" );

        WORK:
        while( $state->{Working} )
        {
          #
          #   Wait for a signal
          #

          sleep;

          last WORK
            unless $state->{Working};

          #
          #   Check for kid checker alive
          #

          $KidChecker = $self->CheckSpareKids()
            unless kill 0 => $KidChecker;
        }

        #
        #   Run stop helper
        #

        if( $self->{Toolkit}->Config->Get( 'helpers.Stop' ) )
        {
          $self->{Toolkit}->Logger->notice( 'Runing stop helper' );

          $self->{Toolkit}->Factory->Create(
            $self->{Toolkit}->Config->Get( 'helpers.Stop' ),
            '-sub' => 'run'
          );
        }

        #$state->{Server}->shutdown( 2 );

        $self->{Toolkit}->Logger->notice( "Server shutting down" );
      }
    }


    sub MakeNewKid
    {
      my $self = shift;

      my $state = $self->{Toolkit}->State();

      #
      #   Do fork()
      #

      my $kidpid = fork();

      if   ( !defined( $kidpid ) )
      {
        $self->{Toolkit}->Logger->error( "Fork failed" );

        return 1;
      }
      elsif( $kidpid )
      {
        #
        #   Parent process
        #

        $self->{Toolkit}->Logger->notice( "New child process PID=$kidpid" );

        $state->{Children}->{$kidpid} = 1;
        $state->{Available}--;

        return 1;
      }
      else
      {
        #
        #   Child process
        #

        POSIX::setsid()
          unless ( $^O eq "MSWin32" );

        $SIG{HUP} = $SIG{PIPE} = 'IGNORE';

        $SIG{INT} = $SIG{TERM} = sub
        {
          #$state->{Server}->shutdown( 2 );

          $self->{Toolkit}->Logger->notice( "Processor interrupted, exiting" );

          $self->{Toolkit}->Logger->flush();

          $state->{Working} = 0;

          #exit 0;
        };

        $SIG{__DIE__} = sub
        {
          #$state->{Server}->shutdown( 2 );

          $self->{Toolkit}->Logger->error(
              "Critical Error: $0: " . join( "; ", @_ )
            );

          $self->{Toolkit}->Logger->flush();

          $state->{Working} = 0;

          #exit 0;
        };

        #
        #   Set proc title
        #

        $0 = $self->{Server}->{ProcTitle} . ' requests processor';

        $self->{Toolkit}->Logger->notice( "Requests processor started" );

        #
        #   Create pid-file for current process
        #

        if( open( FH, '>'.$self->{KidsPid} . '/kid.' . $$ ) )
        {
          print FH $$;
          close( FH );
        }

        $state->{Kids}->{$$} = 0;

        my $Clients = $self->{Toolkit}->Clients;


        #
        #   Create data handler
        #

        $self->{Toolkit}->Logger->notice(
            'Loading data handler: '
            . $self->{Toolkit}->Config->Get( 'handler.Controller' )
          );

        $self->{Handler} = $self->{Toolkit}->Factory->Create(
          $self->{Toolkit}->Config->Get( 'handler.Controller' )
        );

        REQUEST:
        while( $state->{Working} )
        {
          #
          #   Ready to read sockets
          #

          foreach my $socket ( $state->{Server}->can_read( 0.1 ) )
          {
            if   ( ${*$socket}->{SocketStateFlag} == 1 )
            {
              $self->AcceptHandler( $socket );
            }
            elsif( ${*$socket}->{SocketStateFlag} == 2 )
            {
              $self->DataHandler( $socket );
            }
          }


          #
          #   Any complete requests to process?
          #

          foreach my $uuid ( keys %{ $Clients } )
          {
            $self->{Handler}->Handle( $uuid )
              if length $Clients->{$uuid}->{Input};
          }


          #
          #   Buffers to flush?
          #

          foreach my $socket ( $state->{Server}->can_write( 0 ) )
          {
            $self->BufferHandler( $socket );
          }


          #
          #   Requested to close sockets
          #

          foreach my $uuid ( keys %{ $Clients } )
          {
            next
              unless $Clients->{$uuid}->{Attrs}->{CloseRequest};

            $self->CloseSocket( $Clients->{$uuid}->{Socket} );
          }


          #
          #   Out of band data?
          #

          foreach my $socket ( $state->{Server}->has_exception( 0 ) )
          {
            #
            #   Deal with out-of-band data here, if you want to.
            #

            $self->CloseSocket( $socket );
          }
        }

        delete( $state->{Kids}->{$$} );
        unlink $self->{KidsPid} . '/' . $$;

        #
        #   Exit from child process!
        #

        $self->{Toolkit}->Logger->notice( "Processor exiting" );

        exit 0;
      }
    }


    sub BufferHandler ($)
    {
      my $self   = shift;
      my $socket = shift;
      my $flush  = shift || 0;

      my $uuid   = ${*$socket}->{UUID};
      my $client = $self->{Toolkit}->Clients->{$uuid};

      #
      #   Skip this client if we have nothing to say
      #

      return 0
        unless length $client->{Output};

      local $SIG{PIPE} = sub
      {
        $self->{Toolkit}->Logger->error(
            'Unexpected client [' . $uuid . '] error: ' . @_
          );

        $self->CloseSocket( $socket );

        undef $client;
      };

      while( $client && length( $client->{Output} ) )
      {
        #my $buffer = substr( $client->{Output}, 0, 512 );

        my $rv = undef;

        eval { $rv = $socket->send( $client->{Output}, 0, $socket ); };

        if( $@ )
        {
          $self->{Toolkit}->Logger->error(
              'Sending data to user [' . $uuid . '] failed: ' . @_
            );
        }

        unless( defined $rv )
        {
          #
          #   Whine, but move on.
          #

          $self->{Toolkit}->Logger->debug(
              'Sending data to user [' . $uuid . '] failed!'
            );

          return 0;
        }
        else
        {
          $self->{Toolkit}->Logger->debug(
              $rv . ' bytes of ' . ( length $client->{Output} ) . ' sent'
            );
        }

        #if( $rv == length( $client->{Output} ) || $! == POSIX::EWOULDBLOCK )
        #{
        #  substr( $client->{Output}, 0, $rv ) = '';
        #}
        #else
        #{
        #  #
        #  #   Couldn't write all the data, and it wasn't because
        #  #   it would have blocked.  Shutdown and move on.
        #  #

        #  #$self->CloseSocket( $socket );
        #}

        $self->{Toolkit}->Logger->debug(
            'Data sent to user [' . $uuid . ']:' . "\015\012"
            . substr( $client->{Output}, 0, $rv )
          );

        substr( $client->{Output}, 0, $rv ) = '';

        $self->{Toolkit}->Logger->debug( 'Flushing buffer!' )
          if $flush;

        $socket->flush
          if $flush;
      }

      0;
    }


    sub CloseSocket ($)
    {
      my $self   = shift;
      my $socket = shift;

      #
      #   Delete client data
      #

      my $uuid = ${*$socket}->{UUID};

      delete( $self->{Toolkit}->Clients->{$uuid} );

      unless( ${*$socket}->{Proto} eq 'udp' )
      {
        $self->{Toolkit}->State->{Server}->remove( $socket );

        $socket->close;

        undef %{*$socket};
      }

      $self->{Toolkit}->Logger->debug( 'Client [' . $uuid . '] went away.' );

      1;
    }


    sub SendOutput ($)
    {
      my $self   = shift;
      my $socket = shift;

      my $uuid   = ${*$socket}->{UUID};
      my $client = $self->{Toolkit}->Clients->{$uuid};

      #
      #   Send data to user
      #

      if( length $client->{Output} )
      {
        $socket->send( $client->{Output}, 0, $socket );

        #
        #   Reset output data
        #

        $client->{Output} = '';
      }

      $socket->send( join( '', @_ ), 0, $socket )
        if scalar @_;

      $socket->flush;

      1;
    }


    sub AcceptHandler ($)
    {
      my $self   = shift;
      my $socket = shift;

      my $client =
        ${*$socket}->{Proto} eq 'udp'
          ? $socket
          : $socket->accept;

      if( $client )
      {
        $client->blocking( 0 );

        ${*$client}->{SocketStateFlag} = 2;

        $self->{Toolkit}->State()->{Server}->add( $client );

        #
        #   Create client UUID
        #

        ${*$client}->{UUID} = $self->{Toolkit}->UUID->create_str();

        my $uuid = ${*$client}->{UUID};

        #
        #   Get peer IP address and port / path
        #

        my $PeerHost = $client->can( 'peerhost' ) ? $client->peerhost() : undef;
        my $PeerPort = $client->can( 'peerport' ) ? $client->peerport() : undef;
        my $PeerPath = $client->can( 'peerpath' ) ? $client->peerpath() : undef;

        #
        #   Log it
        #

        $self->{Toolkit}->Logger->debug(
            'New client accepted: '
            . $PeerHost . ':' . $PeerPort . ' / ' . $PeerPath
          );

        #
        #   Initialize client's data
        #

        $self->{Toolkit}->Clients->{$uuid} = {
          Socket      => $client  ,
          PeerHost    => $PeerHost,
          PeerPort    => $PeerPort,
          PeerPath    => $PeerPath,
          Input       => undef,
          Output      => undef,
          Attrs       => {},
          SendOutput  => sub{ $self->SendOutput( $client, @_ ) },
          FlushOutput => sub{ $self->BufferHandler( $client, 1 ) },
        };

        #
        #   Welcome handler?
        #

        $self->{Handler}->Accept( $uuid );
        #$self->{Toolkit}->Clients->{$uuid}->{SendOutput}();
      }

      1;
    }


    sub DataHandler ($)
    {
      my $self   = shift;
      my $socket = shift;

      my $uuid   = ${*$socket}->{UUID};
      my $client = $self->{Toolkit}->Clients->{$uuid};

      #
      #   Read data
      #

      my $in = '';
      my $rv = $socket->recv( $in, POSIX::BUFSIZ, 0 );

      unless( defined( $rv ) && length( $in ) )
      {
        #
        #   This would be the end of file, so close the client
        #

        $self->CloseSocket( $socket );

        return 0;
      }

      $client->{Input} .= $in;

      0;
    }


    #
    #   OpenMax(): Return the maximum number of possible file descriptors.
    #   If sysconf() does not give us value, we punt with our own value.
    #

    sub OpenMax {
      my $openmax = POSIX::sysconf( &POSIX::_SC_OPEN_MAX );
      ( !defined( $openmax ) || $openmax < 0 ) ? 64 : $openmax;
    }


    #
    #   NonBlock($socket) puts socket into nonblocking mode
    #

    sub NonBlock
    {
      my $socket = shift;
      my $flags;

      $flags = fcntl( $socket, F_GETFL, 0 )
        or die "Can't get flags for socket: $!\n";

      fcntl( $socket, F_SETFL, $flags | O_NONBLOCK )
        or die "Can't make socket nonblocking: $!\n";
    }


    #
    #   Reap child processes
    #

    sub ReapChld
    {
      my $toolkit = Wildev::AppServer::Toolkit->instance();

      my $state = $toolkit->State();
      my $self  = $state->{Self};

      while( my $kidpid = waitpid( -1, WNOHANG ) )
      {
        last
          if $kidpid == -1;

        if ( WIFEXITED( $? ) )
        {
          delete( $state->{Children}->{$kidpid} );
          $state->{Available}++;
        }
      }

      $SIG{CHLD} = \&ReapChld;
    }


    ##
    ##   Log events
    ##

    #sub LOG ($)
    #{
    #  my $toolkit = Wildev::AppServer::Toolkit->instance();

    #  my $state = $toolkit->State();
    #  my $self  = $state->{Self};

    #  return 1
    #    unless $self->{Debug};

    #  return 1
    #    unless $self->{Log};

    #  my $text = shift;
    #  my $time = localtime;
    #  my $from = qq{$0.$$};

    #  # log event
    #  if( open( LOG, '>>' . $self->{Log} ) )
    #  {
    #    print LOG qq{[$time] [$from] $text\012};

    #    close( LOG );
    #  }

    #  1;
    #}


    sub Stop
    {
      my $self = shift;

      unless( $self->IsRunning() )
      {
        print "Server is not running.\012";

        return 0;
      }

      # try to kill main process
      open( PID, $self->{Pid} )
        or die "Can't open pid file.";

      chomp( my $pid = <PID> );
      close PID;
      kill INT => $pid;

      undef $@;

      eval
      {
        local $SIG{ALRM} = sub { die "waitpid($pid) timeout\012" };

        alarm 2;
        waitpid( $pid, 0 );
        alarm 0;
      };

      if ( $@ )
      {
        kill KILL => $pid;
        waitpid $pid, 0;
      }

      unlink $self->{Pid}
        if -e $self->{Pid};

      return 1;
    }


    #
    #   Is server running?
    #

    sub IsRunning
    {
      my $self = shift;

      return 0
        unless -f $self->{Pid};

      open( PID, "$self->{Pid}" )
        or die "Can't open pid file.";

      chomp( my $prev_pid = <PID> );

      close PID;

      ( kill 0 => $prev_pid )
        ? 1
        : 0;
    }


    #
    #   Stop the running server
    #

    sub Kill
    {
      my $toolkit = Wildev::AppServer::Toolkit->instance();

      my $state = $toolkit->State();
      my $self  = $state->{Self};

      $self->{Toolkit}->Logger->notice( "Interrupted by signal: " . shift );

      $state->{Working} = undef;

      unlink $self->{Pid};

      my $Kids = {};

      #
      #   Read kids
      #

      if( opendir( DH, $self->{KidsPid} ) )
      {
        foreach( grep { /^\d+$/ }
                 map  { /^kid\.(\d+)$/ ? $1 : '' } readdir DH )
        {
          if( open( FH, $self->{KidsPid} . '/kid.' . $_ ) )
          {
            $Kids->{$_} = <FH>;
            chomp( $Kids->{$_} );
            close( FH );
          }
        }

        closedir( DH );
      }

      foreach ( keys %{$Kids} )
      {
        next
          unless $_;

        $state->{Children}->{$_} = 1
          if kill 0 => $_;

        delete( $Kids->{$_} );

        unlink $self->{KidsPid} . '/kid.' . $_;
      }

      undef $Kids;

      foreach my $kidpid ( keys %{ $state->{Children} } )
      {
        kill INT => $kidpid;

        undef $@;

        eval
        {
          local $SIG{ALRM} = sub { die "waitpid($kidpid) timeout\012" };

          alarm 2;
          waitpid( $kidpid, 0 );
          alarm 0;
        };

        if ( $@ )
        {
          kill KILL => $kidpid;
          waitpid $kidpid, 0;
        }

        unlink $self->{KidsPid} . '/kid.' . $kidpid;
      }

      exit 0;
    }


    #
    #   Check for spare kids and run new kids
    #

    sub CheckSpareKids
    {
      my $self = shift;

      my $cnf   = $self->{Toolkit}->Config();
      my $state = $self->{Toolkit}->State();

      #
      #   Do fork()
      #

      my $kidpid = fork();

      if   ( !defined( $kidpid ) )
      {
        $self->{Toolkit}->Logger->error( "Fork failed" );

        return 0;
      }
      elsif( $kidpid )
      {
        #
        #   Parent process
        #

        $self->{Toolkit}->Logger->notice( "Kids checker process PID=$kidpid" );

        $state->{Children}->{$kidpid} = 1;

        return $kidpid;
      }
      else
      {
        #
        #   Set proc title
        #

        $0 = $self->{Server}->{ProcTitle} . ' kids checker';

        #
        #   Child process
        #

        POSIX::setsid()
          unless ( $^O eq "MSWin32" );

        $SIG{HUP} = 'IGNORE';

        $SIG{INT} = $SIG{TERM} = sub
        {
          #$state->{Server}->shutdown( 2 );

          $self->{Toolkit}->Logger->notice( "Kids checker interrupted, exiting" );

          exit 0;
        };

        $SIG{__DIE__} = sub
        {
          #$state->{Server}->shutdown( 2 );

          $self->{Toolkit}->Logger->warning( "Died: @_" );

          exit 0;
        };

        $self->{Toolkit}->Logger->notice( "Started" );

        my $Kids  = {};

        while ( 1 )
        {
          $Kids->{0} = 0;

          my $spare  = 0;
          my $total  = 0;

          #
          #   Read kids
          #

          if( opendir( DH, $self->{KidsPid} ) )
          {
            foreach( grep { /^\d+$/ }
                     map  { /^kid\.(\d+)$/ ? $1 : '' } readdir DH )
            {
              if( open( FH, $self->{KidsPid} . '/kid.'.$_ ) )
              {
                $Kids->{$_} = <FH>;
                chomp( $Kids->{$_} );
                close( FH );
              }
            }

            closedir( DH );
          }

          foreach my $kid ( keys %{$Kids} )
          {
            next
              unless $kid;

            unless ( kill 0 => $kid )
            {
              unlink $self->{KidsPid} . '/kid.' . $kid;
            }
            else
            {
              $total++;

              #$spare++     if $Kids->{$kid} < 2 * $self->{Server}->{PrcCheckTime};
              #$Kids->{0}++ if $spare > $self->{Server}->{MaxSpareKids};
              #$Kids->{$kid} = 0;
            }
          }

          #while( $spare <= $self->{Server}->{MinSpareKids} )
          while( $total < $self->{Server}->{MinSpareKids} )
          {
            last
              if $total >= $self->{Server}->{MaxKids};

            #$spare++;
            $total++;

            $self->MakeNewKid();

            sleep 3;
          }

          #
          #   Run this code only once per PRC_CHECK_TIME seconds
          #

          sleep $self->{Server}->{PrcCheckTime};
        }

        exit 0;
      }
    }


# end of the Wildev::AppServer::Core package

1;
