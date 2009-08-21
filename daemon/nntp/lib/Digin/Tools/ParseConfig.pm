# ==============================================================================
#

{   package Digin::Tools::ParseConfig;
#   Parse configuration file

    use strict;
    use vars qw($VERSION);

    $VERSION = "0.04"; # $Date: 2007/07/05 23:11:45 $


    sub new
    {
      my $class = shift;

      my $ConfigFile = shift || die( 'No configuration file found' );

      my $obj   = bless {
        'ConfigFile' => $ConfigFile,
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
        ? $obj->{$_[0]}
        : $obj->{ uc( $_[0] ) }->{$_[1]};
    }


    sub _ParseConfig
    {
      my $obj   = shift;
      my $class = ref( $obj ) || $obj;
      $obj      = $class->new( @_ ) unless ref( $obj );

      open( ConfigFile, $obj->{ConfigFile} )
        || die "Can't open config file for reading: $!";

      my $_cname = '';
      while( <ConfigFile> )
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
            $obj->{$key} = $value;
          }
          else
          {
            $obj->{uc( $_cname )}->{$key} = $value;
          }
        }
      }

      close( ConfigFile );

      1;
    }


} # end of the Digin::Tools::ParseConfig package

1;
