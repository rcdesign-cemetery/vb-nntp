#
#   Copyright © 2008, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Plugins::MODE;

    #
    #   MODE handler
    #

    use strict;
    use base qw(RCD::NNTP::Base::Plugin);

    our $VERSION = "0.01"; # $Date: 2008/10/10 21:45:00 $


    sub init
    {
      my $self = shift;

      #
      #   Commands handled by this module
      #

      $self->{COMMANDS} = {
          # command => sub
          'mode' => 'cmd_mode',
        };

      1;
    }


    #   ========================================================================
    #
    #     RFC 2980
    #     http://www.faqs.org/rfcs/rfc2980.html
    #
    #   ------------------------------------------------------------------------
    #
    #   2.3 MODE READER
    #
    #     No input parameters.
    #
    #     Responses:
    #
    #       200 Hello, you can post
    #       201 Hello, you can't post
    #


    sub cmd_mode
    {
      my $self = shift;

      my ( $uuid, $cmd ) = @_;

      $cmd = uc( $cmd );

      if   ( $cmd eq 'READER' )
      {
        $self->WriteClient(
            $uuid,
            '201 Posting prohibited'
          );
      }
      else
      {
        $self->WriteClient(
            $uuid,
            '501 Command not supported'
          );
      }

      return;
    }


# end of the RCD::NNTP::Plugins::MODE package

1;
