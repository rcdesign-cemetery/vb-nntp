#
#   Copyright © 2008, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Plugins::XOVER;

    #
    #   XOVER handler
    #

    use strict;
    use base qw(RCD::NNTP::Base::Plugin);

    our $VERSION = "0.01"; # $Date: 2008/07/20 12:10:56 $

    our @EXPORT    = qw();
    our @EXPORT_OK = qw(parse_range);


    sub init
    {
      my $self = shift;

      #
      #   Commands handled by this module
      #

      $self->{COMMANDS} = {
          # command => sub
          'xover' => 'cmd_xover',
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
    #   2.8 XOVER
    #
    #     Input parameters:
    #
    #       [<range>]
    #
    #
    #       <range> (optional) may be any of the following:
    #
    #                  an article number
    #                  an article number followed by a dash to indicate
    #                     all following
    #                  an article number followed by a dash followed by
    #                     another article number
    #
    #     Responses:
    #
    #       224 Overview information follows
    #       412 No news group current selected
    #       420 No article(s) selected
    #       502 no permission
    #


    sub cmd_xover
    {
      my $self = shift;

      my ( $uuid, $range ) = @_;

      if( $self->checkauth( $uuid ) )
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

        $range = $self->parse_range( $uuid, $range );

        unless( scalar( keys %{$range} ) )
        {
          #
          #   No article selected
          #

          $self->WriteClient(
              $uuid,
              '420 No article(s) selected'
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
              groupid       => $self->client( $uuid )->{groupid} ,
              messageid     => $range->{id} ,
              messagefrom   => $from        ,
              messageto     => $to          ,
            } );

          if( $messages && ref( $messages ) eq 'ARRAY' )
          {
            foreach my $m ( @{$messages} )
            {
              #
              #   Print message id
              #

              $self->WriteClient(
                  $uuid,
                  join( "\t",
                      $m->{messageid},

                      $m->{subject},                      # subject
                      $m->{from},                         # author
                      $m->{date},                         # date
                      '<' . $self->build_message_id(      # message-id
                          $m->{groupid}   ,
                          $m->{messageid} ,
                          $m->{gateid}    ,
                        ) . '>',
                      '<' . $self->build_ref_id(          # references
                          $m->{groupid}   ,
                          $m->{refid}     ,
                          $m->{gateid}    ,
                        ) . '>',
                      '',                                 # byte count
                      '',                                 # line count
                      '',
                    ),
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


    #
    #   Parse given messages range following RFC 2980
    #   Used by commands: XOVER, XHDR
    #
    #   an article number
    #   an article number followed by a dash to indicate
    #      all following
    #   an article number followed by a dash followed by
    #      another article number
    #

    sub parse_range
    {
      my $self  = shift;
      my $uuid  = shift;
      my $range = shift || '';
      my $res   = {};

      if   ( $range =~ /^(\d+)$/ )
      {
        #
        #   an article number
        #

        $res->{id}   = $1;

        $res->{groupid} = $self->client( $uuid )->{groupid};

        $res->{setid}   = 1;

        $res->{matched} = 'messagenum';
      }
      elsif( $range =~ /^(\d+)\s*\-$/ )
      {
        #
        #   an article number followed by a dash to indicate
        #     all following
        #
        #   from $1 to the very end
        #

        $res->{from} = $1;

        $res->{groupid} = $self->client( $uuid )->{groupid};

        $res->{matched} = 'rangefrom';
      }
      elsif( $range =~ /^(\d+)\s*\-\s*(\d+)$/ )
      {
        #
        #   an article number followed by a dash followed by
        #      another article number
        #
        #   from $1 to $2
        #

        $res->{from} = $1;
        $res->{to}   = $2;

        $res->{groupid} = $self->client( $uuid )->{groupid};

        $res->{matched} = 'rangefromto';
      }


      $res->{messageid} = $res->{id}
        if $res->{id};

      #
      #   Verify if access to this group is granted to user
      #

      if( scalar keys %{ $res } )
      {
        $res->{groupid} = undef
          unless $self->client( $uuid )->{groupids}->{ $res->{groupid} };
      }

      $res;
    }


# end of the RCD::NNTP::Plugins::XOVER package

1;
