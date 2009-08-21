#
#   Copyright © 2009, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Tools::EnvChecker;

    #
    #   Required environment checker:
    #     - perl modules
    #     - database connection
    #     - backend availability
    #     - etc.
    #

    use strict;

    our $VERSION = "0.01"; # $Date: 2009/06/18 23:15:11 $

    use constant TRUE  => 1;
    use constant FALSE => 0;
    use constant EOL   => "\015\012";


    sub new
    {
      my $class = shift;
      my $ref   = ref( $_[0] ) ? $_[0] : { @_ };
      my $obj   = bless $ref => $class;

      $obj->init();

      $obj;
    }


    sub init
    {
      my $self = shift;

      $self->{Modules} = [ qw(
          DBI
          PHP::Serialization
          Storable
          JSON::Syck
          LWP::UserAgent
          Time::HiRes
          IO::Select
          IO::Socket
          POSIX
          Fcntl
          MIME::Base64
          Cache::FastMmap
          Digest::MD5
          Data::UUID
          Class::Accessor::Lvalue
          Log::Handler
          Encode
          Encode::ConfigLocal
          HTML::Entities
          Wildev::AppServer::Toolkit
          RCD::NNTP::Base::Plugin
          RCD::NNTP::Tools::Backend
        ) ];

      1;
    }


    sub check
    {
      my $self = shift;
      my $res  = TRUE;

      #
      #   Check required Perl modules
      #

      foreach my $module ( @{ $self->{Modules} } )
      {
        unless( my $v = $self->_check_module( $_ ) )
        {
          $res = FALSE;
          print "[Fatal Error] Module not installed: " . $_ . EOL;
        }
        #else
        #{
        #  print "[Success] Module " . $_ . " found (v. " . $v . ")" . EOL;
        #}
      }

      #
      #   Check database connection
      #

      if( !$self->_check_db_connection() )
      {
        $res = FALSE;
        print "[Fatal Error] No database connection" . EOL;
      }

      #
      #   Check backend availability
      #

      if( !$self->_check_backend() )
      {
        $res = FALSE;
        print "[Fatal Error] Backend connection error" . EOL;
      }

      $res;
    }


    sub _check_backend
    {
      my $self = shift;
      my $res  = FALSE;

      eval {
        use RCD::NNTP::Base::Plugin;

        my $plugin = RCD::NNTP::Base::Plugin->new();

        my $forum  = $plugin->forum;

        my $message = $forum->do( {
            do      => 'test',
            auth_ok => 'yes',
          } );

        $res = TRUE
          if $message eq 'Ok';

        undef $plugin;
        undef $forum;
      };

      if( $@ )
      {
        $res = FALSE;
        print @_;
      }

      $res;
    }


    sub _check_db_connection
    {
      my $self = shift;
      my $res  = FALSE;

      eval {
        use RCD::NNTP::Base::Plugin;

        my $plugin = RCD::NNTP::Base::Plugin->new();

        my $dbi = $plugin->dbi;

        my @value = $dbi->selectrow_array( "SELECT 1" );

        $res = TRUE
          if scalar( @value ) && $value[0] == 1;

        undef $plugin;
        undef $dbi;
        undef @value;
      };

      if( $@ )
      {
        $res = FALSE;
        print @_;
      }

      $res;
    }


    sub _check_module ($)
    {
      my $self   = shift;
      my $module = shift;
      my $res    = TRUE;

      eval "use $module";

      if( $@ )
      {
        $res = FALSE;
        print @_;
      }
      else
      {
        my $version = 0;

        # try to get installed module version number
        eval '$version = $' . $module . '::VERSION';

        $res = $version unless $@;
      }

      $res;
    }


# end of the RCD::NNTP::Tools::EnvChecker package

1;
