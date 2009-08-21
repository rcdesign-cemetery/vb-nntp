# ==============================================================================
#

{   package Digin::Tools::Factory;
#   Class Factory

    use strict;
    use vars qw($VERSION);

    $VERSION = "0.02"; # $Date: 2008/05/01 20:22:53 $


    sub new
    {
      my $class = shift;
      my $obj   = bless { @_ } => $class;

      $obj->Init();

      $obj;
    }


    sub Init
    {
      my $obj   = shift;
      my $class = ref( $obj ) || $obj;
      $obj      = $class->new( @_ ) unless ref( $obj );

      $obj->{NameBase} =~ s{ }{}g if length $obj->{NameBase};
      $obj->{NameBase} .= '::'    if length $obj->{NameBase};

      # show warnings: default = yes
      $obj->{Warnings}  = 1    unless defined $obj->{Warnings};

      $obj->{SearchPaths} ||= [];

      use lib ( @{$obj->{SearchPaths}} );

      1;
    }


    sub Create ($;@)
    {
      my $obj = shift;

      my $ClassName = $obj->{NameBase}.shift;
      my $ClassObj  = undef;
      my @Options;

      my $sub       = 'new';

      # detect optional subroutine instead of 'new'
      while( my $v = shift @_ )
      {
        if( $v eq '-sub' )
        {
          $sub = shift @_;
        }
        else
        {
          push @Options, $v;
        }
      }

      # try to load class
      eval " use $ClassName; ";
      #my $File = $ClassName;
      #my $Ok   = 0;

      #$File =~ s{::}{/}g;

      #foreach my $Base ( @{$obj->{SearchPaths}} )
      #{
      #  $Base =~ s{/$}{};

      #  $Ok   = eval { require "$Base/$File.pm" };

      #  last unless $@;
      #}

      # try create new class object if no errors with class loading
      eval {
        $ClassObj = $ClassName->$sub( @Options );
      } unless $@;
      #} if $Ok;

      # warn if any error acquired on class loading or object creating
      warn $@ if $@ && $obj->{Warnings};

      $ClassObj;
    }


} # end of the Digin::Tools::Factory package

1;