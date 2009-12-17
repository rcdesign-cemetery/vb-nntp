#
#   Copyright © 2008, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Plugins::XHDR;

    #
    #   XHDR handler
    #

    use strict;
    use base qw(RCD::NNTP::Base::Plugin);
    use RCD::NNTP::Plugins::XOVER qw(parse_range);
    use RCD::NNTP::Plugins::ARTICLE qw(parse_message_id);

    our $VERSION = "0.01"; # $Date: 2008/07/20 12:10:56 $


    sub init
    {
      my $self = shift;

      #
      #   Commands handled by this module
      #

      $self->{COMMANDS} = {
          # command => sub
          'xhdr' => 'cmd_xhdr',
        };

      #
      #   Required variables
      #

      #
      #   Supported headers list
      #

      $self->{Headers}  = {
          'from'        => 'from'       ,
          'subject'     => 'subject'    ,
          'message-id'  => 'message_id' ,
          'references'  => 'ref_id'     ,
          'date'        => 'date'       ,
        };
    }


    #   ========================================================================
    #
    #     RFC 2980
    #     http://www.faqs.org/rfcs/rfc2980.html
    #
    #   ------------------------------------------------------------------------
    #
    #   2.6 XHDR
    #
    #     Input parameters:
    #
    #       <header> [<range>|<message-id>]
    #
    #
    #       <header> is the name of a header line (e.g.  "subject")
    #
    #       <range> (optional) may be any of the following:
    #
    #                  an article number
    #                  an article number followed by a dash to indicate
    #                     all following
    #                  an article number followed by a dash followed by
    #                     another article number
    #
    #       <message-id> (optional) indicates a specific article
    #
    #       Message-id is, for example: <groupid>.<messageid>@<groupid>
    #
    #   2.6.1 Responses
    #
    #         221 Header follows
    #         412 No news group current selected
    #         420 No current article selected
    #         430 no such article
    #         502 no permission
    #


    sub cmd_xhdr
    {
      my $self = shift;

      my ( $uuid, $header, $range ) = @_;

      if( $self->check_conditions( $uuid ) )
      {
        if( ! $self->client( $uuid )->{groupid} )
        {
          #
          #   No group selected
          #

          $self->WriteClient(
              $uuid,
              '412 No news group current selected'
            );

          return;
        }

        $header = lc( $header );

        {
          #
          #   Check for suppoted header
          #

          my $is_supported = 0;

          foreach my $test ( keys %{$self->{Headers}} )
          {
            if( $test eq $header )
            {
              $is_supported = 1;
              last;
            }
          }

          unless( $is_supported )
          {
            $self->WriteClient(
                $uuid,
                '221 Header follows'
              );

            $self->WriteClient(
                $uuid,
                '.'
              );

            return;
          }
        }

        #
        #   Save $messageid as copy of $range to parse it as message-id
        #

        my $messageid = $range;

        #
        #   Try to parse as a range
        #

        $range = $self->parse_range( $uuid, $range );

        #
        #   Try to parse as a message-id unless parsed as a range
        #

        unless( scalar( keys %{$range} ) )
        {
          $range = $self->parse_message_id( $uuid, $messageid );
        }

        unless( scalar( keys %{$range} ) )
        {
          #
          #   No current article selected
          #

          $self->WriteClient(
              $uuid,
              '420 no current article has been selected'
            );

          return;
        }

        #
        #   Flush buffer each 50 messages
        #

        my $partvalue = 50;

        my $from = $range->{from};
        my $to;


        $self->WriteClient(
            $uuid,
            '224 Overview information follows'
          );

        while( 1 )
        {
          $to = $from + $partvalue - 1;
          $to = $to > $range->{to} ? $range->{to} : $to;

          #
          #   Client probably went away
          #

          return 0
            unless $self->client( $uuid );

          my $messages = $self->forum( $uuid )->do( {
              do            => 'xover',
              auth_ok       => 'yes',
              nntp_username => $self->client( $uuid )->{username},
              nntp_userid   => $self->client( $uuid )->{userid}  ,
              access        => $self->client( $uuid )->{access}  ,
              groupid       => $range->{groupid},
              messageid     => $range->{id}     ,
              messagefrom   => $from            ,
              messageto     => $to              ,
              match         => $range->{matched},
            } );

          if( ref( $messages ) eq 'ARRAY' )
          {
            foreach my $m ( @{$messages} )
            {
              #
              #   fix some values
              #

              $m->{from} = $m->{from} . ' <nobody@' . $m->{gateid} . '>';
              $m->{to}   = $m->{from};

              $m->{message_id} = $self->build_message_id(  # message id
                  $m->{groupid}   ,
                  $m->{postid}    ,
                  $m->{gateid}    ,
                );

              $m->{ref_id}     = $self->build_ref_id(      # ref id
                  $m->{groupid}   ,
                  $m->{refid}     ,
                  $m->{gateid}    ,
                );

              $self->WriteClient(
                  $uuid,
                  (
                    $range->{matched} eq 'messageid'
                      ? $self->build_message_id(  # message id
                            $m->{groupid}   ,
                            $m->{messageid} ,
                            $m->{gateid}    ,
                          )
                      : $m->{messageid}
                  ) . ' ' . $m->{ $self->{Headers}->{$header} },
                );
            }
          }


          #
          #   Flush buffer
          #

          $self->FlushBuffer( $uuid );

          last
            if $range->{to} <= $to;

          $from += $partvalue;
        }

        $self->WriteClient(
            $uuid,
            '.'
          );
      }

      return;
    }


# end of the RCD::NNTP::Plugins::XHDR package

1;
