# ==============================================================================
#

{   package Digin::Base::Toolkit;
#   Base Toolkit

    use strict;
    use base qw(Class::Accessor::Lvalue);
    use vars qw($VERSION);

    $VERSION = "0.02"; # $Date: 2008/01/10 07:23:58 $


    #__PACKAGE__->mk_accessors( qw() );
    #__PACKAGE__->mk_ro_accessors( qw() );
    #__PACKAGE__->mk_wo_accessors( qw() );


    our $GET_sub_prefix  = 'GET_';
    our $GET_sub_postfix = '';

    our $SET_sub_prefix  = 'SET_';
    our $SET_sub_postfix = '';


    sub new
    {
      my $self = shift;

      $self->instance( @_ );
    }


    sub instance
    {
      my $class = shift;

      no strict 'refs';

      my $instance = \${ "$class\::_instance" };

      defined ${$instance}
        ? ${$instance}
        : ( ${$instance} = $class->_new_instance( @_ ) );
    }


    sub _new_instance
    {
      my $class = shift;

      $class->SUPER::new();
    }


    # --------------------------------------------------------------------------


    sub register
    {
      my $obj = shift;

      foreach my $module ( @_ )
      {
        eval {
          require $module;

          # to import object's methods we need Class::Exporter based classes
          die "Not a Class::Exporter based class"
            unless $module->isa( "Class::Exporter" );

          # if class based on Class::Exporter it have import method anyway
          $module->import();
        };

        die $@ if $@;
      }

      1;
    }


    # --------------------------------------------------------------------------


    # new mutator
    sub set
    {
      my $obj = shift;
      my $key = shift;

      my $class  = ref $obj || $obj;
      my $sub    = "${SET_sub_prefix}${key}${SET_sub_postfix}";

      if   ( defined &{"${class}::$sub"} )
      {
        $obj->{$key} = $obj->$sub( @_ );
      }
      elsif( scalar @_ == 1 )
      {
        $obj->{$key} = $_[0];
      }
      elsif( scalar @_ >  1 )
      {
        $obj->{$key} = [ @_ ];
      }
      else
      {
        $obj->_croak( "Wrong number of arguments received" );
      }
    }


    # new accessor
    sub get
    {
      my $obj = shift;
      my $key = shift;

      my $class  = ref $obj || $obj;
      my $sub    = "${GET_sub_prefix}${key}${GET_sub_postfix}";

      if   ( $key && scalar @_ == 0 )
      {
        $obj->{$key} = $obj->$sub()
          if ! defined $obj->{$key} && defined &{"${class}::$sub"};

        return $obj->{$key};
      }
      elsif( $key && scalar @_ >  0 )
      {
        return @{$obj}{ ( $key, @_ ) };
      }
      else
      {
        $obj->_croak( "Wrong number of arguments received" );
      }
    }


} # end of the Digin::Base::Toolkit package

1;
