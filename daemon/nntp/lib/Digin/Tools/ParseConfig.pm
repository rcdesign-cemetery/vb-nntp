# ==============================================================================
#

{   package Digin::Tools::ParseConfig;
#   Parse configuration file

    use strict;
    use vars qw($VERSION);

    $VERSION = "0.05"; # $Date: 2009/12/06 20:17:30 $


    sub new
    {
      my $class = shift;

      my $ConfigFile = shift || die( 'No configuration file found' );

      my $obj   = bless {
        'ConfigFile' => $ConfigFile,
        'Data'       => {},
        @_,
      } => $class;

      $obj->_ParseConfig();

      $obj;
    }


    # $cfg->Get( 'section.name' );
    # $cfg->Get( 'section', 'name' );
    # $cfg->Get( 'name' );
    sub Get ($;$)
    {
      my $obj = shift;

      @_ = split( '\.', shift )
        if 1 == scalar @_;

      1 == scalar @_
        ? $obj->{Data}->{$_[0]}
        : $obj->{Data}->{ uc( $_[0] ) }->{$_[1]};
    }


    # $cfg->Set( 'section.name', $value );
    # $cfg->Set( 'section', 'name', $value );
    sub Set ($$;$)
    {
      my $obj = shift;

      if( 2 > scalar( @_ ) )
      {
        warn "No enough parameters to set value!";
        return;
      }

      #
      #   Value is the very last element of received array of parameters
      #

      my $value = pop @_;

      #
      #   Get parameter path
      #

      @_ = split( '\.', shift )
        if 1 == scalar @_;

      #
      #   Set value
      #

      if   ( 1 == scalar @_ )
      {
        $obj->{Data}->{$_[0]} = $value;
      }
      elsif( 2 == scalar @_ )
      {
        $obj->{Data}->{ uc( $_[0] ) }->{$_[1]} = $value;
      }

      1;
    }


    sub _ParseConfig
    {
      my $obj   = shift;
      my $class = ref( $obj ) || $obj;
      $obj      = $class->new( @_ ) unless ref( $obj );

      my $configdata = $obj->_ReadConfig();
      my $_cname = '';

      foreach $_ ( @{ $configdata } )
      {
        chomp;

        my $_cline = $_;

        next
          unless $_cline !~ /^[\s\t]*#/ && $_cline;

        if( $_cline =~ /^[\s\t]*\[([^\]]+)\][\s\t]*$/ )
        {
          $_cname = $1;
          next;
        }

        if( my ( $key, $value ) =
              #$_cline =~
              #  /^[\s\t]*([^\s\t=#]+)[\s\t]*=[\s\t]*([^#]+[^\s\t=#])/ )
              $_cline =~
                /^[\s\t]*([^\s\t=#]+?)[\s\t]*=[\s\t]*(.+?)([\s\t]+(#.+)?)?$/ )
        {
          $value =~ s/^ +//g;
          $value =~ s/ +$//g;

          $value = $value =~ /^yes$/i
                   ? 1
                   : $value;

          $value = $value =~ /^no$/i
                   ? 0
                   : $value;

          while( $value =~ s/([\w\d])\.\.([\w\d])// )
          {
            $value .= join( '', eval "'$1'..'$2'" );
          }

          # detect an array: [ ..., ..., ]
          $value = $value =~ /^\[\s*([^\]]+?)\s*\]$/
                   ? [ split( /\s*,\s*/, $1 ) ]
                   : $value;

          # detect a hash: { ..., ..., }
          $value = $value =~ /^\{\s*([^\}]+?)\s*\}$/
                   ? { split( /\s*,\s*/, $1 ) }
                   : $value;

          ## detect an array or hash
          #$value = $value =~ /^[\[\{]\s*[^\]]+\s*[\]\}]$/
          #         ? eval $value
          #         : $value;

          if( $_cname =~ /^main$/i || !$_cname )
          {
            $obj->Set( $key, $value );
            #$obj->{Data}->{$key} = $value;
          }
          else
          {
            $obj->Set( $_cname, $key, $value );
            #$obj->{Data}->{ uc( $_cname ) }->{$key} = $value;
          }
        }
      }

      1;
    }


    sub _ReadConfig
    {
      my $obj = shift;

      my $configdata = [];

      if( ref( $obj->{ConfigFile} ) eq 'ARRAY' )
      {
        $configdata = \@{ $obj->{ConfigFile} };
      }
      elsif( ! ref( $obj->{ConfigFile} )
             && $obj->{ConfigFile} !~ /[\r\n]/
             && -e $obj->{ConfigFile}           # file exists
             && -f _                            # "simple" file (not pipe etc.)
             && -T _ )                          # text file
      {
        open( ConfigFile, '<', $obj->{ConfigFile} )
          || die "Can't open config file for reading: $!";
  
        while( <ConfigFile> )
        {
          push @{ $configdata }, $_;
        }

        close( ConfigFile );
      }
      elsif( ! ref( $obj->{ConfigFile} ) )
      {
        # just a text?
        @{ $configdata } = split( /[\r\n]/, $obj->{ConfigFile} );
      }

      $configdata;
    }


} # end of the Digin::Tools::ParseConfig package

1;
