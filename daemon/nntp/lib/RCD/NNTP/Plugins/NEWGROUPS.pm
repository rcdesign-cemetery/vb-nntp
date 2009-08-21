#
#   Copyright © 2008, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Plugins::NEWGROUPS;

    #
    #   NEWGROUPS handler
    #

    use strict;
    use base qw(RCD::NNTP::Base::Plugin);

    our $VERSION = "0.01"; # $Date: 2008/07/20 12:10:56 $


    sub init
    {
      my $self = shift;

      #
      #   Commands handled by this module
      #

      $self->{COMMANDS} = {
          # command => sub
          'newgroups' => 'cmd_newgroups',
        };

      1;
    }


    #   ========================================================================
    #
    #     RFC 977
    #     http://www.faqs.org/rfcs/rfc977.html
    #
    #   ------------------------------------------------------------------------
    #
    #   3.7.  The NEWGROUPS command
    #
    #   3.7.1.  NEWGROUPS
    #
    #     Input parameters:
    #
    #       <date> <time> [GMT] [<distributions>]
    #
    #       A list of newsgroups created since <date and time> will be listed
    #       in the same format as the LIST command.
    #
    #       <date> is sent as 6 digits in the format YYMMDD
    #       <time> is sent as 6 digits HHMMSS
    #
    #       The time is assumed to be in the server's timezone unless the
    #       token "GMT" appears, in which case both time and date are evaluated
    #       at the 0 meridian.
    #
    #       <distributions> (optional) is a list of distribution groups
    #
    #     Responses
    #
    #       231 list of new newsgroups follows
    #


    sub cmd_newgroups
    {
      my $self = shift;

      my ( $uuid, $date, $time, $gmt, $dists ) = @_;

      if( $self->checkauth( $uuid ) )
      {
        $self->WriteClient(
            $uuid,
            '231 list of newsgroups follows'
          );

        #
        #   Do not even check for new available groups
        #

        $self->WriteClient(
            $uuid,
            '.'
          );
      }

      return;
    }


# end of the RCD::NNTP::Plugins::NEWGROUPS package

1;
