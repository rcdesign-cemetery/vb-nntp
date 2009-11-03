#
#   Copyright © 2009, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Plugins::DATE;

    #
    #   DATE handler
    #

    use strict;
    use base qw(RCD::NNTP::Base::Plugin);

    our $VERSION = "0.01"; # $Date: 2009/11/03 11:03:56 $


    sub init
    {
      my $self = shift;

      #
      #   Commands handled by this module
      #

      $self->{COMMANDS} = {
          # command => sub
          'mode' => 'cmd_date',
        };

      1;
    }


    #   ========================================================================
    #
    #     RFC 3977
    #     http://www.faqs.org/rfcs/rfc3977.html
    #
    #   ------------------------------------------------------------------------
    #
    #   7.1. DATE
    #
    #     No input parameters.
    #     Returns server date and time (UTC).
    #
    #     Responses:
    #
    #       111 yyyymmddhhmmss
    #


    sub cmd_date
    {
      my $self = shift;

      my ( $uuid ) = @_;

      my @gmtime = gmtime;
      
      my $gmtime = sprintf(
          "%04d%02d%02d%02d%02d%02d",
          $gmtime[5] + 1900 , # yyyy
          $gmtime[4] + 1    , # mm
          $gmtime[3]        , # dd
          $gmtime[2]        , # hh
          $gmtime[1]        , # mm
          $gmtime[0]        , # ss
        );

      $self->WriteClient(
          $uuid,
          '111 ' . $gmtime
        );

      return;
    }


# end of the RCD::NNTP::Plugins::DATE package

1;
